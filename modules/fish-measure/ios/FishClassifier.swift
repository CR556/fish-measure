import CoreGraphics
import CoreImage
import CoreML
import Vision

struct ClassificationResult {
  var top: [(label: String, confidence: Double)] = []
  var fishScore = 0.0
  var vetoed = false
}

/// "Is this subject a fish?" gate. Runs VNClassifyImageRequest on the
/// masked subject's crop at a low sub-cadence (default 2 Hz) and keeps the
/// last result sticky between runs. Swift stays label-agnostic: the raw
/// top-5 stream goes to JS, and JS owns which labels count as fish
/// (acceptLabels) or hard-reject (vetoLabels) — the M1 field spike tunes
/// those lists live with no rebuild.
final class FishClassifier {
  private let ciContext = CIContext(options: [.cacheIntermediates: false])
  private var lastResult = ClassificationResult()
  private var lastRunTime = 0.0
  private var customModel: VNCoreMLModel?
  private var loadedModelPath: String?

  func reset() {
    lastResult = ClassificationResult()
    lastRunTime = 0
  }

  /// Returns the sticky result, refreshing it when the sub-cadence is due.
  /// `bboxOrientedNorm` is the subject bbox in normalized upright coords.
  func classify(
    frame: FrameInput,
    bboxOrientedNorm: CGRect,
    config: ClassifierConfig,
    orientationMode: Int,
    now: Double
  ) -> ClassificationResult {
    guard config.enabled else { return ClassificationResult() }
    guard now - lastRunTime >= 1.0 / max(0.1, config.hz) else { return lastResult }
    lastRunTime = now

    guard let crop = croppedSubject(
      frame: frame, bboxOrientedNorm: bboxOrientedNorm, orientationMode: orientationMode
    ) else {
      return lastResult
    }

    var observations: [(String, Double)] = []
    if let path = config.modelPath {
      observations = classifyWithCustomModel(path: path, cgImage: crop)
    } else {
      let request = VNClassifyImageRequest()
      let handler = VNImageRequestHandler(cgImage: crop, options: [:])
      guard (try? handler.perform([request])) != nil,
            let results = request.results else {
        return lastResult
      }
      observations = results.map { ($0.identifier, Double($0.confidence)) }
    }

    var result = ClassificationResult()
    result.top = Array(
      observations.sorted { $0.1 > $1.1 }.prefix(5)
    ).map { (label: $0.0, confidence: $0.1) }

    let accept = Set(config.acceptLabels.map { $0.lowercased() })
    let veto = Set(config.vetoLabels.map { $0.lowercased() })
    var vetoScore = 0.0
    for (label, confidence) in observations {
      let key = label.lowercased()
      if accept.contains(key) {
        result.fishScore = max(result.fishScore, confidence)
      }
      if veto.contains(key) {
        vetoScore = max(vetoScore, confidence)
      }
    }
    result.vetoed = vetoScore >= config.minConfidence && vetoScore > result.fishScore

    lastResult = result
    return result
  }

  /// Upright crop of the subject bbox (+15% padding) as a CGImage. Must use
  /// the same orientation the segmenter used, since the bbox lives in that
  /// oriented space.
  private func croppedSubject(
    frame: FrameInput, bboxOrientedNorm: CGRect, orientationMode: Int
  ) -> CGImage? {
    let oriented = CIImage(cvPixelBuffer: frame.capturedImage)
      .oriented(Orientation.exif(orientationMode))
    let w = oriented.extent.width
    let h = oriented.extent.height

    let pad: CGFloat = 0.15
    let bx = max(0, bboxOrientedNorm.origin.x - bboxOrientedNorm.width * pad)
    let by = max(0, bboxOrientedNorm.origin.y - bboxOrientedNorm.height * pad)
    let bw = min(1 - bx, bboxOrientedNorm.width * (1 + 2 * pad))
    let bh = min(1 - by, bboxOrientedNorm.height * (1 + 2 * pad))

    // CIImage origin is bottom-left; bbox is top-left based.
    let rect = CGRect(
      x: bx * w,
      y: h * (1 - by - bh),
      width: bw * w,
      height: bh * h
    ).integral
    guard rect.width > 16, rect.height > 16 else { return nil }
    return ciContext.createCGImage(oriented.cropped(to: rect), from: rect)
  }

  private func classifyWithCustomModel(path: String, cgImage: CGImage) -> [(String, Double)] {
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
        return []
      }
    }
    guard let model = customModel else { return [] }
    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .centerCrop
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    guard (try? handler.perform([request])) != nil,
          let results = request.results as? [VNClassificationObservation] else {
      return []
    }
    return results.map { ($0.identifier, Double($0.confidence)) }
  }
}
