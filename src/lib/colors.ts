/** Per-shape palette: shape N uses entry N % length. Names appear in photo metadata. */
export type ShapeColor = {
  name: string;
  line: string;
  fill: string;
};

export const SHAPE_COLORS: ShapeColor[] = [
  { name: 'Yellow', line: '#ffd60a', fill: 'rgba(255, 214, 10, 0.22)' },
  { name: 'Cyan', line: '#64d2ff', fill: 'rgba(100, 210, 255, 0.22)' },
  { name: 'Green', line: '#30d158', fill: 'rgba(48, 209, 88, 0.22)' },
  { name: 'Pink', line: '#ff375f', fill: 'rgba(255, 55, 95, 0.22)' },
  { name: 'Orange', line: '#ff9f0a', fill: 'rgba(255, 159, 10, 0.22)' },
  { name: 'Purple', line: '#bf5af2', fill: 'rgba(191, 90, 242, 0.22)' },
];

export function shapeColor(index: number): ShapeColor {
  return SHAPE_COLORS[index % SHAPE_COLORS.length];
}
