import CoreGraphics

/// Mask → outline polygon: Moore-neighbor border trace, Douglas-Peucker
/// simplification, then arc-length resampling to a fixed point count so the
/// JS ghost-outline morph is a trivial per-vertex lerp.
enum ContourTracer {
  /// Traces the outer boundary of the largest structure in the mask.
  /// Points are mask-space pixel coordinates.
  static func trace(mask: BinaryMask, maxPoints: Int) -> [CGPoint] {
    guard let start = findStart(mask) else { return [] }
    let boundary = mooreTrace(mask: mask, start: start)
    guard boundary.count >= 8 else { return [] }
    let simplified = douglasPeucker(boundary, epsilon: 1.5)
    return resample(simplified, count: maxPoints)
  }

  /// First inside pixel in scan order whose left neighbor is outside — a
  /// guaranteed boundary pixel of some blob (the selected instance is a
  /// single Vision instance, so "some blob" is the fish).
  private static func findStart(_ mask: BinaryMask) -> (x: Int, y: Int)? {
    for y in 0..<mask.height {
      for x in 0..<mask.width where mask.at(x, y) && !mask.at(x - 1, y) {
        return (x, y)
      }
    }
    return nil
  }

  /// Moore-neighbor tracing with Jacob's stopping criterion.
  private static func mooreTrace(mask: BinaryMask, start: (x: Int, y: Int)) -> [CGPoint] {
    // Clockwise neighborhood starting from W.
    let nbr = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]
    var points: [CGPoint] = []
    var current = start
    var backtrack = 0 // index into nbr of the direction we came FROM (start: W)
    let maxSteps = mask.width * mask.height // hard safety bound
    var steps = 0

    repeat {
      points.append(CGPoint(x: current.x, y: current.y))
      var found = false
      // Search clockwise starting just after the backtrack direction.
      for k in 0..<8 {
        let idx = (backtrack + 1 + k) % 8
        let cand = (current.x + nbr[idx].0, current.y + nbr[idx].1)
        if mask.at(cand.0, cand.1) {
          // New backtrack = direction pointing back to the previous pixel.
          backtrack = (idx + 4) % 8
          current = cand
          found = true
          break
        }
      }
      if !found { break } // isolated pixel
      steps += 1
    } while (current.x != start.x || current.y != start.y) && steps < maxSteps

    return points
  }

  private static func douglasPeucker(_ points: [CGPoint], epsilon: Double) -> [CGPoint] {
    guard points.count > 2 else { return points }
    var keep = [Bool](repeating: false, count: points.count)
    keep[0] = true
    keep[points.count - 1] = true
    var stack: [(Int, Int)] = [(0, points.count - 1)]

    while let (a, b) = stack.popLast() {
      guard b > a + 1 else { continue }
      var maxDist = 0.0
      var maxIdx = a
      for i in (a + 1)..<b {
        let d = perpendicularDistance(points[i], points[a], points[b])
        if d > maxDist {
          maxDist = d
          maxIdx = i
        }
      }
      if maxDist > epsilon {
        keep[maxIdx] = true
        stack.append((a, maxIdx))
        stack.append((maxIdx, b))
      }
    }
    return points.indices.compactMap { keep[$0] ? points[$0] : nil }
  }

  private static func perpendicularDistance(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> Double {
    let dx = b.x - a.x, dy = b.y - a.y
    let len = (dx * dx + dy * dy).squareRoot()
    guard len > 1e-9 else {
      return ((p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y)).squareRoot()
    }
    return abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len
  }

  /// Uniform arc-length resampling of a closed polygon to exactly `count`
  /// points, preserving start-point stability frame to frame.
  static func resample(_ points: [CGPoint], count: Int) -> [CGPoint] {
    guard points.count >= 3, count >= 3 else { return points }
    var lengths: [Double] = [0]
    var total = 0.0
    for i in 0..<points.count {
      let a = points[i]
      let b = points[(i + 1) % points.count]
      total += hypot(b.x - a.x, b.y - a.y)
      lengths.append(total)
    }
    guard total > 1e-9 else { return points }

    var out: [CGPoint] = []
    out.reserveCapacity(count)
    var seg = 0
    for i in 0..<count {
      let target = total * Double(i) / Double(count)
      while seg < points.count - 1 && lengths[seg + 1] < target {
        seg += 1
      }
      let a = points[seg]
      let b = points[(seg + 1) % points.count]
      let segLen = lengths[seg + 1] - lengths[seg]
      let t = segLen > 1e-9 ? (target - lengths[seg]) / segLen : 0
      out.append(CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t))
    }
    return out
  }
}
