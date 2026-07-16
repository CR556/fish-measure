import type { StyleProp, ViewStyle } from 'react-native';

// ============================================================
// Build Round 1 contract. Every tunable is a prop with a Swift
// default — tuning never requires a native rebuild.
//
// Coordinate spaces:
// - events: RN view points (already display-transformed)
// - capture payloads: normalized upright-photo coordinates
//   (resolution-independent; drive share-card crops)
//
// NOTE on nested config props: the native side rebuilds each
// config object from defaults on every prop set, so always pass
// COMPLETE objects (missing fields = Swift defaults, not "leave
// unchanged").
// ============================================================

export type FishMode = 'auto' | 'manual' | 'off';
/** Legacy alias (EXIF metadata labeling). */
export type MeasureMode = FishMode;

export type Confidence = 'low' | 'medium' | 'high';
export type MeasureMethod = 'depth' | 'mesh' | 'existingPlane' | 'estimatedPlane' | 'anchor';
export type SubjectState = 'none' | 'candidate' | 'locked';

// ---------- events ----------

export type DistanceEvent = {
  /** Smoothed distance in meters (rolling median + EMA). Manual mode only. */
  meters: number;
  rawMeters: number;
  confidence: Confidence;
  mode: string;
  method: MeasureMethod;
  timestamp: number;
};

export type TrackingState = 'initializing' | 'normal' | 'limited' | 'notAvailable';

export type TrackingStateEvent = {
  state: TrackingState;
  reason?: 'excessiveMotion' | 'insufficientFeatures' | 'relocalizing';
};

export type MeasureErrorEvent = {
  code: string;
  message: string;
};

export type ProjectedPoint = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  cameraMeters: number;
};

export type ProjectedPointsEvent = {
  points: ProjectedPoint[];
  timestamp: number;
};

export type SubjectEvent = {
  state: SubjectState;
  /** Flat [x0,y0,x1,y1,…] outline in view points, ≤ contourMaxPoints. */
  contour: number[];
  bbox: { x: number; y: number; w: number; h: number };
  selectedBy: 'tap' | 'region' | 'largest' | null;
  instanceCount: number;
  areaFraction: number;
  aspectRatio: number;
  /** Raw classifier top-5 — powers live acceptLabels tuning from JS. */
  classifierTop: { label: string; confidence: number }[];
  fishScore: number;
  timestamp: number;
};

export type FishMeasurementEvent = {
  valid: boolean;
  /** Smoothed 3D centerline arc length — the headline number. */
  curvedM: number;
  rawCurvedM: number;
  /** Straight nose→tail line. */
  chordM: number;
  girthM: number | null;
  girthMethod: 'ellipse-aspect' | 'ellipse-bulge' | null;
  nose: { x: number; y: number };
  tail: { x: number; y: number };
  /** Flat view points of the spine, 32 samples (when overlay.emitCenterline). */
  centerline?: number[];
  /** Camera → fish centroid, meters. */
  distanceM: number;
  /** Fraction of centerline stations with real (unfitted) depth. */
  depthCoverage: number;
  confidence: number;
  /** Stability gate satisfied this frame; JS edge-detects auto-capture. */
  stable: boolean;
  stableForMs: number;
  timestamp: number;
};

export type DebugInfoEvent = {
  segMs: number;
  personSegMs: number;
  contourMs: number;
  centerlineMs: number;
  depthLiftMs: number;
  classifyMs: number;
  droppedFrames: number;
  depthDropoutFraction: number;
  /** Why the frame isn't a green lock: '' | 'no-subject' | 'centerline' | 'depth' | 'not-fish'. */
  lockBlocker: string;
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown';
  timestamp: number;
};

// ---------- config props ----------

export type SmoothingConfig = {
  medianWindow?: number;
  emaAlpha?: number;
};

export type SegmentationConfig = {
  /** Vision cadence, default 10. */
  hz?: number;
  /** Which LiDAR depth map feeds measurement. Default 'smoothed'. */
  depthSource?: 'raw' | 'smoothed';
  /** ARConfidenceLevel floor 0–2, default 1. */
  minDepthConfidence?: 0 | 1 | 2;
  /** Subtract the person-segmentation mask. Default true. */
  personExclusion?: boolean;
  /** >0 shrinks the person mask; <0 grows it (covers missed arms). Default -2. */
  personMaskErosionPx?: number;
  /** 0 = balanced (fast), 1 = accurate (better bare-arm coverage, slower). */
  personSegQuality?: 0 | 1;
  /** Downscale detection frames to this longest side (captures stay full-res).
   * Fixes multi-second Vision passes on the high-res video format. Default 1024. */
  visionMaxDim?: number;
  /** Custom segmenter mask cut 0-255; lower = more permissive. Default 128. */
  segmenterMaskThreshold?: number;
  /** Trim mask pixels whose depth strays this far (m) from the fish median —
   * removes background clutter merged into the subject. 0 disables. Default 0.2. */
  depthTrimM?: number;
  minAreaFraction?: number;
  maxAreaFraction?: number;
  /** Elongation gates (sqrt of covariance eigenvalue ratio). */
  minAspectRatio?: number;
  maxAspectRatio?: number;
  /** Normalized view rect that biases instance selection (ghost outline). */
  priorityRegion?: { x: number; y: number; w: number; h: number };
  /** ESCAPE HATCH: runtime CoreML segmenter replaces subject lift. */
  segmenterModelPath?: string | null;
  /** 0=.right (portrait default) 1=.left 2=.up 3=.down — field-tunable. */
  orientationMode?: 0 | 1 | 2 | 3;
};

export type ClassifierConfig = {
  enabled?: boolean;
  hz?: number;
  /** VNClassifyImageRequest labels counted as fish. Tune from the spike. */
  acceptLabels?: string[];
  minConfidence?: number;
  vetoLabels?: string[];
  /** ESCAPE HATCH: runtime CoreML classifier. */
  modelPath?: string | null;
  /** When false (default), geometry gates alone may lock. */
  required?: boolean;
};

export type CenterlineConfig = {
  algorithm?: 'pca' | 'skeleton';
  bins?: number;
  depthSampleRadiusPx?: number;
  depthFitDegree?: number;
  outlierRejectSigma?: number;
  maxGapBinFraction?: number;
  minValidBinFraction?: number;
};

export type GirthConfig = {
  /** Ellipse b/a when the depth bulge is unusable. Default 0.5. */
  aspect?: number;
  useDepthBulge?: boolean;
  calibration?: number;
};

export type StabilityConfig = {
  windowMs?: number;
  maxDeltaCm?: number;
  maxDeltaFraction?: number;
  minDistanceM?: number;
  maxDistanceM?: number;
  minDepthCoverage?: number;
};

export type OverlayConfig = {
  contourMaxPoints?: number;
  emitCenterline?: boolean;
};

// ---------- view props ----------

export type FishMeasureViewProps = {
  mode: FishMode;
  /** Distance/tracking event throttle, 1–60. Default 15. */
  updateHz?: number;
  /** Applied to the curved length (auto) and crosshair distance (manual). */
  smoothing?: SmoothingConfig;
  /** Marker spheres on manual-mode anchors. Default true. */
  showNativeMarkers?: boolean;
  /** Scene mesh for manual raycasts. Off = perf headroom in auto. Default true. */
  enableSceneReconstruction?: boolean;
  /** Use the high-res-capture video format. Default true. */
  enableHighResCapture?: boolean;
  segmentation?: SegmentationConfig;
  classifier?: ClassifierConfig;
  centerline?: CenterlineConfig;
  girth?: GirthConfig;
  stability?: StabilityConfig;
  overlay?: OverlayConfig;
  /** Streams onDebugInfo. */
  debugMode?: boolean;
  /** Colorized depth layer over the camera (dropout diagnosis). */
  debugDepthOverlay?: boolean;
  heatmapRange?: { min: number; max: number };
  heatmapOpacity?: number;
  heatmapColors?: string[];
  heatmapRotation?: number;
  heatmapAutoRange?: boolean;
  onDistance?: (event: { nativeEvent: DistanceEvent }) => void;
  onTrackingState?: (event: { nativeEvent: TrackingStateEvent }) => void;
  onError?: (event: { nativeEvent: MeasureErrorEvent }) => void;
  onProjectedPoints?: (event: { nativeEvent: ProjectedPointsEvent }) => void;
  onHeatmapRange?: (event: { nativeEvent: { min: number; max: number } }) => void;
  onSubject?: (event: { nativeEvent: SubjectEvent }) => void;
  onFishMeasurement?: (event: { nativeEvent: FishMeasurementEvent }) => void;
  onDebugInfo?: (event: { nativeEvent: DebugInfoEvent }) => void;
  style?: StyleProp<ViewStyle>;
};

// ---------- capture ----------

export type CaptureOptions = {
  /** Absolute directory the native side writes into (JS owns the layout). */
  outputDir: string;
  includePly?: boolean;
  includeMaskPng?: boolean;
  jpegQuality?: number;
};

export type Intrinsics = {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

export type AutoCapturePayload = {
  photoPath: string;
  photoWidth: number;
  photoHeight: number;
  photoSource: 'highRes' | 'videoFrame' | 'snapshot';
  /** Stability-window median when available, not the capture instant. */
  curvedM: number;
  chordM: number;
  girthM: number | null;
  girthMethod: string | null;
  confidence: number;
  distanceM: number;
  depthCoverage: number;
  windowMedianCurvedM: number;
  windowStdDevM: number;
  windowFrames: number;
  /** Flat normalized upright-photo coords. */
  contour: number[];
  noseNorm: [number, number];
  tailNorm: [number, number];
  /** Flat [x,y,z,…] world-space spine — enables future re-measurement. */
  centerline3D: number[];
  plyPath: string | null;
  maskPngPath: string | null;
  intrinsics: Intrinsics;
  measureMode: 'auto';
  timestamp: number;
};

export type ManualPathResult = {
  curvedM: number;
  chordM: number;
  sampleCount: number;
  validFraction: number;
};

export type ManualCapturePayload = {
  photoPath: string;
  photoWidth: number;
  photoHeight: number;
  photoSource: 'highRes' | 'videoFrame' | 'snapshot';
  curvedM: number;
  chordM: number;
  /** Manual mode: the surface-path valid fraction. */
  confidence: number;
  distanceM: number;
  pointANorm: [number, number] | null;
  pointBNorm: [number, number] | null;
  /** Flat normalized photo coords of the sampled surface path. */
  pathPointsNorm: number[];
  plyPath: string | null;
  maskPngPath: string | null;
  intrinsics: Intrinsics;
  measureMode: 'manual';
  timestamp: number;
};

export type MeasureResult = {
  meters: number;
  confidence: Confidence;
  anchorId: string;
  method: MeasureMethod;
  worldPoint: { x: number; y: number; z: number };
} | null;

// ---------- ref ----------

export type FishMeasureViewRef = {
  /** Sticky selection bias at view-local points; cleared by clearSubject or subject loss. */
  setTapHint(x: number, y: number): Promise<void>;
  clearSubject(): Promise<void>;
  /** Null when there is no valid measurement to capture. */
  captureAutoCatch(options: CaptureOptions): Promise<AutoCapturePayload | null>;
  /** Manual mode: raycast + drop an anchor. Null on a miss. */
  measureAtPoint(x: number, y: number): Promise<MeasureResult>;
  measureManualPath(
    anchorIdA: string,
    anchorIdB: string,
    samples: number
  ): Promise<ManualPathResult | null>;
  captureManualCatch(
    anchorIdA: string,
    anchorIdB: string,
    options: CaptureOptions
  ): Promise<ManualCapturePayload | null>;
  clearAnchors(): Promise<void>;
  removeAnchor(anchorId: string): Promise<void>;
  /** Fallback capture: RealityKit snapshot (no JS overlay). Tmp file path. */
  snapshotCamera(): Promise<string>;
};
