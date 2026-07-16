import CoreImage
import CoreVideo

/// Downscales camera frames for Vision work. The high-res capture video
/// format (enabled for crisp catch photos) made VNGenerateForegroundInstance-
/// MaskRequest take ~1.5 s per pass; detection quality doesn't need 4K.
/// All Vision outputs are normalized, so masks/contours are unaffected —
/// only the pixels Vision looks at shrink.
final class VisionDownscaler {
  private let context = CIContext(options: [.cacheIntermediates: false])
  private var pool: CVPixelBufferPool?
  private var poolWidth = 0
  private var poolHeight = 0

  /// Returns a scaled BGRA buffer with the longest side ≤ maxDim, or nil
  /// (caller falls back to the original) on any failure.
  func scale(_ source: CVPixelBuffer, maxDim: Int) -> CVPixelBuffer? {
    let w = CVPixelBufferGetWidth(source)
    let h = CVPixelBufferGetHeight(source)
    guard maxDim > 0, max(w, h) > maxDim else { return nil } // already small

    let s = Double(maxDim) / Double(max(w, h))
    let outW = max(64, Int((Double(w) * s).rounded()))
    let outH = max(64, Int((Double(h) * s).rounded()))

    if pool == nil || poolWidth != outW || poolHeight != outH {
      let attrs: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: outW,
        kCVPixelBufferHeightKey as String: outH,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:],
      ]
      var newPool: CVPixelBufferPool?
      CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &newPool)
      pool = newPool
      poolWidth = outW
      poolHeight = outH
    }
    guard let pool else { return nil }

    var output: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &output)
    guard let output else { return nil }

    let image = CIImage(cvPixelBuffer: source)
      .transformed(by: CGAffineTransform(scaleX: s, y: s))
    context.render(image, to: output)
    return output
  }
}
