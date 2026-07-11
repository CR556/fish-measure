import FishMeasureModule from './src/FishMeasureModule';

export { FishMeasureView } from './src/FishMeasureView';
export * from './src/FishMeasure.types';

export function isLidarSupported(): boolean {
  return FishMeasureModule.isLidarSupported();
}

export function saveImageToPhotos(
  path: string,
  userComment: string,
  imageDescription: string
): Promise<void> {
  return FishMeasureModule.saveImageToPhotos(path, userComment, imageDescription);
}
