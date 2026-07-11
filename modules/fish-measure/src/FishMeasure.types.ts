import type { StyleProp, ViewStyle } from 'react-native';

/**
 * M0 bootstrap surface — the distance-app API carried over so the renamed
 * module builds and the placeholder Measure screen works end-to-end.
 * Replaced wholesale by the fish pipeline surface in Build Round 1 (M1).
 */

export type MeasureMode = 'rearTap' | 'rearCrosshair' | 'heatmap';

export type Confidence = 'low' | 'medium' | 'high';

/** Which measurement source produced a reading. */
export type MeasureMethod = 'mesh' | 'existingPlane' | 'estimatedPlane' | 'anchor';

export type DistanceEvent = {
  /** Smoothed distance in meters (rolling median + EMA). */
  meters: number;
  /** Unsmoothed distance, for the debug overlay. */
  rawMeters: number;
  confidence: Confidence;
  mode: MeasureMode;
  method: MeasureMethod;
  /** ms since epoch */
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

/** One tapped point projected into screen space, refreshed every frame tick. */
export type ProjectedPoint = {
  id: string;
  /** Screen coordinates in RN points. Meaningless when `visible` is false. */
  x: number;
  y: number;
  /** False when the point is behind the camera or unprojectable. */
  visible: boolean;
  /** Live distance from the camera to this point, in meters. */
  cameraMeters: number;
};

export type ProjectedPointsEvent = {
  points: ProjectedPoint[];
  /** ms since epoch */
  timestamp: number;
};

export type MeasureResult = {
  meters: number;
  confidence: Confidence;
  anchorId: string;
  method: MeasureMethod;
  worldPoint: { x: number; y: number; z: number };
} | null;

export type SmoothingConfig = {
  /** Rolling median window size. Default 5. */
  medianWindow?: number;
  /** EMA smoothing factor 0–1 (lower = smoother, laggier). Default 0.3. */
  emaAlpha?: number;
};

export type FishMeasureViewProps = {
  mode: MeasureMode;
  /** Distance event rate, 1–60. Default 15. */
  updateHz?: number;
  smoothing?: SmoothingConfig;
  /** Render native marker spheres at tapped points. Default true. */
  showNativeMarkers?: boolean;
  /** Distance range mapped across the heatmap color ramp (meters). */
  heatmapRange?: { min: number; max: number };
  /** Heatmap layer opacity over the camera feed, 0–1. Default 0.65. */
  heatmapOpacity?: number;
  /** Color ramp stops (hex), near → far. */
  heatmapColors?: string[];
  /** Rotation applied to the sensor-orientation depth map. Default 90. */
  heatmapRotation?: number;
  /** Auto mode: ramp far end tracks the furthest visible object. */
  heatmapAutoRange?: boolean;
  onDistance?: (event: { nativeEvent: DistanceEvent }) => void;
  onTrackingState?: (event: { nativeEvent: TrackingStateEvent }) => void;
  onError?: (event: { nativeEvent: MeasureErrorEvent }) => void;
  onProjectedPoints?: (event: { nativeEvent: ProjectedPointsEvent }) => void;
  /** Fires in heatmap auto mode when the tracked range changes (>5 cm). */
  onHeatmapRange?: (event: { nativeEvent: { min: number; max: number } }) => void;
  style?: StyleProp<ViewStyle>;
};

/** Methods callable on the view ref. */
export type FishMeasureViewRef = {
  /** Raycast at view-local coordinates (RN points). Resolves null on a miss. */
  measureAtPoint(x: number, y: number): Promise<MeasureResult>;
  clearAnchors(): Promise<void>;
  removeAnchor(anchorId: string): Promise<void>;
  /** Fallback capture: RealityKit snapshot of the AR view (no JS overlay). Resolves a tmp file path. */
  snapshotCamera(): Promise<string>;
};
