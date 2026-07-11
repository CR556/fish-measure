import CoreGraphics
import CoreVideo
import simd

/// Locked, confidence-filtered access to one frame's depth map. Lock is held
/// for the object's lifetime — create, sample, discard within one pipeline tick.
final class DepthSampler {
  let depthWidth: Int
  let depthHeight: Int
  private let depthMap: CVPixelBuffer
  private let confidenceMap: CVPixelBuffer?
  private let depthBase: UnsafePointer<Float32>
  private let depthStride: Int // in Float32 elements
  private let confBase: UnsafePointer<UInt8>?
  private let confStride: Int
  private let minConfidence: UInt8

  init?(depthMap: CVPixelBuffer, confidenceMap: CVPixelBuffer?, minConfidence: Int) {
    self.depthMap = depthMap
    self.confidenceMap = confidenceMap
    self.minConfidence = UInt8(max(0, min(2, minConfidence)))

    CVPixelBufferLockBaseAddress(depthMap, .readOnly)
    guard let base = CVPixelBufferGetBaseAddress(depthMap) else {
      CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
      return nil
    }
    depthWidth = CVPixelBufferGetWidth(depthMap)
    depthHeight = CVPixelBufferGetHeight(depthMap)
    depthBase = base.assumingMemoryBound(to: Float32.self)
    depthStride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.size

    if let conf = confidenceMap {
      CVPixelBufferLockBaseAddress(conf, .readOnly)
      if let cbase = CVPixelBufferGetBaseAddress(conf) {
        confBase = cbase.assumingMemoryBound(to: UInt8.self)
        confStride = CVPixelBufferGetBytesPerRow(conf)
      } else {
        confBase = nil
        confStride = 0
      }
    } else {
      confBase = nil
      confStride = 0
    }
  }

  deinit {
    CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
    if let conf = confidenceMap {
      CVPixelBufferUnlockBaseAddress(conf, .readOnly)
    }
  }

  @inline(__always)
  private func rawDepth(_ x: Int, _ y: Int) -> Double? {
    guard x >= 0, x < depthWidth, y >= 0, y < depthHeight else { return nil }
    if let conf = confBase, conf[y * confStride + x] < minConfidence { return nil }
    let d = Double(depthBase[y * depthStride + x])
    guard d.isFinite, d > 0.05, d < 15 else { return nil }
    return d
  }

  /// Median of the valid depths in a (2r+1)² window around a sensor-space
  /// pixel. Returns nil when fewer than a third of the window is valid —
  /// specular dropout country.
  func medianDepth(atSensorPx p: CGPoint, imageWidth: Int, imageHeight: Int, radius: Int) -> Double? {
    let dx = Int((p.x / Double(imageWidth) * Double(depthWidth)).rounded())
    let dy = Int((p.y / Double(imageHeight) * Double(depthHeight)).rounded())
    var vals: [Double] = []
    vals.reserveCapacity((2 * radius + 1) * (2 * radius + 1))
    for oy in -radius...radius {
      for ox in -radius...radius {
        if let d = rawDepth(dx + ox, dy + oy) {
          vals.append(d)
        }
      }
    }
    let window = (2 * radius + 1) * (2 * radius + 1)
    guard vals.count * 3 >= window else { return nil }
    vals.sort()
    return vals[vals.count / 2]
  }
}

struct LiftedCenterline {
  var world: [SIMD3<Float>]      // one per 2D centerline point
  var curvedM: Double            // arc length nose→tail
  var chordM: Double             // straight tip-to-tip
  var coverage: Double           // fraction of stations with real (unfitted) depth
  var dropoutFraction: Double
  var zAtWidest: Double          // fitted depth at the girth station
  var centroidDistanceM: Double  // camera → mid-body, for range gating
}

/// Lifts the 2D centerline into 3D. The load-bearing choices:
/// - x/y extent comes from the high-res mask; only z comes from the 256×192
///   depth map, so depth resolution limits z noise, not length resolution.
/// - z along the body is a robust low-degree polynomial fit with MAD outlier
///   rejection — wet-fish specular dropouts and edge bleed get rejected and
///   interpolated instead of corrupting the arc length.
/// - Endpoint z always comes from the fit: raw depth at a thin tail tip or a
///   glossy nose is exactly where the sensor lies.
enum DepthLifter {
  static func lift(
    centerline: Centerline2D,
    maskWidth: Int,
    maskHeight: Int,
    frame: FrameInput,
    config: CenterlineConfig,
    minDepthConfidence: Int,
    orientationMode: Int
  ) -> LiftedCenterline? {
    guard centerline.points.count >= 4 else { return nil }
    guard let sampler = DepthSampler(
      depthMap: frame.depthMap,
      confidenceMap: frame.confidenceMap,
      minConfidence: minDepthConfidence
    ) else { return nil }

    // Arc-length parameterization t ∈ [0,1] in mask space.
    let pts = centerline.points
    var cumulative: [Double] = [0]
    var total = 0.0
    for i in 1..<pts.count {
      total += hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
      cumulative.append(total)
    }
    guard total > 1 else { return nil }
    let ts = cumulative.map { $0 / total }

    // Sensor-space pixel for each centerline point.
    let sensorPts: [CGPoint] = pts.map { p in
      let norm = CGPoint(x: p.x / Double(maskWidth), y: p.y / Double(maskHeight))
      let sn = Orientation.orientedToSensorNorm(norm, mode: orientationMode)
      return CGPoint(x: sn.x * Double(frame.imageWidth), y: sn.y * Double(frame.imageHeight))
    }

    // Raw depth samples.
    var sampleT: [Double] = []
    var sampleZ: [Double] = []
    var validAt = [Bool](repeating: false, count: pts.count)
    for i in 0..<pts.count {
      if let z = sampler.medianDepth(
        atSensorPx: sensorPts[i],
        imageWidth: frame.imageWidth,
        imageHeight: frame.imageHeight,
        radius: config.depthSampleRadiusPx
      ) {
        sampleT.append(ts[i])
        sampleZ.append(z)
        validAt[i] = true
      }
    }

    let coverage = Double(sampleZ.count) / Double(pts.count)
    guard coverage >= config.minValidBinFraction else { return nil }

    // Longest dropout run must stay interpolable.
    var run = 0, maxRun = 0
    for v in validAt {
      run = v ? 0 : run + 1
      maxRun = max(maxRun, run)
    }
    guard Double(maxRun) / Double(pts.count) <= config.maxGapBinFraction else { return nil }

    // Robust polynomial fit z(t), then evaluate at every station.
    let degree = max(1, min(4, config.depthFitDegree))
    guard var coeffs = PolyFit.fit(x: sampleT, y: sampleZ, degree: degree) else { return nil }
    for _ in 0..<2 {
      let residuals = zip(sampleT, sampleZ).map { $1 - PolyFit.eval(coeffs, $0) }
      let sortedAbs = residuals.map { abs($0) }.sorted()
      let mad = sortedAbs[sortedAbs.count / 2]
      let sigma = max(1.4826 * mad, 0.002) // ≥2 mm floor so we never reject everything
      var keptT: [Double] = [], keptZ: [Double] = []
      for (i, r) in residuals.enumerated() where abs(r) <= sigma * config.outlierRejectSigma {
        keptT.append(sampleT[i])
        keptZ.append(sampleZ[i])
      }
      guard keptT.count >= degree + 2,
            let refit = PolyFit.fit(x: keptT, y: keptZ, degree: degree) else { break }
      coeffs = refit
    }

    // Unproject every station with fitted z.
    var world: [SIMD3<Float>] = []
    world.reserveCapacity(pts.count)
    for i in 0..<pts.count {
      let z = PolyFit.eval(coeffs, ts[i])
      guard z > 0.05, z < 15 else { return nil }
      let cam = CameraMath.unproject(
        u: sensorPts[i].x, v: sensorPts[i].y, depth: z, intrinsics: frame.intrinsics)
      world.append(CameraMath.toWorld(cam, transform: frame.cameraTransform))
    }

    var curved = 0.0
    for i in 1..<world.count {
      curved += Double(simd_length(world[i] - world[i - 1]))
    }
    let chord = Double(simd_length(world[world.count - 1] - world[0]))
    // A polyline through its own endpoints can't be shorter than the chord;
    // if numeric noise says otherwise, the frame is garbage.
    guard curved >= chord * 0.999 else { return nil }

    let camPos = SIMD3<Float>(
      frame.cameraTransform.columns.3.x,
      frame.cameraTransform.columns.3.y,
      frame.cameraTransform.columns.3.z)
    let mid = world[world.count / 2]
    let widestIdx = min(centerline.widestIndex, ts.count - 1)

    return LiftedCenterline(
      world: world,
      curvedM: curved,
      chordM: chord,
      coverage: coverage,
      dropoutFraction: 1 - coverage,
      zAtWidest: PolyFit.eval(coeffs, ts[widestIdx]),
      centroidDistanceM: Double(simd_length(mid - camPos)))
  }
}

/// Least-squares polynomial fit via normal equations in double precision —
/// plenty for degree ≤ 4 over t ∈ [0,1] with ~48 samples.
enum PolyFit {
  static func fit(x: [Double], y: [Double], degree: Int) -> [Double]? {
    let n = x.count
    let m = degree + 1
    guard n >= m else { return nil }

    // Build A^T A (m×m) and A^T y (m).
    var ata = [Double](repeating: 0, count: m * m)
    var aty = [Double](repeating: 0, count: m)
    for k in 0..<n {
      var powers = [Double](repeating: 1, count: 2 * m - 1)
      for p in 1..<(2 * m - 1) {
        powers[p] = powers[p - 1] * x[k]
      }
      for i in 0..<m {
        aty[i] += powers[i] * y[k]
        for j in 0..<m {
          ata[i * m + j] += powers[i + j]
        }
      }
    }

    // Gaussian elimination with partial pivoting.
    var a = ata
    var b = aty
    for col in 0..<m {
      var pivot = col
      for row in (col + 1)..<m where abs(a[row * m + col]) > abs(a[pivot * m + col]) {
        pivot = row
      }
      guard abs(a[pivot * m + col]) > 1e-12 else { return nil }
      if pivot != col {
        for j in 0..<m {
          a.swapAt(col * m + j, pivot * m + j)
        }
        b.swapAt(col, pivot)
      }
      let inv = 1 / a[col * m + col]
      for row in (col + 1)..<m {
        let f = a[row * m + col] * inv
        if f == 0 { continue }
        for j in col..<m {
          a[row * m + j] -= f * a[col * m + j]
        }
        b[row] -= f * b[col]
      }
    }
    var out = [Double](repeating: 0, count: m)
    for row in stride(from: m - 1, through: 0, by: -1) {
      var acc = b[row]
      for j in (row + 1)..<m {
        acc -= a[row * m + j] * out[j]
      }
      out[row] = acc / a[row * m + row]
    }
    return out
  }

  static func eval(_ coeffs: [Double], _ x: Double) -> Double {
    var acc = 0.0
    for c in coeffs.reversed() {
      acc = acc * x + c
    }
    return acc
  }
}
