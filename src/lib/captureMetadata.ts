import type { MeasureMode } from '../../modules/fish-measure';
import type { Chain } from '../components/ShapesOverlay';
import { shapeColor } from './colors';
import { dist3, perimeter, polygonArea } from './geometry';
import { formatDistance } from './units';

export type CaptureContext = {
  mode: MeasureMode;
  heatmap?: { minMeters: number; maxMeters: number };
};

/**
 * Builds the metadata embedded in captured photos: EXIF UserComment gets the
 * machine-readable JSON, TIFF ImageDescription gets the human-readable
 * summary. Shapes are labeled by their on-screen color; every measurement is
 * recorded in metric AND imperial regardless of the current unit toggle.
 */
export function buildCaptureMetadata(
  chains: Chain[],
  context?: CaptureContext
): {
  userComment: string;
  description: string;
} {
  const shapes = chains
    .filter((chain) => chain.points.length >= 2)
    .map((chain, index) => {
      const worlds = chain.points.map((p) => p.world);
      const color = shapeColor(index).name;

      const segments = [];
      const segmentCount = chain.closed ? worlds.length : worlds.length - 1;
      for (let i = 0; i < segmentCount; i++) {
        const meters = dist3(worlds[i], worlds[(i + 1) % worlds.length]);
        segments.push({
          metric: formatDistance(meters, 'm'),
          imperial: formatDistance(meters, 'ft'),
          meters: Number(meters.toFixed(4)),
        });
      }

      const perimeterMeters = perimeter(worlds, chain.closed);
      const entry: Record<string, unknown> = {
        label: color,
        closed: chain.closed,
        points: worlds.length,
        segments,
        perimeter: {
          metric: formatDistance(perimeterMeters, 'm'),
          imperial: formatDistance(perimeterMeters, 'ft'),
          meters: Number(perimeterMeters.toFixed(4)),
        },
      };

      if (chain.closed && worlds.length >= 3) {
        const areaM2 = polygonArea(worlds);
        entry.area = {
          metric: `${areaM2.toFixed(3)} mÂ²`,
          imperial: `${(areaM2 * 10.7639).toFixed(2)} ftÂ²`,
          squareMeters: Number(areaM2.toFixed(4)),
        };
      }

      return entry;
    });

  const userComment = JSON.stringify({
    app: 'LiDAR Distance',
    capturedAt: new Date().toISOString(),
    ...(context?.mode ? { mode: context.mode } : {}),
    ...(context?.heatmap
      ? {
          heatmap: {
            minMeters: context.heatmap.minMeters,
            maxMeters: context.heatmap.maxMeters,
            note: 'Colors map nearâ†’far across this range; see legend in image.',
          },
        }
      : {}),
    shapes,
  });

  const heatmapPrefix = context?.heatmap
    ? `Depth heatmap ${formatDistance(context.heatmap.minMeters, 'm')}â€“${formatDistance(
        context.heatmap.maxMeters,
        'm'
      )}. `
    : '';

  const shapesDescription = shapes.length
    ? shapes
        .map((s) => {
          const parts = [
            `${s.label}: ${(s.segments as unknown[]).length} segment(s)`,
            `perimeter ${(s.perimeter as { metric: string }).metric} / ${(s.perimeter as { imperial: string }).imperial}`,
          ];
          if (s.area) {
            const area = s.area as { metric: string; imperial: string };
            parts.push(`area ${area.metric} / ${area.imperial}`);
          }
          return parts.join(', ');
        })
        .join('; ')
    : 'LiDAR Distance capture (no shapes in frame)';

  return { userComment, description: heatmapPrefix + shapesDescription };
}
