import CoreGraphics
import simd

struct ManualPathResult {
  var curvedM: Double
  var chordM: Double
  var sampleCount: Int
  var validFraction: Double
  /// Lifted path in world space (endpoints = the anchors), for capture overlay.
  var worldPath: [SIMD3<Float>]
}

/// Manual two-point measurement that follows the surface between the anchors:
/// sample the current frame's depth along the screen-space segment, lift each
/// sample to 3D, and sum the polyline. Endpoints stay pinned to the raycast
/// anchors (more accurate than depth-map reads at a point). Falls back to the
/// straight chord when the depth line is too holey to trust.
enum ManualPathMeasurer {
  static func measure(
    worldA: SIMD3<Float>,
    worldB: SIMD3<Float>,
    frame: FrameInput,
    samples: Int,
    depthRadius: Int,
    minDepthConfidence: Int
  ) -> ManualPathResult {
    let chord = Double(simd_length(worldB - worldA))
    var result = ManualPathResult(
      curvedM: chord, chordM: chord, sampleCount: 0, validFraction: 0,
      worldPath: [worldA, worldB])

    let inverse = frame.cameraTransform.inverse
    func toCam(_ w: SIMD3<Float>) -> SIMD3<Float> {
      let v = inverse * SIMD4<Float>(w.x, w.y, w.z, 1)
      return SIMD3<Float>(v.x, v.y, v.z)
    }
    let camA = toCam(worldA)
    let camB = toCam(worldB)
    guard let pxA = CameraMath.projectToSensor(camA, intrinsics: frame.intrinsics),
          let pxB = CameraMath.projectToSensor(camB, intrinsics: frame.intrinsics),
          let sampler = DepthSampler(
            depthMap: frame.depthMap,
            confidenceMap: frame.confidenceMap,
            minConfidence: minDepthConfidence)
    else { return result }

    let count = max(4, min(256, samples))
    let depthA = Double(-camA.z)
    let depthB = Double(-camB.z)
    var lifted: [(t: Double, world: SIMD3<Float>)] = []
    var valid = 0

    for i in 1..<count {
      let t = Double(i) / Double(count)
      let px = CGPoint(x: pxA.x + (pxB.x - pxA.x) * t, y: pxA.y + (pxB.y - pxA.y) * t)
      guard px.x >= 0, px.x < Double(frame.imageWidth),
            px.y >= 0, px.y < Double(frame.imageHeight),
            let z = sampler.medianDepth(
              atSensorPx: px, imageWidth: frame.imageWidth,
              imageHeight: frame.imageHeight, radius: depthRadius)
      else { continue }
      // Reject samples that clearly left the body (background seen through a
      // gap, or a hand in front): the surface between the anchors can't be
      // far from the interpolated anchor depth.
      let expected = depthA + (depthB - depthA) * t
      guard abs(z - expected) < 0.25 else { continue }
      let cam = CameraMath.unproject(u: px.x, v: px.y, depth: z, intrinsics: frame.intrinsics)
      lifted.append((t, CameraMath.toWorld(cam, transform: frame.cameraTransform)))
      valid += 1
    }

    result.sampleCount = count - 1
    result.validFraction = Double(valid) / Double(count - 1)
    guard result.validFraction >= 0.5 else { return result } // chord fallback

    var path: [SIMD3<Float>] = [worldA]
    path.append(contentsOf: lifted.sorted { $0.t < $1.t }.map(\.world))
    path.append(worldB)

    var curved = 0.0
    for i in 1..<path.count {
      curved += Double(simd_length(path[i] - path[i - 1]))
    }
    result.curvedM = max(curved, chord)
    result.worldPath = path
    return result
  }
}
