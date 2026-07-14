import ARKit
import CoreGraphics
import ExpoModulesCore
import RealityKit
import simd

/// Native view owning the ARKit session, the fish pipeline, and the capture
/// service. Modes: "auto" (fish pipeline), "manual" (crosshair + anchors),
/// "off" (session paused; the JS side also unmounts the view off-tab).
class FishARView: ExpoView {
  let onDistance = EventDispatcher()
  let onTrackingState = EventDispatcher()
  let onError = EventDispatcher()
  let onProjectedPoints = EventDispatcher()
  let onHeatmapRange = EventDispatcher()
  let onSubject = EventDispatcher()
  let onFishMeasurement = EventDispatcher()
  let onDebugInfo = EventDispatcher()

  let arView = ARView(frame: .zero)
  private lazy var rear = SessionController(arView: arView, host: self)
  private lazy var pipeline = FishPipeline(host: self)
  private lazy var heatmap = DepthHeatmapRenderer()
  private let captureService = CaptureService()

  private var mode = "auto"
  private var isActive = false
  private var debugDepthOverlay = false
  // Cached copies of pipeline props the manual/capture paths need on main.
  private var cachedOrientationMode = 0
  private var cachedMinDepthConfidence = 1
  private var cachedDepthRadius = 2
  private var highResEnabled = true

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    arView.frame = bounds
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(arView)
    rear.pipeline = pipeline

    NotificationCenter.default.addObserver(
      self, selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(handleWillEnterForeground),
      name: UIApplication.willEnterForegroundNotification, object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      isActive = true
      applyMode()
    } else {
      isActive = false
      rear.pause()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    heatmap.layer.frame = bounds
  }

  @objc private func handleDidEnterBackground() {
    rear.pause()
  }

  @objc private func handleWillEnterForeground() {
    if isActive {
      applyMode()
    }
  }

  // MARK: - Mode

  func setMode(_ newMode: String) {
    guard ["auto", "manual", "off"].contains(newMode) else {
      dispatchError(code: "invalid_mode", message: "Unknown mode '\(newMode)'.")
      return
    }
    mode = newMode
    rear.mode = newMode
    if newMode != "auto" {
      pipeline.stop()
    }
    if isActive {
      applyMode()
    }
  }

  private func applyMode() {
    if mode == "off" {
      rear.pause()
      return
    }
    if !rear.isRunning {
      rear.start()
    }
    setDepthOverlayActive(debugDepthOverlay)
  }

  // MARK: - Props

  func setUpdateHz(_ hz: Double) {
    rear.updateHz = min(max(hz, 1), 60)
  }

  func setSmoothing(medianWindow: Int, emaAlpha: Double) {
    rear.smoother.medianWindow = medianWindow
    rear.smoother.emaAlpha = emaAlpha
    pipeline.setSmoothing(medianWindow: medianWindow, emaAlpha: emaAlpha)
  }

  func setShowMarkers(_ show: Bool) {
    rear.showMarkers = show
  }

  func setEnableSceneReconstruction(_ enabled: Bool) {
    rear.enableSceneReconstruction = enabled
  }

  func setEnableHighResCapture(_ enabled: Bool) {
    highResEnabled = enabled
    rear.enableHighResCapture = enabled
  }

  func setSegmentation(_ p: SegmentationParams) {
    cachedOrientationMode = p.orientationMode
    cachedMinDepthConfidence = p.minDepthConfidence
    rear.depthSource = p.depthSource
    pipeline.setSegmentationHz(p.hz)
    let region: CGRect? = p.priorityRegion.map {
      CGRect(x: $0.x, y: $0.y, width: $0.w, height: $0.h)
    }
    pipeline.updateConfig { cfg in
      cfg.segmentation.hz = p.hz
      cfg.segmentation.depthSource = p.depthSource
      cfg.segmentation.minDepthConfidence = p.minDepthConfidence
      cfg.segmentation.personExclusion = p.personExclusion
      cfg.segmentation.personMaskErosionPx = p.personMaskErosionPx
      cfg.segmentation.personSegQuality = p.personSegQuality
      cfg.segmentation.depthTrimM = p.depthTrimM
      cfg.segmentation.minAreaFraction = p.minAreaFraction
      cfg.segmentation.maxAreaFraction = p.maxAreaFraction
      cfg.segmentation.minAspectRatio = p.minAspectRatio
      cfg.segmentation.maxAspectRatio = p.maxAspectRatio
      cfg.segmentation.priorityRegion = region
      cfg.segmentation.segmenterModelPath = p.segmenterModelPath
      cfg.segmentation.orientationMode = p.orientationMode
    }
  }

  func setClassifier(_ p: ClassifierParams) {
    pipeline.updateConfig { cfg in
      cfg.classifier.enabled = p.enabled
      cfg.classifier.hz = p.hz
      cfg.classifier.acceptLabels = p.acceptLabels
      cfg.classifier.minConfidence = p.minConfidence
      cfg.classifier.vetoLabels = p.vetoLabels
      cfg.classifier.modelPath = p.modelPath
      cfg.classifier.required = p.required
    }
  }

  func setCenterline(_ p: CenterlineParams) {
    cachedDepthRadius = p.depthSampleRadiusPx
    pipeline.updateConfig { cfg in
      cfg.centerline.algorithm = p.algorithm
      cfg.centerline.bins = p.bins
      cfg.centerline.depthSampleRadiusPx = p.depthSampleRadiusPx
      cfg.centerline.depthFitDegree = p.depthFitDegree
      cfg.centerline.outlierRejectSigma = p.outlierRejectSigma
      cfg.centerline.maxGapBinFraction = p.maxGapBinFraction
      cfg.centerline.minValidBinFraction = p.minValidBinFraction
    }
  }

  func setGirth(_ p: GirthParams) {
    pipeline.updateConfig { cfg in
      cfg.girth.aspect = p.aspect
      cfg.girth.useDepthBulge = p.useDepthBulge
      cfg.girth.calibration = p.calibration
    }
  }

  func setStability(_ p: StabilityParams) {
    pipeline.updateConfig { cfg in
      cfg.stability.windowMs = p.windowMs
      cfg.stability.maxDeltaCm = p.maxDeltaCm
      cfg.stability.maxDeltaFraction = p.maxDeltaFraction
      cfg.stability.minDistanceM = p.minDistanceM
      cfg.stability.maxDistanceM = p.maxDistanceM
      cfg.stability.minDepthCoverage = p.minDepthCoverage
    }
  }

  func setOverlay(_ p: OverlayParams) {
    pipeline.updateConfig { cfg in
      cfg.overlay.contourMaxPoints = p.contourMaxPoints
      cfg.overlay.emitCenterline = p.emitCenterline
    }
  }

  func setDebugMode(_ enabled: Bool) {
    pipeline.updateConfig { $0.debugMode = enabled }
  }

  func setDebugDepthOverlay(_ enabled: Bool) {
    debugDepthOverlay = enabled
    if isActive {
      setDepthOverlayActive(enabled)
    }
  }

  func setHeatmapRange(min: Double, max: Double) {
    heatmap.minMeters = Float(min)
    heatmap.maxMeters = Float(Swift.max(max, min + 0.01))
  }

  func setHeatmapOpacity(_ opacity: Double) {
    heatmap.setOpacity(opacity)
  }

  func setHeatmapColors(_ colors: [String]) {
    heatmap.setColors(colors)
  }

  func setHeatmapRotation(_ degrees: Int) {
    heatmap.rotationDegrees = degrees
  }

  func setHeatmapAutoRange(_ enabled: Bool) {
    heatmap.autoRange = enabled
  }

  private func setDepthOverlayActive(_ active: Bool) {
    if active {
      if heatmap.layer.superlayer == nil {
        heatmap.layer.frame = bounds
        layer.addSublayer(heatmap.layer)
      }
      heatmap.layer.isHidden = false
      heatmap.onAutoMaxChanged = { [weak self] maxMeters in
        guard let self else { return }
        self.onHeatmapRange([
          "min": Double(self.heatmap.minMeters),
          "max": Double(maxMeters),
        ])
      }
      rear.onDepthFrame = { [weak self] depthMap in
        self?.heatmap.update(depthMap: depthMap)
      }
    } else {
      rear.onDepthFrame = nil
      heatmap.layer.isHidden = true
      heatmap.layer.contents = nil
    }
  }

  // MARK: - Ref methods

  func setTapHint(x: Double, y: Double) {
    guard bounds.width > 0, bounds.height > 0 else { return }
    pipeline.setTapHint(
      viewNormX: x / Double(bounds.width), viewNormY: y / Double(bounds.height))
  }

  func clearSubject() {
    pipeline.clearSubject()
  }

  func measureAtPoint(x: Double, y: Double) -> [String: Any]? {
    guard mode == "manual" else { return nil }
    return rear.measure(at: CGPoint(x: x, y: y))
  }

  func measureManualPath(anchorIdA: String, anchorIdB: String, samples: Int) -> [String: Any]? {
    guard let a = rear.anchorPosition(id: anchorIdA),
          let b = rear.anchorPosition(id: anchorIdB),
          let frame = rear.currentFrameInput() else { return nil }
    let result = ManualPathMeasurer.measure(
      worldA: a, worldB: b, frame: frame, samples: samples,
      depthRadius: cachedDepthRadius, minDepthConfidence: cachedMinDepthConfidence)
    return [
      "curvedM": result.curvedM,
      "chordM": result.chordM,
      "sampleCount": result.sampleCount,
      "validFraction": result.validFraction,
    ]
  }

  func clearAnchors() {
    rear.clearAnchors()
  }

  func removeAnchor(id: String) {
    rear.removeAnchor(id: id)
  }

  func snapshotCamera(promise: Promise) {
    arView.snapshot(saveToHDR: false) { image in
      guard let image, let data = image.jpegData(compressionQuality: 0.9) else {
        promise.reject("snapshot_failed", "Could not capture the camera view.")
        return
      }
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension("jpg")
      do {
        try data.write(to: url)
        promise.resolve(url.path)
      } catch {
        promise.reject("snapshot_failed", error.localizedDescription)
      }
    }
  }

  // MARK: - Auto capture

  func captureAutoCatch(options: CaptureOptions, promise: Promise) {
    guard let good = pipeline.snapshotLastGood() else {
      promise.resolve(nil)
      return
    }
    captureService.capturePhoto(
      session: rear.session,
      fallbackFrame: good.frame,
      orientationMode: good.orientationMode,
      options: options,
      highResEnabled: highResEnabled
    ) { [weak self] photoPath, width, height, source in
      guard let self, let photoPath else {
        promise.resolve(nil)
        return
      }

      let finish: (String?, String?) -> Void = { plyPath, maskPath in
        let m = good.measurement
        let g = good.gate
        let intr = good.frame.intrinsics
        var payload: [String: Any] = [
          "photoPath": photoPath,
          "photoWidth": width,
          "photoHeight": height,
          "photoSource": source,
          "curvedM": g.windowFrames > 0 ? g.windowMedianCurvedM : m.curvedM,
          "chordM": m.chordM,
          "girthM": m.girthM as Any,
          "girthMethod": m.girthMethod as Any,
          "confidence": m.confidence,
          "distanceM": m.distanceM,
          "depthCoverage": m.depthCoverage,
          "windowMedianCurvedM": g.windowMedianCurvedM,
          "windowStdDevM": g.windowStdDevM,
          "windowFrames": g.windowFrames,
          "contour": m.contourPhotoNorm.flatMap { [Double($0.x), Double($0.y)] },
          "noseNorm": [Double(m.nosePhotoNorm.x), Double(m.nosePhotoNorm.y)],
          "tailNorm": [Double(m.tailPhotoNorm.x), Double(m.tailPhotoNorm.y)],
          "centerline3D": m.centerline3D.flatMap { [Double($0.x), Double($0.y), Double($0.z)] },
          "plyPath": plyPath as Any,
          "maskPngPath": maskPath as Any,
          "intrinsics": [
            "fx": Double(intr.columns.0.x), "fy": Double(intr.columns.1.y),
            "cx": Double(intr.columns.2.x), "cy": Double(intr.columns.2.y),
            "width": good.frame.imageWidth, "height": good.frame.imageHeight,
          ],
          "timestamp": Date().timeIntervalSince1970 * 1000,
        ]
        payload["measureMode"] = "auto"
        DispatchQueue.main.async {
          promise.resolve(payload)
        }
      }

      if options.includePly {
        self.captureService.writePly(
          mask: good.mask, frame: good.frame,
          orientationMode: good.orientationMode,
          minDepthConfidence: good.minDepthConfidence,
          outputDir: options.outputDir
        ) { plyPath in
          if options.includeMaskPng {
            self.captureService.writeMaskPng(mask: good.mask, outputDir: options.outputDir) { maskPath in
              finish(plyPath, maskPath)
            }
          } else {
            finish(plyPath, nil)
          }
        }
      } else if options.includeMaskPng {
        self.captureService.writeMaskPng(mask: good.mask, outputDir: options.outputDir) { maskPath in
          finish(nil, maskPath)
        }
      } else {
        finish(nil, nil)
      }
    }
  }

  // MARK: - Manual capture

  func captureManualCatch(anchorIdA: String, anchorIdB: String, options: CaptureOptions, promise: Promise) {
    guard let a = rear.anchorPosition(id: anchorIdA),
          let b = rear.anchorPosition(id: anchorIdB),
          let frame = rear.currentFrameInput() else {
      promise.resolve(nil)
      return
    }
    let result = ManualPathMeasurer.measure(
      worldA: a, worldB: b, frame: frame, samples: 64,
      depthRadius: cachedDepthRadius, minDepthConfidence: cachedMinDepthConfidence)

    let orientationMode = cachedOrientationMode
    let inverse = frame.cameraTransform.inverse
    func photoNorm(_ world: SIMD3<Float>) -> [Double]? {
      let v = inverse * SIMD4<Float>(world.x, world.y, world.z, 1)
      guard let px = CameraMath.projectToSensor(
        SIMD3<Float>(v.x, v.y, v.z), intrinsics: frame.intrinsics) else { return nil }
      let sensorNorm = CGPoint(
        x: px.x / Double(frame.imageWidth), y: px.y / Double(frame.imageHeight))
      let oriented = Orientation.sensorToOrientedNorm(sensorNorm, mode: orientationMode)
      return [Double(oriented.x), Double(oriented.y)]
    }

    captureService.capturePhoto(
      session: rear.session,
      fallbackFrame: frame,
      orientationMode: orientationMode,
      options: options,
      highResEnabled: highResEnabled
    ) { photoPath, width, height, source in
      guard let photoPath else {
        promise.resolve(nil)
        return
      }
      let camPos = SIMD3<Float>(
        frame.cameraTransform.columns.3.x,
        frame.cameraTransform.columns.3.y,
        frame.cameraTransform.columns.3.z)
      let midDistance = Double(simd_length((a + b) / 2 - camPos))
      let intr = frame.intrinsics
      let payload: [String: Any] = [
        "photoPath": photoPath,
        "photoWidth": width,
        "photoHeight": height,
        "photoSource": source,
        "curvedM": result.curvedM,
        "chordM": result.chordM,
        "confidence": result.validFraction,
        "distanceM": midDistance,
        "pointANorm": photoNorm(a) as Any,
        "pointBNorm": photoNorm(b) as Any,
        "pathPointsNorm": result.worldPath.compactMap(photoNorm).flatMap { $0 },
        "plyPath": NSNull(),
        "maskPngPath": NSNull(),
        "intrinsics": [
          "fx": Double(intr.columns.0.x), "fy": Double(intr.columns.1.y),
          "cx": Double(intr.columns.2.x), "cy": Double(intr.columns.2.y),
          "width": frame.imageWidth, "height": frame.imageHeight,
        ],
        "measureMode": "manual",
        "timestamp": Date().timeIntervalSince1970 * 1000,
      ]
      DispatchQueue.main.async {
        promise.resolve(payload)
      }
    }
  }

  // MARK: - Event dispatch helpers

  func dispatchDistance(meters: Double, raw: Double, confidence: String, mode: String, method: String) {
    onDistance([
      "meters": meters,
      "rawMeters": raw,
      "confidence": confidence,
      "mode": mode,
      "method": method,
      "timestamp": Date().timeIntervalSince1970 * 1000,
    ])
  }

  func dispatchProjectedPoints(points: [[String: Any]]) {
    onProjectedPoints([
      "points": points,
      "timestamp": Date().timeIntervalSince1970 * 1000,
    ])
  }

  func dispatchTrackingState(state: String, reason: String?) {
    var payload: [String: Any] = ["state": state]
    if let reason {
      payload["reason"] = reason
    }
    onTrackingState(payload)
  }

  func dispatchError(code: String, message: String) {
    onError(["code": code, "message": message])
  }

  func dispatchSubject(_ payload: [String: Any]) {
    onSubject(payload)
  }

  func dispatchFishMeasurement(_ payload: [String: Any]) {
    onFishMeasurement(payload)
  }

  func dispatchDebugInfo(_ payload: [String: Any]) {
    onDebugInfo(payload)
  }
}
