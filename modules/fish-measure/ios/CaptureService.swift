import ARKit
import CoreImage
import ImageIO
import simd

struct CaptureOptions {
  var outputDir: String
  var includePly = true
  var includeMaskPng = true
  var jpegQuality = 0.92
}

/// Writes catch artifacts (photo, fish point cloud, mask) and assembles the
/// capture payload. Measurement numbers come from the stability window, not
/// this instant; the high-res frame is used for pixels only — never for
/// measurement (it may lack depth entirely).
final class CaptureService {
  private let ciContext = CIContext(options: [.cacheIntermediates: false])
  private let ioQueue = DispatchQueue(label: "fish.capture.io", qos: .utility)

  /// Grabs the best available photo: high-res frame → the measurement
  /// frame's video image. (The RealityKit snapshot fallback stays JS-side.)
  func capturePhoto(
    session: ARSession,
    fallbackFrame: FrameInput,
    orientationMode: Int,
    options: CaptureOptions,
    highResEnabled: Bool,
    completion: @escaping (_ path: String?, _ width: Int, _ height: Int, _ source: String) -> Void
  ) {
    let write: (CVPixelBuffer, String) -> Void = { [weak self] buffer, source in
      guard let self else {
        completion(nil, 0, 0, source)
        return
      }
      self.ioQueue.async {
        let oriented = CIImage(cvPixelBuffer: buffer)
          .oriented(Orientation.exif(orientationMode))
        let url = URL(fileURLWithPath: options.outputDir).appendingPathComponent("photo.jpg")
        do {
          try FileManager.default.createDirectory(
            atPath: options.outputDir, withIntermediateDirectories: true)
          try self.ciContext.writeJPEGRepresentation(
            of: oriented, to: url, colorSpace: CGColorSpaceCreateDeviceRGB(),
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: options.jpegQuality])
          completion(url.path, Int(oriented.extent.width), Int(oriented.extent.height), source)
        } catch {
          completion(nil, 0, 0, source)
        }
      }
    }

    if highResEnabled {
      session.captureHighResolutionFrame { frame, _ in
        if let frame {
          write(frame.capturedImage, "highRes")
        } else {
          write(fallbackFrame.capturedImage, "videoFrame")
        }
      }
    } else {
      write(fallbackFrame.capturedImage, "videoFrame")
    }
  }

  /// Fish-only point cloud in world space, binary little-endian PLY with RGB.
  func writePly(
    mask: BinaryMask,
    frame: FrameInput,
    orientationMode: Int,
    minDepthConfidence: Int,
    outputDir: String,
    completion: @escaping (String?) -> Void
  ) {
    ioQueue.async {
      guard let sampler = DepthSampler(
        depthMap: frame.depthMap,
        confidenceMap: frame.confidenceMap,
        minConfidence: minDepthConfidence)
      else {
        completion(nil)
        return
      }

      let color = ColorSampler(pixelBuffer: frame.capturedImage)
      var body = Data()
      var count = 0
      // Stride keeps worst-case point counts sane on very large masks.
      let stride = max(1, Int((Double(mask.area) / 150_000).squareRoot().rounded(.up)))

      var y = 0
      while y < mask.height {
        var x = 0
        while x < mask.width {
          if mask.data[y * mask.width + x] == 1 {
            let norm = CGPoint(
              x: Double(x) / Double(mask.width), y: Double(y) / Double(mask.height))
            let sn = Orientation.orientedToSensorNorm(norm, mode: orientationMode)
            let px = CGPoint(
              x: sn.x * Double(frame.imageWidth), y: sn.y * Double(frame.imageHeight))
            if let z = sampler.medianDepth(
              atSensorPx: px, imageWidth: frame.imageWidth,
              imageHeight: frame.imageHeight, radius: 0) {
              let cam = CameraMath.unproject(
                u: px.x, v: px.y, depth: z, intrinsics: frame.intrinsics)
              let world = CameraMath.toWorld(cam, transform: frame.cameraTransform)
              var wx = world.x, wy = world.y, wz = world.z
              withUnsafeBytes(of: &wx) { body.append(contentsOf: $0) }
              withUnsafeBytes(of: &wy) { body.append(contentsOf: $0) }
              withUnsafeBytes(of: &wz) { body.append(contentsOf: $0) }
              let rgb = color?.rgb(atSensorX: Int(px.x), y: Int(px.y)) ?? (128, 128, 128)
              body.append(rgb.0)
              body.append(rgb.1)
              body.append(rgb.2)
              count += 1
            }
          }
          x += stride
        }
        y += stride
      }

      guard count > 100 else {
        completion(nil)
        return
      }
      var header = "ply\nformat binary_little_endian 1.0\n"
      header += "comment FishMeasure fish point cloud, world space, meters\n"
      header += "element vertex \(count)\n"
      header += "property float x\nproperty float y\nproperty float z\n"
      header += "property uchar red\nproperty uchar green\nproperty uchar blue\n"
      header += "end_header\n"
      var out = Data(header.utf8)
      out.append(body)
      let url = URL(fileURLWithPath: outputDir).appendingPathComponent("cloud.ply")
      do {
        try FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)
        try out.write(to: url)
        completion(url.path)
      } catch {
        completion(nil)
      }
    }
  }

  func writeMaskPng(mask: BinaryMask, outputDir: String, completion: @escaping (String?) -> Void) {
    ioQueue.async {
      var pixels = [UInt8](repeating: 0, count: mask.data.count)
      for i in 0..<mask.data.count where mask.data[i] == 1 {
        pixels[i] = 255
      }
      let cfData = CFDataCreate(nil, pixels, pixels.count)!
      guard let provider = CGDataProvider(data: cfData),
            let image = CGImage(
              width: mask.width, height: mask.height,
              bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: mask.width,
              space: CGColorSpaceCreateDeviceGray(),
              bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
      else {
        completion(nil)
        return
      }
      let url = URL(fileURLWithPath: outputDir).appendingPathComponent("mask.png")
      guard let dest = CGImageDestinationCreateWithURL(
        url as CFURL, "public.png" as CFString, 1, nil) else {
        completion(nil)
        return
      }
      CGImageDestinationAddImage(dest, image, nil)
      completion(CGImageDestinationFinalize(dest) ? url.path : nil)
    }
  }
}

/// Reads RGB from the camera's biplanar YCbCr buffer (full-range 420f).
/// Point-cloud color is cosmetic — BT.601-ish constants are fine.
final class ColorSampler {
  private let buffer: CVPixelBuffer
  private let yBase: UnsafePointer<UInt8>
  private let yStride: Int
  private let cbcrBase: UnsafePointer<UInt8>
  private let cbcrStride: Int
  private let width: Int
  private let height: Int

  init?(pixelBuffer: CVPixelBuffer) {
    guard CVPixelBufferGetPlaneCount(pixelBuffer) >= 2 else { return nil }
    buffer = pixelBuffer
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    guard let y = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0),
          let c = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1) else {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
      return nil
    }
    yBase = y.assumingMemoryBound(to: UInt8.self)
    yStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    cbcrBase = c.assumingMemoryBound(to: UInt8.self)
    cbcrStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)
    width = CVPixelBufferGetWidth(pixelBuffer)
    height = CVPixelBufferGetHeight(pixelBuffer)
  }

  deinit {
    CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
  }

  func rgb(atSensorX x: Int, y: Int) -> (UInt8, UInt8, UInt8)? {
    guard x >= 0, x < width, y >= 0, y < height else { return nil }
    let luma = Double(yBase[y * yStride + x])
    let ci = (x / 2) * 2
    let cb = Double(cbcrBase[(y / 2) * cbcrStride + ci]) - 128
    let cr = Double(cbcrBase[(y / 2) * cbcrStride + ci + 1]) - 128
    let r = luma + 1.402 * cr
    let g = luma - 0.344 * cb - 0.714 * cr
    let b = luma + 1.772 * cb
    return (
      UInt8(max(0, min(255, r))),
      UInt8(max(0, min(255, g))),
      UInt8(max(0, min(255, b))))
  }
}
