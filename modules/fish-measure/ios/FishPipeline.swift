import ARKit
import CoreGraphics
import Foundation
import simd

/// Everything captureAutoCatch needs, frozen at the last valid measurement.
struct LastGoodResult {
  var subject: SubjectSnapshot
  var measurement: MeasurementSnapshot
  var frame: FrameInput
  var mask: BinaryMask
  var gate: StabilityStatus
  var orientationMode: Int
  var minDepthConfidence: Int
}

/// Auto-mode orchestrator. One serial queue, frame-dropping at the door;
/// per tick: segment → contour → centerline → depth-lift → girth → gate,
/// then events on main. The ARFrame is never retained — only its buffers,
/// and only for the last processed tick (replaced each run).
final class FishPipeline {
  weak var host: FishARView?

  private let queue = DispatchQueue(label: "fish.vision", qos: .userInitiated)
  private let enqueueLock = NSLock()
  private var isProcessing = false
  private var lastEnqueueTime = 0.0
  private var droppedFrames = 0

  // Touched only on `queue`.
  private var config = PipelineConfig()
  private let segmenter = SubjectSegmenter()
  private let classifier = FishClassifier()
  private let gate = StabilityGate()
  private let smoother = DistanceSmoother()
  private var tapHintViewNorm: CGPoint?
  private var state = "none"
  private var missedFrames = 0
  private var invalidStreak = 0
  private var lastGood: LastGoodResult?

  init(host: FishARView) {
    self.host = host
  }

  // MARK: - Configuration (serialized onto the queue)

  func updateConfig(_ mutate: @escaping (inout PipelineConfig) -> Void) {
    queue.async {
      mutate(&self.config)
      self.gate.config = self.config.stability
    }
  }

  func setSmoothing(medianWindow: Int, emaAlpha: Double) {
    queue.async {
      self.smoother.medianWindow = medianWindow
      self.smoother.emaAlpha = emaAlpha
    }
  }

  func setTapHint(viewNormX: Double, viewNormY: Double) {
    queue.async {
      self.tapHintViewNorm = CGPoint(x: viewNormX, y: viewNormY)
    }
  }

  func clearSubject() {
    queue.async {
      self.resetTracking(emit: true, timestamp: Date().timeIntervalSince1970 * 1000)
    }
  }

  func stop() {
    queue.async {
      self.resetTracking(emit: false, timestamp: 0)
    }
  }

  /// The capture path's synchronous grab of the last valid result.
  func snapshotLastGood() -> LastGoodResult? {
    queue.sync { lastGood }
  }

  // MARK: - Frame intake (called on the session thread)

  func process(_ frame: FrameInput) {
    enqueueLock.lock()
    let hz = max(1.0, queueSafeHz)
    if isProcessing || frame.timestamp - lastEnqueueTime < 1.0 / hz {
      if isProcessing {
        droppedFrames += 1
      }
      enqueueLock.unlock()
      return
    }
    isProcessing = true
    lastEnqueueTime = frame.timestamp
    enqueueLock.unlock()

    queue.async {
      self.run(frame)
      self.enqueueLock.lock()
      self.isProcessing = false
      self.enqueueLock.unlock()
    }
  }

  /// segmentation.hz read from the session thread; kept in sync whenever the
  /// config changes (an approximate read is fine for a throttle).
  private var queueSafeHz: Double {
    hzLock.lock()
    defer { hzLock.unlock() }
    return cachedHz
  }
  private let hzLock = NSLock()
  private var cachedHz = 10.0
  func setSegmentationHz(_ hz: Double) {
    hzLock.lock()
    cachedHz = hz
    hzLock.unlock()
    updateConfig { $0.segmentation.hz = hz }
  }

  // MARK: - The tick

  private func run(_ frame: FrameInput) {
    var timings = DebugTimings()
    let cfg = config
    let mode = cfg.segmentation.orientationMode
    let tsMs = frame.timestamp * 1000

    // View-space hints → oriented-normalized space.
    let inverseDisplay = frame.displayTransform.inverted()
    func viewNormToOriented(_ p: CGPoint) -> CGPoint {
      Orientation.sensorToOrientedNorm(p.applying(inverseDisplay), mode: mode)
    }
    let tapOriented = tapHintViewNorm.map(viewNormToOriented)
    var priorityOriented: CGRect?
    if let region = cfg.segmentation.priorityRegion {
      let corners = [
        CGPoint(x: region.minX, y: region.minY), CGPoint(x: region.maxX, y: region.minY),
        CGPoint(x: region.minX, y: region.maxY), CGPoint(x: region.maxX, y: region.maxY),
      ].map(viewNormToOriented)
      let xs = corners.map(\.x), ys = corners.map(\.y)
      priorityOriented = CGRect(
        x: xs.min()!, y: ys.min()!,
        width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
    }

    // 1. Segment.
    let segStart = CFAbsoluteTimeGetCurrent()
    let seg = segmenter.segment(
      frame: frame, config: cfg.segmentation,
      tapOrientedNorm: tapOriented, priorityOrientedNorm: priorityOriented)
    timings.segMs = (CFAbsoluteTimeGetCurrent() - segStart) * 1000

    guard let seg else {
      missedFrames += 1
      if missedFrames > 5 && state != "none" {
        resetTracking(emit: true, timestamp: tsMs)
      }
      timings.lockBlocker = "no-subject"
      emitDebug(timings, frame: frame)
      return
    }
    missedFrames = 0
    timings.personSegMs = seg.personSegMs

    // Depth-continuity trim: the fish sits at one depth; anything the
    // subject-lift merged in from BEHIND it (cord, branches, structure) is
    // farther away. Trim mask pixels whose LiDAR depth strays from the
    // fish's median, then keep the largest piece.
    var fishMask = seg.mask
    if cfg.segmentation.depthTrimM > 0 {
      fishMask = depthTrimmed(
        mask: fishMask, frame: frame, tolerance: cfg.segmentation.depthTrimM, mode: mode)
    }

    // 2. Classify (sub-cadence, sticky).
    let classifyStart = CFAbsoluteTimeGetCurrent()
    let classification = classifier.classify(
      frame: frame, bboxOrientedNorm: seg.bboxOrientedNorm,
      config: cfg.classifier, orientationMode: mode, now: frame.timestamp)
    timings.classifyMs = (CFAbsoluteTimeGetCurrent() - classifyStart) * 1000
    let fishOK = !classification.vetoed
      && (!cfg.classifier.required || classification.fishScore >= cfg.classifier.minConfidence)

    // 3. Contour.
    let contourStart = CFAbsoluteTimeGetCurrent()
    let contour = ContourTracer.trace(mask: fishMask, maxPoints: cfg.overlay.contourMaxPoints)
    timings.contourMs = (CFAbsoluteTimeGetCurrent() - contourStart) * 1000

    // 4. Centerline.
    let clStart = CFAbsoluteTimeGetCurrent()
    let centerline = CenterlineBuilder.build(mask: fishMask, config: cfg.centerline)
    timings.centerlineMs = (CFAbsoluteTimeGetCurrent() - clStart) * 1000

    // 5. Depth lift.
    let liftStart = CFAbsoluteTimeGetCurrent()
    var lifted: LiftedCenterline?
    if let centerline {
      lifted = DepthLifter.lift(
        centerline: centerline, maskWidth: fishMask.width, maskHeight: fishMask.height,
        frame: frame, config: cfg.centerline,
        minDepthConfidence: cfg.segmentation.minDepthConfidence, orientationMode: mode)
    }
    timings.depthLiftMs = (CFAbsoluteTimeGetCurrent() - liftStart) * 1000
    timings.depthDropoutFraction = lifted?.dropoutFraction ?? 1
    timings.droppedFrames = droppedFrames

    // 6. Girth.
    var girth: GirthResult?
    if let centerline, let lifted {
      girth = GirthEstimator.estimate(
        centerline: centerline, lifted: lifted,
        maskWidth: fishMask.width, maskHeight: fishMask.height, frame: frame,
        config: cfg.girth, depthRadius: cfg.centerline.depthSampleRadiusPx,
        minDepthConfidence: cfg.segmentation.minDepthConfidence, orientationMode: mode)
    }

    // State machine + why-not-locked telemetry.
    state = (lifted != nil && fishOK) ? "locked" : "candidate"
    if lifted == nil {
      timings.lockBlocker = centerline == nil ? "centerline" : "depth"
    } else if !fishOK {
      timings.lockBlocker = "not-fish"
    }

    // Coordinate conversions for the overlay.
    func maskToViewPx(_ p: CGPoint) -> CGPoint {
      let orientedNorm = CGPoint(
        x: p.x / Double(fishMask.width), y: p.y / Double(fishMask.height))
      let sensorNorm = Orientation.orientedToSensorNorm(orientedNorm, mode: mode)
      let viewNorm = sensorNorm.applying(frame.displayTransform)
      return CGPoint(x: viewNorm.x * frame.viewSize.width, y: viewNorm.y * frame.viewSize.height)
    }
    func maskToPhotoNorm(_ p: CGPoint) -> CGPoint {
      CGPoint(x: p.x / Double(fishMask.width), y: p.y / Double(fishMask.height))
    }

    var subject = SubjectSnapshot()
    subject.state = state
    subject.contourView = contour.map(maskToViewPx)
    subject.selectedBy = seg.selectedBy
    subject.instanceCount = seg.instanceCount
    subject.areaFraction = seg.areaFraction
    subject.aspectRatio = seg.elongation
    subject.classifierTop = classification.top
    subject.fishScore = classification.fishScore
    subject.timestamp = tsMs
    if !subject.contourView.isEmpty {
      let xs = subject.contourView.map(\.x), ys = subject.contourView.map(\.y)
      subject.bboxView = CGRect(
        x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
    }

    var measurement = MeasurementSnapshot()
    measurement.timestamp = tsMs
    var gateStatus = StabilityStatus()
    if let centerline, let lifted {
      measurement.valid = true
      measurement.rawCurvedM = lifted.curvedM
      measurement.curvedM = smoother.smooth(lifted.curvedM)
      measurement.chordM = lifted.chordM
      measurement.girthM = girth?.girthM
      measurement.girthMethod = girth?.method
      measurement.noseView = maskToViewPx(centerline.tipA)
      measurement.tailView = maskToViewPx(centerline.tipB)
      if cfg.overlay.emitCenterline {
        measurement.centerlineView = CenterlineBuilder
          .samplePolyline(centerline.points, count: 32)
          .map(maskToViewPx)
      }
      measurement.distanceM = lifted.centroidDistanceM
      measurement.depthCoverage = lifted.coverage
      measurement.confidence = min(1, 0.6 * lifted.coverage + 0.4 * min(1, classification.fishScore * 3))
      measurement.contourPhotoNorm = contour.map(maskToPhotoNorm)
      measurement.nosePhotoNorm = maskToPhotoNorm(centerline.tipA)
      measurement.tailPhotoNorm = maskToPhotoNorm(centerline.tipB)
      measurement.centerline3D = lifted.world

      invalidStreak = 0
      gateStatus = gate.add(
        curvedM: measurement.curvedM, coverage: lifted.coverage,
        distanceM: lifted.centroidDistanceM, timestamp: frame.timestamp)

      lastGood = LastGoodResult(
        subject: subject, measurement: measurement, frame: frame, mask: fishMask,
        gate: gateStatus, orientationMode: mode,
        minDepthConfidence: cfg.segmentation.minDepthConfidence)
    } else {
      // Tolerate brief dropouts: a single bad frame must not zero the
      // stability clock or auto-capture can never accumulate its window.
      invalidStreak += 1
      if invalidStreak > 2 {
        gate.reset()
        smoother.reset()
      }
    }

    emit(subject: subject, measurement: measurement, gate: gateStatus)
    if cfg.debugMode {
      emitDebug(timings, frame: frame)
    }
  }

  /// Zeroes mask pixels whose depth strays from the fish's median by more
  /// than `tolerance` meters, then keeps the largest connected piece.
  private func depthTrimmed(
    mask: BinaryMask, frame: FrameInput, tolerance: Double, mode: Int
  ) -> BinaryMask {
    guard let sampler = DepthSampler(
      depthMap: frame.depthMap, confidenceMap: frame.confidenceMap, minConfidence: 0)
    else { return mask }

    func depthAt(_ x: Int, _ y: Int) -> Double? {
      let norm = CGPoint(x: Double(x) / Double(mask.width), y: Double(y) / Double(mask.height))
      let sn = Orientation.orientedToSensorNorm(norm, mode: mode)
      let px = CGPoint(
        x: sn.x * Double(frame.imageWidth), y: sn.y * Double(frame.imageHeight))
      return sampler.medianDepth(
        atSensorPx: px, imageWidth: frame.imageWidth, imageHeight: frame.imageHeight, radius: 0)
    }

    // Median fish depth from a subsample.
    var depths: [Double] = []
    let stride = max(1, Int((Double(mask.area) / 3000).squareRoot().rounded(.up)))
    var y = 0
    while y < mask.height {
      var x = 0
      while x < mask.width {
        if mask.data[y * mask.width + x] == 1, let z = depthAt(x, y) {
          depths.append(z)
        }
        x += stride
      }
      y += stride
    }
    guard depths.count >= 30 else { return mask }
    depths.sort()
    let median = depths[depths.count / 2]

    var out = mask.data
    for py in 0..<mask.height {
      for px in 0..<mask.width where out[py * mask.width + px] == 1 {
        // Unreadable depth (glare dropout) stays IN — dropouts happen on the
        // fish itself; only confidently-far pixels get trimmed.
        if let z = depthAt(px, py), abs(z - median) > tolerance {
          out[py * mask.width + px] = 0
        }
      }
    }
    let trimmed = BinaryMask(width: mask.width, height: mask.height, data: out).largestComponent()
    return trimmed.area > 64 ? trimmed : mask
  }

  private func resetTracking(emit: Bool, timestamp: Double) {
    state = "none"
    missedFrames = 0
    invalidStreak = 0
    tapHintViewNorm = nil
    gate.reset()
    smoother.reset()
    classifier.reset()
    lastGood = nil
    if emit {
      var subject = SubjectSnapshot()
      subject.timestamp = timestamp
      var measurement = MeasurementSnapshot()
      measurement.timestamp = timestamp
      self.emit(subject: subject, measurement: measurement, gate: StabilityStatus())
    }
  }

  // MARK: - Event emission (main thread)

  private func emit(subject: SubjectSnapshot, measurement: MeasurementSnapshot, gate: StabilityStatus) {
    let subjectPayload: [String: Any] = [
      "state": subject.state,
      "contour": flatten(subject.contourView),
      "bbox": [
        "x": subject.bboxView.origin.x, "y": subject.bboxView.origin.y,
        "w": subject.bboxView.width, "h": subject.bboxView.height,
      ],
      "selectedBy": subject.selectedBy as Any,
      "instanceCount": subject.instanceCount,
      "areaFraction": subject.areaFraction,
      "aspectRatio": subject.aspectRatio,
      "classifierTop": subject.classifierTop.map { ["label": $0.label, "confidence": $0.confidence] },
      "fishScore": subject.fishScore,
      "timestamp": subject.timestamp,
    ]
    var measurementPayload: [String: Any] = [
      "valid": measurement.valid,
      "curvedM": measurement.curvedM,
      "rawCurvedM": measurement.rawCurvedM,
      "chordM": measurement.chordM,
      "girthM": measurement.girthM as Any,
      "girthMethod": measurement.girthMethod as Any,
      "nose": ["x": measurement.noseView.x, "y": measurement.noseView.y],
      "tail": ["x": measurement.tailView.x, "y": measurement.tailView.y],
      "distanceM": measurement.distanceM,
      "depthCoverage": measurement.depthCoverage,
      "confidence": measurement.confidence,
      "stable": gate.stable,
      "stableForMs": gate.stableForMs,
      "timestamp": measurement.timestamp,
    ]
    if !measurement.centerlineView.isEmpty {
      measurementPayload["centerline"] = flatten(measurement.centerlineView)
    }
    DispatchQueue.main.async { [weak host] in
      host?.dispatchSubject(subjectPayload)
      host?.dispatchFishMeasurement(measurementPayload)
    }
  }

  private func emitDebug(_ timings: DebugTimings, frame: FrameInput) {
    guard config.debugMode else { return }
    let thermal: String
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: thermal = "nominal"
    case .fair: thermal = "fair"
    case .serious: thermal = "serious"
    case .critical: thermal = "critical"
    @unknown default: thermal = "unknown"
    }
    let payload: [String: Any] = [
      "segMs": timings.segMs,
      "personSegMs": timings.personSegMs,
      "contourMs": timings.contourMs,
      "centerlineMs": timings.centerlineMs,
      "depthLiftMs": timings.depthLiftMs,
      "classifyMs": timings.classifyMs,
      "droppedFrames": timings.droppedFrames,
      "depthDropoutFraction": timings.depthDropoutFraction,
      "lockBlocker": timings.lockBlocker,
      "thermalState": thermal,
      "timestamp": frame.timestamp * 1000,
    ]
    DispatchQueue.main.async { [weak host] in
      host?.dispatchDebugInfo(payload)
    }
  }

  private func flatten(_ points: [CGPoint]) -> [Double] {
    var out: [Double] = []
    out.reserveCapacity(points.count * 2)
    for p in points {
      out.append(Double(p.x))
      out.append(Double(p.y))
    }
    return out
  }
}
