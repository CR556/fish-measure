import CoreGraphics

/// 2D centerline of the fish mask plus per-station widths. Coordinates are
/// mask-space pixels; DepthLifter lifts them to 3D.
struct Centerline2D {
  var points: [CGPoint]        // ordered along the body, ~bins entries
  var widths: [Double]         // mask px, aligned with points
  var tipA: CGPoint            // extreme ends (nose/tail — unordered)
  var tipB: CGPoint
  var widestIndex: Int
  /// Edge endpoints of the widest cross-section (for girth width in 3D).
  var widestEdge1: CGPoint
  var widestEdge2: CGPoint
}

enum CenterlineBuilder {
  static func build(mask: BinaryMask, config: CenterlineConfig) -> Centerline2D? {
    switch config.algorithm {
    case "skeleton":
      return skeleton(mask: mask, bins: config.bins) ?? pca(mask: mask, bins: config.bins)
    default:
      return pca(mask: mask, bins: config.bins)
    }
  }

  // MARK: - PCA slicing (default: fast, good for straight-to-slightly-bent fish)

  static func pca(mask: BinaryMask, bins: Int) -> Centerline2D? {
    // Pass 1: moments.
    var n = 0
    var sx = 0.0, sy = 0.0, sxx = 0.0, syy = 0.0, sxy = 0.0
    for y in 0..<mask.height {
      for x in 0..<mask.width where mask.data[y * mask.width + x] == 1 {
        let dx = Double(x), dy = Double(y)
        n += 1; sx += dx; sy += dy
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy
      }
    }
    guard n > 32 else { return nil }
    let mx = sx / Double(n), my = sy / Double(n)
    let cxx = sxx / Double(n) - mx * mx
    let cyy = syy / Double(n) - my * my
    let cxy = sxy / Double(n) - mx * my
    // Principal axis angle of the 2x2 covariance.
    let theta = 0.5 * atan2(2 * cxy, cxx - cyy)
    let ax = cos(theta), ay = sin(theta)   // along-body axis
    let px = -ay, py = ax                  // perpendicular

    // Pass 2: t-range along the axis.
    var tMin = Double.greatestFiniteMagnitude
    var tMax = -Double.greatestFiniteMagnitude
    for y in 0..<mask.height {
      for x in 0..<mask.width where mask.data[y * mask.width + x] == 1 {
        let t = (Double(x) - mx) * ax + (Double(y) - my) * ay
        if t < tMin { tMin = t }
        if t > tMax { tMax = t }
      }
    }
    let span = tMax - tMin
    guard span > 4 else { return nil }

    // Pass 3: per-bin slice stats (centroid of the slice = centerline point;
    // s-extent = width). Also track the extreme-t pixels as tip candidates.
    var binSumX = [Double](repeating: 0, count: bins)
    var binSumY = [Double](repeating: 0, count: bins)
    var binCount = [Int](repeating: 0, count: bins)
    var binSMin = [Double](repeating: .greatestFiniteMagnitude, count: bins)
    var binSMax = [Double](repeating: -.greatestFiniteMagnitude, count: bins)
    var tipA = CGPoint.zero, tipB = CGPoint.zero
    var bestTMin = Double.greatestFiniteMagnitude
    var bestTMax = -Double.greatestFiniteMagnitude

    for y in 0..<mask.height {
      for x in 0..<mask.width where mask.data[y * mask.width + x] == 1 {
        let rx = Double(x) - mx, ry = Double(y) - my
        let t = rx * ax + ry * ay
        let s = rx * px + ry * py
        var bin = Int((t - tMin) / span * Double(bins))
        bin = max(0, min(bins - 1, bin))
        binSumX[bin] += Double(x); binSumY[bin] += Double(y); binCount[bin] += 1
        if s < binSMin[bin] { binSMin[bin] = s }
        if s > binSMax[bin] { binSMax[bin] = s }
        if t < bestTMin { bestTMin = t; tipA = CGPoint(x: x, y: y) }
        if t > bestTMax { bestTMax = t; tipB = CGPoint(x: x, y: y) }
      }
    }

    var points: [CGPoint] = []
    var widths: [Double] = []
    var binCenters: [(sMid: Double, tCenter: Double)] = []
    for b in 0..<bins where binCount[b] > 0 {
      points.append(CGPoint(x: binSumX[b] / Double(binCount[b]), y: binSumY[b] / Double(binCount[b])))
      widths.append(max(0, binSMax[b] - binSMin[b]))
      let tCenter = tMin + (Double(b) + 0.5) / Double(bins) * span
      binCenters.append((sMid: (binSMin[b] + binSMax[b]) / 2, tCenter: tCenter))
    }
    guard points.count >= max(4, bins / 4) else { return nil }

    // Light smoothing of the slice centroids (window 3).
    points = movingAverage(points)

    // Prepend/append the true tips so arc length reaches nose and tail.
    points.insert(tipA, at: 0)
    points.append(tipB)
    widths.insert(0, at: 0)
    widths.append(0)

    // Widest station, ignoring the outer 15% of stations at each end so a
    // spread tail fin doesn't win over the belly.
    let margin = max(1, points.count * 15 / 100)
    var widestIdx = points.count / 2
    var widest = -1.0
    for i in margin..<(points.count - margin) where widths[i] > widest {
      widest = widths[i]
      widestIdx = i
    }
    // Edge points of the widest slice, reconstructed from axis geometry.
    let wi = min(max(widestIdx - 1, 0), binCenters.count - 1) // account for inserted tip
    let bc = binCenters[wi]
    let cx = mx + bc.tCenter * ax + bc.sMid * px
    let cy = my + bc.tCenter * ay + bc.sMid * py
    let half = widest / 2
    let e1 = CGPoint(x: cx + px * half, y: cy + py * half)
    let e2 = CGPoint(x: cx - px * half, y: cy - py * half)

    return Centerline2D(
      points: points, widths: widths, tipA: tipA, tipB: tipB,
      widestIndex: widestIdx, widestEdge1: e1, widestEdge2: e2)
  }

  // MARK: - Zhang-Suen skeleton (fallback for strongly C-bent fish)

  static func skeleton(mask: BinaryMask, bins: Int) -> Centerline2D? {
    let (small, scale) = mask.downscaled(maxDimension: 256)
    var grid = small.data
    let w = small.width, h = small.height
    guard w > 4, h > 4 else { return nil }

    // Zhang-Suen thinning.
    var changed = true
    var iterations = 0
    while changed && iterations < 200 {
      changed = false
      iterations += 1
      for phase in 0...1 {
        var toClear: [Int] = []
        for y in 1..<(h - 1) {
          for x in 1..<(w - 1) where grid[y * w + x] == 1 {
            let p2 = grid[(y - 1) * w + x], p3 = grid[(y - 1) * w + x + 1]
            let p4 = grid[y * w + x + 1], p5 = grid[(y + 1) * w + x + 1]
            let p6 = grid[(y + 1) * w + x], p7 = grid[(y + 1) * w + x - 1]
            let p8 = grid[y * w + x - 1], p9 = grid[(y - 1) * w + x - 1]
            let ring = [p2, p3, p4, p5, p6, p7, p8, p9]
            let b = ring.reduce(0) { $0 + Int($1) }
            guard b >= 2 && b <= 6 else { continue }
            var a = 0
            for i in 0..<8 where ring[i] == 0 && ring[(i + 1) % 8] == 1 { a += 1 }
            guard a == 1 else { continue }
            let c1 = phase == 0 ? Int(p2) * Int(p4) * Int(p6) : Int(p2) * Int(p4) * Int(p8)
            let c2 = phase == 0 ? Int(p4) * Int(p6) * Int(p8) : Int(p2) * Int(p6) * Int(p8)
            if c1 == 0 && c2 == 0 { toClear.append(y * w + x) }
          }
        }
        if !toClear.isEmpty {
          changed = true
          for i in toClear { grid[i] = 0 }
        }
      }
    }

    // Longest path on the skeleton: BFS from any pixel → farthest u,
    // BFS from u → farthest v, walk parents back.
    var first = -1
    for i in 0..<grid.count where grid[i] == 1 { first = i; break }
    guard first >= 0 else { return nil }
    func bfs(from: Int) -> (far: Int, parent: [Int]) {
      var parent = [Int](repeating: -2, count: grid.count)
      parent[from] = -1
      var queue = [from]
      var far = from
      var head = 0
      while head < queue.count {
        let cur = queue[head]; head += 1
        far = cur
        let cx = cur % w, cy = cur / w
        for dy in -1...1 {
          for dx in -1...1 where dx != 0 || dy != 0 {
            let nx = cx + dx, ny = cy + dy
            guard nx >= 0, nx < w, ny >= 0, ny < h else { continue }
            let ni = ny * w + nx
            if grid[ni] == 1 && parent[ni] == -2 {
              parent[ni] = cur
              queue.append(ni)
            }
          }
        }
      }
      return (far, parent)
    }
    let (u, _) = bfs(from: first)
    let (v, parents) = bfs(from: u)
    var path: [CGPoint] = []
    var cur = v
    while cur >= 0 {
      path.append(CGPoint(x: Double(cur % w) / scale, y: Double(cur / w) / scale))
      cur = parents[cur]
    }
    guard path.count >= 8 else { return nil }

    let sampled = samplePolyline(path, count: bins)
    let smoothed = movingAverage(sampled)

    // Widths by marching perpendicular rays in the full-res mask.
    var widths: [Double] = []
    widths.reserveCapacity(smoothed.count)
    for i in 0..<smoothed.count {
      let prev = smoothed[max(0, i - 1)]
      let next = smoothed[min(smoothed.count - 1, i + 1)]
      var dx = next.x - prev.x, dy = next.y - prev.y
      let len = (dx * dx + dy * dy).squareRoot()
      if len < 1e-9 { widths.append(0); continue }
      dx /= len; dy /= len
      let nx = -dy, ny = dx
      widths.append(rayWidth(mask: mask, at: smoothed[i], nx: nx, ny: ny))
    }
    let margin = max(1, smoothed.count * 15 / 100)
    var widestIdx = smoothed.count / 2
    var widest = -1.0
    for i in margin..<(smoothed.count - margin) where widths[i] > widest {
      widest = widths[i]
      widestIdx = i
    }
    let cw = smoothed[widestIdx]
    let prev = smoothed[max(0, widestIdx - 1)]
    let next = smoothed[min(smoothed.count - 1, widestIdx + 1)]
    var tx = next.x - prev.x, ty = next.y - prev.y
    let tlen = max(1e-9, (tx * tx + ty * ty).squareRoot())
    tx /= tlen; ty /= tlen
    let half = widest / 2
    let e1 = CGPoint(x: cw.x - ty * half, y: cw.y + tx * half)
    let e2 = CGPoint(x: cw.x + ty * half, y: cw.y - tx * half)

    return Centerline2D(
      points: smoothed, widths: widths,
      tipA: smoothed.first ?? .zero, tipB: smoothed.last ?? .zero,
      widestIndex: widestIdx, widestEdge1: e1, widestEdge2: e2)
  }

  // MARK: - Helpers

  private static func rayWidth(mask: BinaryMask, at p: CGPoint, nx: Double, ny: Double) -> Double {
    func march(_ sx: Double, _ sy: Double) -> Double {
      var d = 0.0
      while d < 4096 {
        let x = Int((p.x + sx * d).rounded())
        let y = Int((p.y + sy * d).rounded())
        if !mask.at(x, y) { return d }
        d += 1
      }
      return d
    }
    return march(nx, ny) + march(-nx, -ny)
  }

  private static func movingAverage(_ points: [CGPoint]) -> [CGPoint] {
    guard points.count > 2 else { return points }
    var out = points
    for i in 1..<(points.count - 1) {
      out[i] = CGPoint(
        x: (points[i - 1].x + points[i].x + points[i + 1].x) / 3,
        y: (points[i - 1].y + points[i].y + points[i + 1].y) / 3)
    }
    return out
  }

  /// Uniform arc-length resampling of an open polyline.
  static func samplePolyline(_ points: [CGPoint], count: Int) -> [CGPoint] {
    guard points.count >= 2, count >= 2 else { return points }
    var lengths: [Double] = [0]
    var total = 0.0
    for i in 1..<points.count {
      total += hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
      lengths.append(total)
    }
    guard total > 1e-9 else { return points }
    var out: [CGPoint] = []
    var seg = 0
    for i in 0..<count {
      let target = total * Double(i) / Double(count - 1)
      while seg < points.count - 2 && lengths[seg + 1] < target {
        seg += 1
      }
      let segLen = lengths[seg + 1] - lengths[seg]
      let t = segLen > 1e-9 ? (target - lengths[seg]) / segLen : 0
      out.append(CGPoint(
        x: points[seg].x + (points[seg + 1].x - points[seg].x) * t,
        y: points[seg].y + (points[seg + 1].y - points[seg].y) * t))
    }
    return out
  }
}
