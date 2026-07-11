import CoreVideo
import CoreGraphics

/// Instance label map from Vision subject lifting: one byte per pixel,
/// 0 = background, 1…N = instance index.
struct LabelMap {
  let width: Int
  let height: Int
  let data: [UInt8]

  init?(pixelBuffer: CVPixelBuffer) {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return nil }
    let w = CVPixelBufferGetWidth(pixelBuffer)
    let h = CVPixelBufferGetHeight(pixelBuffer)
    let stride = CVPixelBufferGetBytesPerRow(pixelBuffer)
    var out = [UInt8](repeating: 0, count: w * h)
    let src = base.assumingMemoryBound(to: UInt8.self)
    for y in 0..<h {
      out.withUnsafeMutableBufferPointer { dst in
        memcpy(dst.baseAddress! + y * w, src + y * stride, w)
      }
    }
    width = w
    height = h
    data = out
  }
}

/// Per-instance statistics used for gating and selection, computed in one
/// pass over the label map.
struct InstanceStats {
  var count = 0
  var sumX = 0.0, sumY = 0.0
  var sumXX = 0.0, sumYY = 0.0, sumXY = 0.0
  var minX = Int.max, maxX = Int.min, minY = Int.max, maxY = Int.min

  var centroid: CGPoint {
    count > 0 ? CGPoint(x: sumX / Double(count), y: sumY / Double(count)) : .zero
  }

  /// Elongation = sqrt(λ1/λ2) of the pixel covariance — rotation-invariant
  /// aspect ratio (a torso+arm blob fails the fish gate on this).
  var elongation: Double {
    guard count > 1 else { return 1 }
    let n = Double(count)
    let mx = sumX / n, my = sumY / n
    let cxx = sumXX / n - mx * mx
    let cyy = sumYY / n - my * my
    let cxy = sumXY / n - mx * my
    let tr = cxx + cyy
    let det = cxx * cyy - cxy * cxy
    let disc = max(0, tr * tr / 4 - det)
    let l1 = tr / 2 + disc.squareRoot()
    let l2 = max(tr / 2 - disc.squareRoot(), 1e-9)
    return (l1 / l2).squareRoot()
  }

  var bbox: CGRect {
    guard count > 0 else { return .zero }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
  }

  static func compute(from map: LabelMap) -> [UInt8: InstanceStats] {
    var stats: [UInt8: InstanceStats] = [:]
    var i = 0
    for y in 0..<map.height {
      for x in 0..<map.width {
        let label = map.data[i]
        i += 1
        if label == 0 { continue }
        var s = stats[label] ?? InstanceStats()
        s.count += 1
        let dx = Double(x), dy = Double(y)
        s.sumX += dx; s.sumY += dy
        s.sumXX += dx * dx; s.sumYY += dy * dy; s.sumXY += dx * dy
        if x < s.minX { s.minX = x }; if x > s.maxX { s.maxX = x }
        if y < s.minY { s.minY = y }; if y > s.maxY { s.maxY = y }
        stats[label] = s
      }
    }
    return stats
  }
}

/// Simple binary mask (1 = inside). All heavy mask work happens at Vision's
/// label-map resolution (~small), so plain [UInt8] loops are fast enough.
struct BinaryMask {
  let width: Int
  let height: Int
  var data: [UInt8]

  init(width: Int, height: Int, data: [UInt8]) {
    self.width = width
    self.height = height
    self.data = data
  }

  init(from map: LabelMap, instance: UInt8) {
    width = map.width
    height = map.height
    var out = [UInt8](repeating: 0, count: map.data.count)
    for i in 0..<map.data.count where map.data[i] == instance {
      out[i] = 1
    }
    data = out
  }

  @inline(__always)
  func at(_ x: Int, _ y: Int) -> Bool {
    x >= 0 && x < width && y >= 0 && y < height && data[y * width + x] == 1
  }

  var area: Int { data.reduce(into: 0) { $0 += Int($1) } }

  /// Removes pixels covered by `other` (sampled nearest-neighbor from its own
  /// resolution) after eroding `other` by `erosionPx` so a generous person
  /// mask doesn't eat the fish held against the angler.
  mutating func subtract(_ other: BinaryMask, erosionPx: Int) {
    let eroded = erosionPx > 0 ? other.eroded(by: erosionPx) : other
    let sx = Double(eroded.width) / Double(width)
    let sy = Double(eroded.height) / Double(height)
    for y in 0..<height {
      let oy = min(eroded.height - 1, Int(Double(y) * sy))
      for x in 0..<width where data[y * width + x] == 1 {
        let ox = min(eroded.width - 1, Int(Double(x) * sx))
        if eroded.data[oy * eroded.width + ox] == 1 {
          data[y * width + x] = 0
        }
      }
    }
  }

  /// Separable binary erosion (horizontal then vertical window-AND).
  func eroded(by radius: Int) -> BinaryMask {
    guard radius > 0 else { return self }
    var horiz = [UInt8](repeating: 0, count: data.count)
    for y in 0..<height {
      let row = y * width
      for x in 0..<width {
        var keep: UInt8 = 1
        for dx in -radius...radius {
          let nx = x + dx
          if nx < 0 || nx >= width || data[row + nx] == 0 { keep = 0; break }
        }
        horiz[row + x] = keep
      }
    }
    var out = [UInt8](repeating: 0, count: data.count)
    for y in 0..<height {
      for x in 0..<width {
        var keep: UInt8 = 1
        for dy in -radius...radius {
          let ny = y + dy
          if ny < 0 || ny >= height || horiz[ny * width + x] == 0 { keep = 0; break }
        }
        out[y * width + x] = keep
      }
    }
    return BinaryMask(width: width, height: height, data: out)
  }

  /// Nearest-neighbor downscale so skeleton thinning stays cheap.
  func downscaled(maxDimension: Int) -> (mask: BinaryMask, scale: Double) {
    let longest = max(width, height)
    guard longest > maxDimension else { return (self, 1) }
    let scale = Double(maxDimension) / Double(longest)
    let nw = max(1, Int(Double(width) * scale))
    let nh = max(1, Int(Double(height) * scale))
    var out = [UInt8](repeating: 0, count: nw * nh)
    for y in 0..<nh {
      let sy = min(height - 1, Int(Double(y) / scale))
      for x in 0..<nw {
        let sx = min(width - 1, Int(Double(x) / scale))
        out[y * nw + x] = data[sy * width + sx]
      }
    }
    return (BinaryMask(width: nw, height: nh, data: out), scale)
  }
}

/// Binary confidence mask from a Vision person-segmentation buffer
/// (OneComponent8, 0–255).
func personMask(from pixelBuffer: CVPixelBuffer, threshold: UInt8 = 128) -> BinaryMask? {
  CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
  guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return nil }
  let w = CVPixelBufferGetWidth(pixelBuffer)
  let h = CVPixelBufferGetHeight(pixelBuffer)
  let stride = CVPixelBufferGetBytesPerRow(pixelBuffer)
  let src = base.assumingMemoryBound(to: UInt8.self)
  var out = [UInt8](repeating: 0, count: w * h)
  for y in 0..<h {
    for x in 0..<w where src[y * stride + x] >= threshold {
      out[y * w + x] = 1
    }
  }
  return BinaryMask(width: w, height: h, data: out)
}
