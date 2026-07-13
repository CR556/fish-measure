import CoreGraphics
import CoreML
import Vision

struct SegmentationOutput {
  var mask: BinaryMask           // selected instance, person-subtracted
  var selectedBy: String         // "tap" | "region" | "largest"
  var instanceCount: Int
  var areaFraction: Double
  var elongation: Double
  var centroidOrientedNorm: CGPoint
  var bboxOrientedNorm: CGRect
  var personSegMs: Double
}

/// Finds the fish among Vision's lifted subjects. Selection priority:
/// user tap → ghost-outline priority region → largest gated instance.
/// Hands/arms are handled two ways: person-segmentation subtraction, and the
/// elongation/area gates (a torso blob isn't 1.8–10× longer than wide).
final class SubjectSegmenter {
  private var customModel: VNCoreMLModel?
  private var loadedModelPath: String?

  func segment(
    frame: FrameInput,
    config: SegmentationConfig,
    tapOrientedNorm: CGPoint?,
    priorityOrientedNorm: CGRect?
  ) -> SegmentationOutput? {
    if let path = config.segmenterModelPath {
      return segmentWithCustomModel(path: path, frame: frame, config: config)
    }

    let subjectRequest = VNGenerateForegroundInstanceMaskRequest()
    var personRequest: VNGeneratePersonSegmentationRequest?
    if config.personExclusion {
      let req = VNGeneratePersonSegmentationRequest()
      req.qualityLevel = .balanced
      req.outputPixelFormat = kCVPixelFormatType_OneComponent8
      personRequest = req
    }

    let handler = VNImageRequestHandler(
      cvPixelBuffer: frame.capturedImage,
      orientation: Orientation.exif(config.orientationMode),
      options: [:])
    let personStart = CFAbsoluteTimeGetCurrent()
    do {
      var requests: [VNRequest] = [subjectRequest]
      if let personRequest {
        requests.append(personRequest)
      }
      try handler.perform(requests)
    } catch {
      return nil
    }
    let visionMs = (CFAbsoluteTimeGetCurrent() - personStart) * 1000

    guard let observation = subjectRequest.results?.first,
          var labelMap = LabelMap(pixelBuffer: observation.instanceMask) else {
      return nil
    }

    // Carve the angler out BEFORE stats/gating/selection — a merged
    // person+fish instance must not win selection or drive the contour.
    if let personBuffer = personRequest?.results?.first?.pixelBuffer,
       let person = personMask(from: personBuffer) {
      labelMap = labelMap.subtracting(person: person, erosionPx: config.personMaskErosionPx)
    }

    let statsByInstance = InstanceStats.compute(from: labelMap)
    guard !statsByInstance.isEmpty else { return nil }
    let totalPixels = Double(labelMap.width * labelMap.height)

    func gated(_ s: InstanceStats) -> Bool {
      let area = Double(s.count) / totalPixels
      return area >= config.minAreaFraction && area <= config.maxAreaFraction
        && s.elongation >= config.minAspectRatio && s.elongation <= config.maxAspectRatio
    }

    var selected: (label: UInt8, stats: InstanceStats, by: String)?

    // 1. Tap hint: instance under the tap, else nearest gated centroid.
    // The user's explicit hint bypasses the shape gates (they know better),
    // keeping only a tiny area floor against stray specks.
    if let tap = tapOrientedNorm {
      let tx = Int(tap.x * Double(labelMap.width))
      let ty = Int(tap.y * Double(labelMap.height))
      if tx >= 0, tx < labelMap.width, ty >= 0, ty < labelMap.height {
        let under = labelMap.data[ty * labelMap.width + tx]
        if under != 0, let s = statsByInstance[under],
           Double(s.count) / totalPixels >= 0.005 {
          selected = (under, s, "tap")
        }
      }
      if selected == nil {
        var best: (UInt8, InstanceStats, Double)?
        for (label, s) in statsByInstance where Double(s.count) / totalPixels >= 0.005 {
          let c = s.centroid
          let d = hypot(c.x / Double(labelMap.width) - tap.x, c.y / Double(labelMap.height) - tap.y)
          if d < 0.25 && (best == nil || d < best!.2) {
            best = (label, s, Double(d))
          }
        }
        if let best {
          selected = (best.0, best.1, "tap")
        }
      }
    }

    // 2. Priority region (ghost outline area): gated instance with the
    // largest bbox overlap.
    if selected == nil, let region = priorityOrientedNorm {
      let regionPx = CGRect(
        x: region.origin.x * Double(labelMap.width),
        y: region.origin.y * Double(labelMap.height),
        width: region.width * Double(labelMap.width),
        height: region.height * Double(labelMap.height))
      var best: (UInt8, InstanceStats, Double)?
      for (label, s) in statsByInstance where gated(s) {
        let overlap = s.bbox.intersection(regionPx)
        guard !overlap.isNull, overlap.width > 0 else { continue }
        let a = Double(overlap.width) * Double(overlap.height)
        if best == nil || a > best!.2 {
          best = (label, s, a)
        }
      }
      if let best {
        selected = (best.0, best.1, "region")
      }
    }

    // 3. Largest gated instance.
    if selected == nil {
      var best: (UInt8, InstanceStats)?
      for (label, s) in statsByInstance where gated(s) {
        if best == nil || s.count > best!.1.count {
          best = (label, s)
        }
      }
      if let best {
        selected = (best.0, best.1, "largest")
      }
    }

    guard let sel = selected else { return nil }

    // Person pixels are already gone; keep the biggest connected piece so a
    // shattered instance doesn't hand a stray fragment to the measurer.
    let mask = BinaryMask(from: labelMap, instance: sel.label).largestComponent()
    guard mask.area > 16 else { return nil }

    let bbox = sel.stats.bbox
    return SegmentationOutput(
      mask: mask,
      selectedBy: sel.by,
      instanceCount: statsByInstance.count,
      areaFraction: Double(sel.stats.count) / totalPixels,
      elongation: sel.stats.elongation,
      centroidOrientedNorm: CGPoint(
        x: sel.stats.centroid.x / Double(labelMap.width),
        y: sel.stats.centroid.y / Double(labelMap.height)),
      bboxOrientedNorm: CGRect(
        x: bbox.origin.x / Double(labelMap.width),
        y: bbox.origin.y / Double(labelMap.height),
        width: bbox.width / Double(labelMap.width),
        height: bbox.height / Double(labelMap.height)),
      personSegMs: visionMs)
  }

  /// Escape hatch: a runtime-loaded CoreML segmenter replaces subject lifting
  /// with no rebuild. Contract: the model outputs a single-channel mask
  /// (OneComponent8, ≥128 = fish). Compiled (.mlmodelc) or raw (.mlmodel)
  /// paths both work.
  private func segmentWithCustomModel(
    path: String, frame: FrameInput, config: SegmentationConfig
  ) -> SegmentationOutput? {
    if loadedModelPath != path {
      customModel = nil
      loadedModelPath = path
      let url = URL(fileURLWithPath: path)
      do {
        let compiledURL = url.pathExtension == "mlmodelc"
          ? url
          : try MLModel.compileModel(at: url)
        customModel = try VNCoreMLModel(for: try MLModel(contentsOf: compiledURL))
      } catch {
        return nil
      }
    }
    guard let model = customModel else { return nil }

    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .scaleFill
    let handler = VNImageRequestHandler(
      cvPixelBuffer: frame.capturedImage,
      orientation: Orientation.exif(config.orientationMode),
      options: [:])
    guard (try? handler.perform([request])) != nil,
          let obs = request.results?.first as? VNPixelBufferObservation,
          let mask = personMask(from: obs.pixelBuffer) else {
      return nil
    }

    // Treat the whole model output as one instance; reuse the stats math.
    var stats = InstanceStats()
    for y in 0..<mask.height {
      for x in 0..<mask.width where mask.data[y * mask.width + x] == 1 {
        stats.count += 1
        let dx = Double(x), dy = Double(y)
        stats.sumX += dx; stats.sumY += dy
        stats.sumXX += dx * dx; stats.sumYY += dy * dy; stats.sumXY += dx * dy
        if x < stats.minX { stats.minX = x }; if x > stats.maxX { stats.maxX = x }
        if y < stats.minY { stats.minY = y }; if y > stats.maxY { stats.maxY = y }
      }
    }
    let total = Double(mask.width * mask.height)
    guard Double(stats.count) / total >= config.minAreaFraction else { return nil }
    let bbox = stats.bbox
    return SegmentationOutput(
      mask: mask,
      selectedBy: "largest",
      instanceCount: 1,
      areaFraction: Double(stats.count) / total,
      elongation: stats.elongation,
      centroidOrientedNorm: CGPoint(
        x: stats.centroid.x / Double(mask.width),
        y: stats.centroid.y / Double(mask.height)),
      bboxOrientedNorm: CGRect(
        x: bbox.origin.x / Double(mask.width),
        y: bbox.origin.y / Double(mask.height),
        width: bbox.width / Double(mask.width),
        height: bbox.height / Double(mask.height)),
      personSegMs: 0)
  }
}
