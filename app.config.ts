import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'FishMeasure',
  slug: 'fish-measure',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.curtriley.fishmeasure',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'The camera and LiDAR sensor are used to find your fish and measure its length.',
      NSPhotoLibraryAddUsageDescription:
        'Catch photos are saved to your photo library when you choose to.',
      NSLocationWhenInUseUsageDescription:
        'Your location tags each catch with where it was caught. You can turn this off in Settings.',
    },
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: {
          // Vision subject-lift (VNGenerateForegroundInstanceMaskRequest) needs iOS 17.
          deploymentTarget: '17.0',
        },
      },
    ],
    'expo-sqlite',
    'expo-secure-store',
    'expo-sharing',
  ],
  // Bump whenever native code changes so OTA updates never land on an
  // incompatible binary.
  runtimeVersion: { policy: 'appVersion' },
};

export default config;
