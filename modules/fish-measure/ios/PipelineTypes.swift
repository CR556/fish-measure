import ARKit
import CoreGraphics
import simd

// All pipeline tunables mirror JS props 1:1 — tuning never requires a rebuild.

struct SegmentationConfig {
  var hz: Double = 10
  var depthSource: String = "smoothed" // "raw" | "smoothed"
  var minDepthConfidence: Int = 1      // ARConfidenceLevel raw value floor
  var personExclusion: Bool = true
  /// >0 shrinks the person mask; <0 GROWS it. Default grows 2px so arms the
  /// person model misses still get carved away from the fish.
  var personMaskErosionPx: Int = -2
  /// 0 = .balanced (fast), 1 = .accurate (better bare-arm coverage, slower).
  var personSegQuality: Int = 0
  /// Trim mask pixels whose LiDAR depth deviates from the fish's median by
  /// more than this (meters). Kills background clutter merged into the
  /// subject (cord/branches/structure behind the fish). 0 disables.
  var depthTrimM: Double = 0.2
  var minAreaFraction: Double = 0.02
  var maxAreaFraction: Double = 0.6
  /// 1.5 floor keeps deep-bodied panfish (bluegill ≈ 1.5:1) in play.
  var minAspectRatio: Double = 1.5
  var maxAspectRatio: Double = 10
  var priorityRegion: CGRect?          // normalized view coords
  var segmenterModelPath: String?
  /// 0 = .right (portrait default), 1 = .left, 2 = .up, 3 = .down.
  /// Field-tunable escape hatch in case the orientation assumption is wrong
  /// on some device — switching it re-maps Vision input and all coordinate
  /// conversions together.
  var orientationMode: Int = 0
}

struct ClassifierConfig {
  var enabled = true
  var hz: Double = 2
  /// VNClassifyImageRequest labels counted as fish evidence. JS owns this
  /// list — the M1 spike streams raw top-5 so it can be tuned live.
  /// "animal" earned its place from field top-5 data: a real held fish read
  /// animal/fish/trout at ~19% each.
  var acceptLabels: [String] = ["fish", "salmon", "trout", "bass", "carp", "goldfish", "koi", "pike", "catfish", "perch", "animal"]
  var minConfidence: Double = 0.12
  /// NO person veto: the angler is in nearly every legit catch crop, and
  /// "person" outscoring "trout 19%" was blocking real locks in the field.
  var vetoLabels: [String] = ["footwear", "shoe", "sneaker", "boot", "rock", "stone"]
  var modelPath: String?
  /// Field default TRUE: rocks and shoes were locking without it. A green
  /// lock now needs some fish-ish classifier evidence.
  var required = true
}

struct CenterlineConfig {
  var algorithm: String = "pca"        // "pca" | "skeleton"
  var bins: Int = 48
  var depthSampleRadiusPx: Int = 2
  var depthFitDegree: Int = 3
  var outlierRejectSigma: Double = 2.5
  var maxGapBinFraction: Double = 0.35
  var minValidBinFraction: Double = 0.4
}

struct GirthConfig {
  var aspect: Double = 0.5
  var useDepthBulge = true
  var calibration: Double = 1.0
}

struct StabilityConfig {
  var windowMs: Double = 750
  // Handheld reality: ±0.5 cm never happened in the field; auto-capture
  // never fired. ~1 cm / 2.5% is still a tight, honest reading.
  var maxDeltaCm: Double = 1.0
  var maxDeltaFraction: Double = 0.025
  var minDistanceM: Double = 0.3
  var maxDistanceM: Double = 2.5
  var minDepthCoverage: Double = 0.55
}

struct OverlayConfig {
  var contourMaxPoints = 120
  var emitCenterline = true
}

struct PipelineConfig {
  var segmentation = SegmentationConfig()
  var classifier = ClassifierConfig()
  var centerline = CenterlineConfig()
  var girth = GirthConfig()
  var stability = StabilityConfig()
  var overlay = OverlayConfig()
  var debugMode = false
}

/// Everything the pipeline needs from one ARFrame, captured on the session
/// thread so the ARFrame itself can be released immediately (retaining frames
/// starves ARKit's frame pool). Pixel buffers are CF-retained by the struct.
struct FrameInput {
  let capturedImage: CVPixelBuffer
  let depthMap: CVPixelBuffer
  let confidenceMap: CVPixelBuffer?
  let intrinsics: simd_float3x3        // for capturedImage resolution
  let cameraTransform: simd_float4x4
  let imageWidth: Int
  let imageHeight: Int
  /// Normalized captured-image coords → normalized view coords (portrait,
  /// aspect-fill). From ARFrame.displayTransform.
  let displayTransform: CGAffineTransform
  let viewSize: CGSize
  let timestamp: TimeInterval
}

struct SubjectSnapshot {
  var state = "none"                   // none | candidate | locked
  var contourView: [CGPoint] = []
  var bboxView = CGRect.zero
  var selectedBy: String?              // tap | region | largest
  var instanceCount = 0
  var areaFraction = 0.0
  var aspectRatio = 0.0
  var classifierTop: [(label: String, confidence: Double)] = []
  var fishScore = 0.0
  var timestamp: Double = 0
}

struct MeasurementSnapshot {
  var valid = false
  var curvedM = 0.0                    // smoothed headline value
  var rawCurvedM = 0.0
  var chordM = 0.0
  var girthM: Double?
  var girthMethod: String?             // ellipse-aspect | ellipse-bulge
  var noseView = CGPoint.zero
  var tailView = CGPoint.zero
  var centerlineView: [CGPoint] = []
  var distanceM = 0.0                  // camera → fish centroid
  var depthCoverage = 0.0
  var confidence = 0.0
  var timestamp: Double = 0
  // Capture support — normalized upright-photo coords + world-space spine.
  var contourPhotoNorm: [CGPoint] = []
  var nosePhotoNorm = CGPoint.zero
  var tailPhotoNorm = CGPoint.zero
  var centerline3D: [SIMD3<Float>] = []
}

struct DebugTimings {
  var segMs = 0.0
  var personSegMs = 0.0
  var contourMs = 0.0
  var centerlineMs = 0.0
  var depthLiftMs = 0.0
  var classifyMs = 0.0
  var droppedFrames = 0
  var depthDropoutFraction = 0.0
  /// Why the frame didn't reach a valid measurement ("" when it did):
  /// "no-subject" | "centerline" | "depth" | "not-fish".
  var lockBlocker = ""
}

enum Orientation {
  /// CGImagePropertyOrientation for Vision, per orientationMode.
  static func exif(_ mode: Int) -> CGImagePropertyOrientation {
    switch mode {
    case 1: return .left
    case 2: return .up
    case 3: return .down
    default: return .right
    }
  }

  /// Normalized upright/oriented coords → normalized sensor coords.
  /// Derived for each EXIF mode; .right means "rotate raw 90° CW to display",
  /// so upright (x,y) came from sensor (y, 1−x).
  static func orientedToSensorNorm(_ p: CGPoint, mode: Int) -> CGPoint {
    switch mode {
    case 1: return CGPoint(x: 1 - p.y, y: p.x)       // .left: raw rotated 90° CCW
    case 2: return p                                  // .up: already sensor space
    case 3: return CGPoint(x: 1 - p.x, y: 1 - p.y)   // .down: 180°
    default: return CGPoint(x: p.y, y: 1 - p.x)      // .right
    }
  }

  /// Inverse of orientedToSensorNorm.
  static func sensorToOrientedNorm(_ p: CGPoint, mode: Int) -> CGPoint {
    switch mode {
    case 1: return CGPoint(x: p.y, y: 1 - p.x)
    case 2: return p
    case 3: return CGPoint(x: 1 - p.x, y: 1 - p.y)
    default: return CGPoint(x: 1 - p.y, y: p.x)
    }
  }
}

enum CameraMath {
  /// Unproject a sensor-space pixel + depth into camera space
  /// (ARKit convention: +X right, +Y up, camera looks down −Z).
  static func unproject(u: Double, v: Double, depth: Double, intrinsics: simd_float3x3) -> SIMD3<Float> {
    let fx = Double(intrinsics.columns.0.x)
    let fy = Double(intrinsics.columns.1.y)
    let cx = Double(intrinsics.columns.2.x)
    let cy = Double(intrinsics.columns.2.y)
    let x = (u - cx) / fx * depth
    let y = (v - cy) / fy * depth
    return SIMD3<Float>(Float(x), Float(-y), Float(-depth))
  }

  static func toWorld(_ cam: SIMD3<Float>, transform: simd_float4x4) -> SIMD3<Float> {
    let w = transform * SIMD4<Float>(cam.x, cam.y, cam.z, 1)
    return SIMD3<Float>(w.x, w.y, w.z)
  }

  /// Project a camera-space point back to sensor pixels (inverse of unproject).
  static func projectToSensor(_ cam: SIMD3<Float>, intrinsics: simd_float3x3) -> CGPoint? {
    let d = Double(-cam.z)
    guard d > 0.001 else { return nil }
    let fx = Double(intrinsics.columns.0.x)
    let fy = Double(intrinsics.columns.1.y)
    let cx = Double(intrinsics.columns.2.x)
    let cy = Double(intrinsics.columns.2.y)
    let u = Double(cam.x) / d * fx + cx
    let v = Double(-cam.y) / d * fy + cy
    return CGPoint(x: u, y: v)
  }
}
