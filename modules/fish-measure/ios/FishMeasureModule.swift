import ARKit
import ExpoModulesCore
import ImageIO
import Photos

// MARK: - Prop records (JS objects → typed Swift)
// NOTE: Records rebuild from defaults on every prop set — JS must always pass
// complete objects (the JS config layer owns merging partial updates).

struct SmoothingParams: Record {
  @Field var medianWindow: Int = 5
  @Field var emaAlpha: Double = 0.3
}

struct PriorityRegionParams: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var w: Double = 0
  @Field var h: Double = 0
}

struct SegmentationParams: Record {
  @Field var hz: Double = 10
  @Field var depthSource: String = "smoothed"
  @Field var minDepthConfidence: Int = 1
  @Field var personExclusion: Bool = true
  @Field var personMaskErosionPx: Int = 2
  @Field var minAreaFraction: Double = 0.02
  @Field var maxAreaFraction: Double = 0.6
  @Field var minAspectRatio: Double = 1.8
  @Field var maxAspectRatio: Double = 10
  @Field var priorityRegion: PriorityRegionParams?
  @Field var segmenterModelPath: String?
  @Field var orientationMode: Int = 0
}

struct ClassifierParams: Record {
  @Field var enabled: Bool = true
  @Field var hz: Double = 2
  @Field var acceptLabels: [String] = ["fish", "salmon", "trout", "bass", "carp", "goldfish", "koi", "pike", "catfish", "perch"]
  @Field var minConfidence: Double = 0.15
  @Field var vetoLabels: [String] = []
  @Field var modelPath: String?
  @Field var required: Bool = false
}

struct CenterlineParams: Record {
  @Field var algorithm: String = "pca"
  @Field var bins: Int = 48
  @Field var depthSampleRadiusPx: Int = 2
  @Field var depthFitDegree: Int = 3
  @Field var outlierRejectSigma: Double = 2.5
  @Field var maxGapBinFraction: Double = 0.25
  @Field var minValidBinFraction: Double = 0.5
}

struct GirthParams: Record {
  @Field var aspect: Double = 0.5
  @Field var useDepthBulge: Bool = true
  @Field var calibration: Double = 1.0
}

struct StabilityParams: Record {
  @Field var windowMs: Double = 750
  @Field var maxDeltaCm: Double = 0.5
  @Field var maxDeltaFraction: Double = 0.015
  @Field var minDistanceM: Double = 0.3
  @Field var maxDistanceM: Double = 2.5
  @Field var minDepthCoverage: Double = 0.7
}

struct OverlayParams: Record {
  @Field var contourMaxPoints: Int = 120
  @Field var emitCenterline: Bool = true
}

struct CaptureOptionsParams: Record {
  @Field var outputDir: String = ""
  @Field var includePly: Bool = true
  @Field var includeMaskPng: Bool = true
  @Field var jpegQuality: Double = 0.92
}

public class FishMeasureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FishMeasure")

    // Pre-render capability gate.
    Function("isLidarSupported") { () -> Bool in
      ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    /// Embeds catch metadata into EXIF (UserComment + optional GPS) and TIFF
    /// (ImageDescription), then saves to the camera roll (add-only access).
    AsyncFunction("saveImageToPhotos") { (path: String, userComment: String, imageDescription: String, gps: [String: Double]?, promise: Promise) in
      let sourceURL: URL
      if path.hasPrefix("file://"), let parsed = URL(string: path) {
        sourceURL = parsed
      } else {
        sourceURL = URL(fileURLWithPath: path)
      }

      guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
            let sourceType = CGImageSourceGetType(source) else {
        promise.reject("capture_read_failed", "Could not read the captured image.")
        return
      }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension("jpg")
      guard let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, sourceType, 1, nil) else {
        promise.reject("capture_write_failed", "Could not create the output image.")
        return
      }

      var properties = (CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]) ?? [:]
      var exif = (properties[kCGImagePropertyExifDictionary] as? [CFString: Any]) ?? [:]
      exif[kCGImagePropertyExifUserComment] = userComment
      properties[kCGImagePropertyExifDictionary] = exif
      var tiff = (properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]) ?? [:]
      tiff[kCGImagePropertyTIFFImageDescription] = imageDescription
      properties[kCGImagePropertyTIFFDictionary] = tiff
      if let gps, let lat = gps["lat"], let lon = gps["lon"] {
        var gpsDict: [CFString: Any] = [:]
        gpsDict[kCGImagePropertyGPSLatitude] = abs(lat)
        gpsDict[kCGImagePropertyGPSLatitudeRef] = lat >= 0 ? "N" : "S"
        gpsDict[kCGImagePropertyGPSLongitude] = abs(lon)
        gpsDict[kCGImagePropertyGPSLongitudeRef] = lon >= 0 ? "E" : "W"
        properties[kCGImagePropertyGPSDictionary] = gpsDict
      }

      CGImageDestinationAddImageFromSource(destination, source, 0, properties as CFDictionary)
      guard CGImageDestinationFinalize(destination) else {
        promise.reject("capture_write_failed", "Could not write image metadata.")
        return
      }

      PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        guard status == .authorized || status == .limited else {
          promise.reject("photos_permission_denied", "Allow photo additions in Settings to save captures.")
          return
        }
        PHPhotoLibrary.shared().performChanges({
          PHAssetCreationRequest.forAsset().addResource(with: .photo, fileURL: outputURL, options: nil)
        }) { success, error in
          if success {
            promise.resolve(nil)
          } else {
            promise.reject("photos_save_failed", error?.localizedDescription ?? "Unknown Photos error.")
          }
        }
      }
    }

    View(FishARView.self) {
      Events(
        "onDistance", "onTrackingState", "onError", "onProjectedPoints",
        "onHeatmapRange", "onSubject", "onFishMeasurement", "onDebugInfo")

      Prop("mode") { (view: FishARView, mode: String) in
        view.setMode(mode)
      }

      Prop("updateHz") { (view: FishARView, hz: Double) in
        view.setUpdateHz(hz)
      }

      Prop("smoothing") { (view: FishARView, params: SmoothingParams) in
        view.setSmoothing(medianWindow: params.medianWindow, emaAlpha: params.emaAlpha)
      }

      Prop("showNativeMarkers") { (view: FishARView, show: Bool) in
        view.setShowMarkers(show)
      }

      Prop("enableSceneReconstruction") { (view: FishARView, enabled: Bool) in
        view.setEnableSceneReconstruction(enabled)
      }

      Prop("enableHighResCapture") { (view: FishARView, enabled: Bool) in
        view.setEnableHighResCapture(enabled)
      }

      Prop("segmentation") { (view: FishARView, params: SegmentationParams) in
        view.setSegmentation(params)
      }

      Prop("classifier") { (view: FishARView, params: ClassifierParams) in
        view.setClassifier(params)
      }

      Prop("centerline") { (view: FishARView, params: CenterlineParams) in
        view.setCenterline(params)
      }

      Prop("girth") { (view: FishARView, params: GirthParams) in
        view.setGirth(params)
      }

      Prop("stability") { (view: FishARView, params: StabilityParams) in
        view.setStability(params)
      }

      Prop("overlay") { (view: FishARView, params: OverlayParams) in
        view.setOverlay(params)
      }

      Prop("debugMode") { (view: FishARView, enabled: Bool) in
        view.setDebugMode(enabled)
      }

      Prop("debugDepthOverlay") { (view: FishARView, enabled: Bool) in
        view.setDebugDepthOverlay(enabled)
      }

      Prop("heatmapRange") { (view: FishARView, range: HeatmapRange) in
        view.setHeatmapRange(min: range.min, max: range.max)
      }

      Prop("heatmapOpacity") { (view: FishARView, opacity: Double) in
        view.setHeatmapOpacity(opacity)
      }

      Prop("heatmapColors") { (view: FishARView, colors: [String]) in
        view.setHeatmapColors(colors)
      }

      Prop("heatmapRotation") { (view: FishARView, degrees: Int) in
        view.setHeatmapRotation(degrees)
      }

      Prop("heatmapAutoRange") { (view: FishARView, enabled: Bool) in
        view.setHeatmapAutoRange(enabled)
      }

      AsyncFunction("setTapHint") { (view: FishARView, x: Double, y: Double) in
        view.setTapHint(x: x, y: y)
      }.runOnQueue(.main)

      AsyncFunction("clearSubject") { (view: FishARView) in
        view.clearSubject()
      }.runOnQueue(.main)

      AsyncFunction("captureAutoCatch") { (view: FishARView, options: CaptureOptionsParams, promise: Promise) in
        view.captureAutoCatch(
          options: CaptureOptions(
            outputDir: options.outputDir,
            includePly: options.includePly,
            includeMaskPng: options.includeMaskPng,
            jpegQuality: options.jpegQuality),
          promise: promise)
      }.runOnQueue(.main)

      AsyncFunction("measureAtPoint") { (view: FishARView, x: Double, y: Double) -> [String: Any]? in
        view.measureAtPoint(x: x, y: y)
      }.runOnQueue(.main)

      AsyncFunction("measureManualPath") { (view: FishARView, anchorIdA: String, anchorIdB: String, samples: Int) -> [String: Any]? in
        view.measureManualPath(anchorIdA: anchorIdA, anchorIdB: anchorIdB, samples: samples)
      }.runOnQueue(.main)

      AsyncFunction("captureManualCatch") { (view: FishARView, anchorIdA: String, anchorIdB: String, options: CaptureOptionsParams, promise: Promise) in
        view.captureManualCatch(
          anchorIdA: anchorIdA,
          anchorIdB: anchorIdB,
          options: CaptureOptions(
            outputDir: options.outputDir,
            includePly: options.includePly,
            includeMaskPng: options.includeMaskPng,
            jpegQuality: options.jpegQuality),
          promise: promise)
      }.runOnQueue(.main)

      AsyncFunction("clearAnchors") { (view: FishARView) in
        view.clearAnchors()
      }.runOnQueue(.main)

      AsyncFunction("removeAnchor") { (view: FishARView, anchorId: String) in
        view.removeAnchor(id: anchorId)
      }.runOnQueue(.main)

      // Fallback capture path: RealityKit's own snapshot of the AR view
      // (camera + markers, no JS overlay).
      AsyncFunction("snapshotCamera") { (view: FishARView, promise: Promise) in
        view.snapshotCamera(promise: promise)
      }.runOnQueue(.main)
    }
  }
}

struct HeatmapRange: Record {
  @Field var min: Double = 0.3
  @Field var max: Double = 5.0
}
