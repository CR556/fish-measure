import CoreGraphics
import simd

struct GirthResult {
  var girthM: Double
  var method: String // "ellipse-bulge" | "ellipse-aspect"
}

/// Single-view girth estimate at the widest body station: the visible width
/// gives the ellipse's major axis; the depth bulge (center nearer than the
/// silhouette edges) gives the minor semi-axis when it's trustworthy,
/// otherwise a body-shape aspect ratio fills in. Explicitly an estimate —
/// the calibration multiplier is a JS prop.
enum GirthEstimator {
  static func estimate(
    centerline: Centerline2D,
    lifted: LiftedCenterline,
    maskWidth: Int,
    maskHeight: Int,
    frame: FrameInput,
    config: GirthConfig,
    depthRadius: Int,
    minDepthConfidence: Int,
    orientationMode: Int
  ) -> GirthResult? {
    let z = lifted.zAtWidest
    guard z > 0.05 else { return nil }

    func sensorPx(_ p: CGPoint) -> CGPoint {
      let norm = CGPoint(x: p.x / Double(maskWidth), y: p.y / Double(maskHeight))
      let sn = Orientation.orientedToSensorNorm(norm, mode: orientationMode)
      return CGPoint(x: sn.x * Double(frame.imageWidth), y: sn.y * Double(frame.imageHeight))
    }

    // Width in meters: both silhouette edges unprojected at the fitted body
    // depth (the tangent silhouette sits at ≈ the centerline depth).
    let e1s = sensorPx(centerline.widestEdge1)
    let e2s = sensorPx(centerline.widestEdge2)
    let w1 = CameraMath.toWorld(
      CameraMath.unproject(u: e1s.x, v: e1s.y, depth: z, intrinsics: frame.intrinsics),
      transform: frame.cameraTransform)
    let w2 = CameraMath.toWorld(
      CameraMath.unproject(u: e2s.x, v: e2s.y, depth: z, intrinsics: frame.intrinsics),
      transform: frame.cameraTransform)
    let width = Double(simd_length(w1 - w2))
    guard width > 0.01, width < 1.0 else { return nil }

    let a = width / 2
    var b = a * config.aspect
    var method = "ellipse-aspect"

    if config.useDepthBulge, let sampler = DepthSampler(
      depthMap: frame.depthMap,
      confidenceMap: frame.confidenceMap,
      minConfidence: minDepthConfidence
    ) {
      // Center of the widest slice + two points inset 20% from each edge.
      let cx = (centerline.widestEdge1.x + centerline.widestEdge2.x) / 2
      let cy = (centerline.widestEdge1.y + centerline.widestEdge2.y) / 2
      let i1 = CGPoint(x: cx + (centerline.widestEdge1.x - cx) * 0.6,
                       y: cy + (centerline.widestEdge1.y - cy) * 0.6)
      let i2 = CGPoint(x: cx + (centerline.widestEdge2.x - cx) * 0.6,
                       y: cy + (centerline.widestEdge2.y - cy) * 0.6)
      let zc = sampler.medianDepth(atSensorPx: sensorPx(CGPoint(x: cx, y: cy)),
                                   imageWidth: frame.imageWidth, imageHeight: frame.imageHeight,
                                   radius: depthRadius)
      let z1 = sampler.medianDepth(atSensorPx: sensorPx(i1),
                                   imageWidth: frame.imageWidth, imageHeight: frame.imageHeight,
                                   radius: depthRadius)
      let z2 = sampler.medianDepth(atSensorPx: sensorPx(i2),
                                   imageWidth: frame.imageWidth, imageHeight: frame.imageHeight,
                                   radius: depthRadius)
      if let zc, let z1, let z2 {
        let bulge = max(z1, z2) - zc
        // Trustworthy only when clearly positive and physically plausible.
        if bulge > 0.003 && bulge < width {
          b = bulge
          method = "ellipse-bulge"
        }
      }
    }

    // Ramanujan's ellipse-perimeter approximation.
    let perimeter = Double.pi * (3 * (a + b) - ((3 * a + b) * (a + 3 * b)).squareRoot())
    return GirthResult(girthM: perimeter * config.calibration, method: method)
  }
}
