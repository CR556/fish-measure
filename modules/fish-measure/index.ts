import FishMeasureModule from './src/FishMeasureModule';

export { FishMeasureView } from './src/FishMeasureView';
export * from './src/FishMeasure.types';

export function isLidarSupported(): boolean {
  return FishMeasureModule.isLidarSupported();
}

/**
 * Embeds EXIF UserComment + TIFF ImageDescription (+ optional GPS) into the
 * image at `path` and saves it to the camera roll (add-only permission).
 */
export function saveImageToPhotos(
  path: string,
  userComment: string,
  imageDescription: string,
  gps?: { lat: number; lon: number }
): Promise<void> {
  return FishMeasureModule.saveImageToPhotos(path, userComment, imageDescription, gps ?? null);
}
