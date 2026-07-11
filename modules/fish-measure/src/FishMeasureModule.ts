import { NativeModule, requireNativeModule } from 'expo';

declare class FishMeasureNativeModule extends NativeModule {
  isLidarSupported(): boolean;
  saveImageToPhotos(
    path: string,
    userComment: string,
    imageDescription: string,
    gps: { lat: number; lon: number } | null
  ): Promise<void>;
}

export default requireNativeModule<FishMeasureNativeModule>('FishMeasure');
