import ARKit
import Foundation
import RealityKit

extension simd_float4x4 {
  var translation: SIMD3<Float> {
    SIMD3(columns.3.x, columns.3.y, columns.3.z)
  }
}

struct RearHit {
  let worldPoint: SIMD3<Float>
  let method: String      // "mesh" | "existingPlane" | "estimatedPlane"
  let confidence: String  // "low" | "medium" | "high"
}

/// Owns the ARKit world-tracking session.
/// - auto mode: forwards a FrameInput per frame to the FishPipeline (which
///   throttles/drops on its own queue).
/// - manual mode: crosshair distance events + tap anchors + projected points,
///   carried over from the distance app unchanged.
final class SessionController: NSObject, ARSessionDelegate {
  private let arView: ARView
  private weak var host: FishARView?
  weak var pipeline: FishPipeline?
  let smoother = DistanceSmoother()

  var updateHz: Double = 15
  var showMarkers = true
  var mode: String = "manual" {
    didSet {
      if mode != oldValue {
        smoother.reset()
      }
    }
  }
  /// Session-level options. Changing them while running restarts the session
  /// (config changes only apply on run).
  var enableSceneReconstruction = true {
    didSet { restartIfNeeded(changed: oldValue != enableSceneReconstruction) }
  }
  var enableHighResCapture = true {
    didSet { restartIfNeeded(changed: oldValue != enableHighResCapture) }
  }
  /// "raw" | "smoothed" — which depth map feeds the pipeline.
  var depthSource = "smoothed"
  /// Set while the debug depth overlay is active; receives the depth map at
  /// the event rate.
  var onDepthFrame: ((CVPixelBuffer) -> Void)?

  private var anchors: [String: AnchorEntity] = [:]
  private var anchorOrder: [String] = []
  private var lastEventTimestamp: TimeInterval = 0
  private var lastProjectedCount = -1
  private var trackingNormal = false
  private(set) var isRunning = false

  var session: ARSession { arView.session }

  init(arView: ARView, host: FishARView) {
    self.arView = arView
    self.host = host
    super.init()
  }

  private func restartIfNeeded(changed: Bool) {
    if changed && isRunning {
      pause()
      start()
    }
  }

  func start() {
    guard ARWorldTrackingConfiguration.isSupported else {
      host?.dispatchError(code: "ar_unsupported", message: "ARKit world tracking is not supported on this device.")
      host?.dispatchTrackingState(state: "notAvailable", reason: nil)
      return
    }

    let config = ARWorldTrackingConfiguration()
    if enableSceneReconstruction {
      if ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) {
        config.sceneReconstruction = .meshWithClassification
      } else if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
        config.sceneReconstruction = .mesh
      }
    }
    // Both depth semantics when available; FrameInput picks per depthSource.
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
      config.frameSemantics.insert(.sceneDepth)
    }
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
      config.frameSemantics.insert(.smoothedSceneDepth)
    }
    if enableHighResCapture,
       let format = ARWorldTrackingConfiguration.recommendedVideoFormatForHighResolutionFrameCapturing {
      config.videoFormat = format
    }
    config.planeDetection = [.horizontal, .vertical]

    arView.environment.sceneUnderstanding.options.insert(.collision)
    arView.session.delegate = self

    anchors.removeAll()
    anchorOrder.removeAll()
    smoother.reset()
    trackingNormal = false
    lastEventTimestamp = 0

    arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    isRunning = true
    host?.dispatchTrackingState(state: "initializing", reason: nil)
  }

  func pause() {
    guard isRunning else { return }
    arView.session.pause()
    isRunning = false
    trackingNormal = false
    pipeline?.stop()
  }

  // MARK: - FrameInput construction

  /// Builds the pipeline's view of a frame. Cheap: buffer refs plus the
  /// display transform, no copies. Returns nil until depth is flowing.
  func makeFrameInput(from frame: ARFrame) -> FrameInput? {
    let depth = depthSource == "raw"
      ? (frame.sceneDepth ?? frame.smoothedSceneDepth)
      : (frame.smoothedSceneDepth ?? frame.sceneDepth)
    guard let depth else { return nil }
    let bounds = arView.bounds.size
    guard bounds.width > 0, bounds.height > 0 else { return nil }
    let image = frame.capturedImage
    return FrameInput(
      capturedImage: image,
      depthMap: depth.depthMap,
      confidenceMap: depth.confidenceMap,
      intrinsics: frame.camera.intrinsics,
      cameraTransform: frame.camera.transform,
      imageWidth: CVPixelBufferGetWidth(image),
      imageHeight: CVPixelBufferGetHeight(image),
      displayTransform: frame.displayTransform(for: .portrait, viewportSize: bounds),
      viewSize: bounds,
      timestamp: frame.timestamp)
  }

  /// On-demand FrameInput for manual-path measurement and captures.
  func currentFrameInput() -> FrameInput? {
    guard let frame = arView.session.currentFrame else { return nil }
    return makeFrameInput(from: frame)
  }

  // MARK: - Measurement (manual mode)

  private var cameraPosition: SIMD3<Float> {
    arView.cameraTransform.translation
  }

  private func distance(to worldPoint: SIMD3<Float>) -> Double {
    Double(simd_length(worldPoint - cameraPosition))
  }

  /// Tier 0: unproject the LiDAR depth map directly at the point. The scene
  /// mesh/plane raycasts fall through to whatever is BEHIND a handheld fish
  /// (mesh barely forms on small held objects), which made manual points
  /// land meters too deep. The depth map reads the fish surface itself.
  private func depthHit(at point: CGPoint) -> RearHit? {
    guard let frame = arView.session.currentFrame else { return nil }
    let depth = frame.smoothedSceneDepth ?? frame.sceneDepth
    guard let depth else { return nil }
    let bounds = arView.bounds.size
    guard bounds.width > 0, bounds.height > 0 else { return nil }

    let viewNorm = CGPoint(x: point.x / bounds.width, y: point.y / bounds.height)
    let sensorNorm = viewNorm.applying(
      frame.displayTransform(for: .portrait, viewportSize: bounds).inverted())
    guard sensorNorm.x >= 0, sensorNorm.x <= 1, sensorNorm.y >= 0, sensorNorm.y <= 1 else {
      return nil
    }
    let imageW = CVPixelBufferGetWidth(frame.capturedImage)
    let imageH = CVPixelBufferGetHeight(frame.capturedImage)
    let px = CGPoint(x: sensorNorm.x * Double(imageW), y: sensorNorm.y * Double(imageH))

    // Near-biased read: aimed at a fish nose, half the window hangs off onto
    // background — a median answers "background" and the anchor lands meters
    // deep. Confidence 0: an edge reading beats a plane raycast fallback.
    guard let sampler = DepthSampler(
      depthMap: depth.depthMap, confidenceMap: depth.confidenceMap, minConfidence: 0),
      let z = sampler.nearDepth(atSensorPx: px, imageWidth: imageW, imageHeight: imageH, radius: 3)
    else { return nil }

    let cam = CameraMath.unproject(u: px.x, v: px.y, depth: z, intrinsics: frame.camera.intrinsics)
    let world = CameraMath.toWorld(cam, transform: frame.camera.transform)
    return RearHit(
      worldPoint: world, method: "depth", confidence: trackingNormal ? "high" : "medium")
  }

  /// Depth-map read first, then the three-tier raycast fallback: LiDAR scene
  /// mesh → detected plane geometry → estimated plane.
  func hitTest(at point: CGPoint) -> RearHit? {
    if let hit = depthHit(at: point) {
      return hit
    }
    let limited = !trackingNormal

    if let ray = arView.ray(through: point) {
      let hits = arView.scene.raycast(
        origin: ray.origin,
        direction: ray.direction,
        length: 10,
        query: .nearest,
        mask: .all,
        relativeTo: nil
      )
      if let hit = hits.first(where: { $0.entity is HasSceneUnderstanding }) {
        return RearHit(worldPoint: hit.position, method: "mesh", confidence: limited ? "medium" : "high")
      }
    }

    if let result = arView.raycast(from: point, allowing: .existingPlaneGeometry, alignment: .any).first {
      return RearHit(worldPoint: result.worldTransform.translation, method: "existingPlane", confidence: limited ? "medium" : "high")
    }

    if let result = arView.raycast(from: point, allowing: .estimatedPlane, alignment: .any).first {
      return RearHit(worldPoint: result.worldTransform.translation, method: "estimatedPlane", confidence: limited ? "low" : "medium")
    }

    return nil
  }

  /// Tap/crosshair measure: raycast, drop a world anchor (so ARKit keeps it
  /// glued to the surface), and return the measurement. Nil on a miss.
  func measure(at point: CGPoint) -> [String: Any]? {
    guard isRunning else { return nil }
    guard let hit = hitTest(at: point) else { return nil }

    let id = UUID().uuidString
    let anchor = AnchorEntity(world: hit.worldPoint)
    if showMarkers {
      anchor.addChild(MarkerEntityFactory.makeMarker())
    }
    arView.scene.addAnchor(anchor)
    anchors[id] = anchor
    anchorOrder.append(id)
    smoother.reset()

    return [
      "meters": distance(to: hit.worldPoint),
      "confidence": hit.confidence,
      "anchorId": id,
      "method": hit.method,
      "worldPoint": [
        "x": Double(hit.worldPoint.x),
        "y": Double(hit.worldPoint.y),
        "z": Double(hit.worldPoint.z),
      ],
    ]
  }

  func anchorPosition(id: String) -> SIMD3<Float>? {
    anchors[id]?.position(relativeTo: nil)
  }

  func clearAnchors() {
    for (_, anchor) in anchors {
      arView.scene.removeAnchor(anchor)
    }
    anchors.removeAll()
    anchorOrder.removeAll()
  }

  func removeAnchor(id: String) {
    guard let anchor = anchors.removeValue(forKey: id) else { return }
    arView.scene.removeAnchor(anchor)
    anchorOrder.removeAll { $0 == id }
  }

  // MARK: - ARSessionDelegate

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    // Auto mode: hand every frame to the pipeline; it throttles itself.
    if mode == "auto", let input = makeFrameInput(from: frame) {
      pipeline?.process(input)
    }

    guard updateHz > 0 else { return }
    guard frame.timestamp - lastEventTimestamp >= 1.0 / updateHz else { return }
    lastEventTimestamp = frame.timestamp

    if let onDepthFrame, let depthMap = frame.sceneDepth?.depthMap {
      onDepthFrame(depthMap)
    }

    guard mode == "manual" else { return }

    // Center-crosshair distance drives the manual-mode readout.
    if arView.bounds.width > 0 {
      let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
      if let hit = hitTest(at: center) {
        let raw = distance(to: hit.worldPoint)
        emitDistance(raw: raw, confidence: hit.confidence, method: hit.method)
      }
    }

    emitProjectedPoints()
  }

  /// Screen-space projection of every anchor plus its live camera distance —
  /// the JS overlay draws markers/lines/labels from this.
  private func emitProjectedPoints() {
    guard !anchorOrder.isEmpty else {
      // Emit the empty set once (so JS clears the overlay), then stay quiet
      // instead of spamming the bridge with nothing.
      if lastProjectedCount != 0 {
        host?.dispatchProjectedPoints(points: [])
        lastProjectedCount = 0
      }
      return
    }
    lastProjectedCount = anchorOrder.count
    let camPos = cameraPosition
    let matrix = arView.cameraTransform.matrix
    // Camera looks down its local -Z axis.
    let forward = -SIMD3(matrix.columns.2.x, matrix.columns.2.y, matrix.columns.2.z)

    var points: [[String: Any]] = []
    points.reserveCapacity(anchorOrder.count)
    for id in anchorOrder {
      guard let anchor = anchors[id] else { continue }
      let position = anchor.position(relativeTo: nil)
      let meters = Double(simd_length(position - camPos))
      let inFront = simd_dot(position - camPos, forward) > 0
      var entry: [String: Any] = ["id": id, "cameraMeters": meters]
      if inFront, let screen = arView.project(position) {
        entry["x"] = Double(screen.x)
        entry["y"] = Double(screen.y)
        entry["visible"] = true
      } else {
        entry["x"] = 0.0
        entry["y"] = 0.0
        entry["visible"] = false
      }
      points.append(entry)
    }
    host?.dispatchProjectedPoints(points: points)
  }

  private func emitDistance(raw: Double, confidence: String, method: String) {
    let smoothed = smoother.smooth(raw)
    host?.dispatchDistance(meters: smoothed, raw: raw, confidence: confidence, mode: mode, method: method)
  }

  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    switch camera.trackingState {
    case .normal:
      trackingNormal = true
      host?.dispatchTrackingState(state: "normal", reason: nil)
    case .notAvailable:
      trackingNormal = false
      host?.dispatchTrackingState(state: "notAvailable", reason: nil)
    case .limited(let reason):
      trackingNormal = false
      switch reason {
      case .initializing:
        host?.dispatchTrackingState(state: "initializing", reason: nil)
      case .excessiveMotion:
        host?.dispatchTrackingState(state: "limited", reason: "excessiveMotion")
      case .insufficientFeatures:
        host?.dispatchTrackingState(state: "limited", reason: "insufficientFeatures")
      case .relocalizing:
        host?.dispatchTrackingState(state: "limited", reason: "relocalizing")
      @unknown default:
        host?.dispatchTrackingState(state: "limited", reason: nil)
      }
    }
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    isRunning = false
    trackingNormal = false
    host?.dispatchError(code: "ar_session_failed", message: error.localizedDescription)
    host?.dispatchTrackingState(state: "notAvailable", reason: nil)
  }

  func sessionWasInterrupted(_ session: ARSession) {
    host?.dispatchTrackingState(state: "limited", reason: "relocalizing")
  }

  func sessionInterruptionEnded(_ session: ARSession) {
    host?.dispatchTrackingState(state: trackingNormal ? "normal" : "initializing", reason: nil)
  }
}
