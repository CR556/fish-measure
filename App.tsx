import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isLidarSupported } from './modules/fish-measure';
import { initIdQueue } from './src/capture/idQueue';
import { initFishModel } from './src/lib/fishModel';
import { UnsupportedDevice } from './src/components/UnsupportedDevice';
import type { RootStackParamList } from './src/navigation/types';
import { RootTabs } from './src/navigation/RootTabs';
import { CaptureReviewScreen } from './src/screens/CaptureReviewScreen';
import { CatchDetailScreen } from './src/screens/CatchDetailScreen';
import { SpeciesPickerScreen } from './src/screens/SpeciesPickerScreen';

function detectCapabilities() {
  try {
    return { lidar: isLidarSupported() };
  } catch {
    // Native module missing (e.g. Expo Go) — treat as unsupported.
    return { lidar: false };
  }
}

const capabilities = detectCapabilities();

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  React.useEffect(() => {
    if (capabilities.lidar) {
      initIdQueue();
      initFishModel();
    }
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {capabilities.lidar ? (
        <NavigationContainer theme={DarkTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={RootTabs} />
            <Stack.Screen
              name="CaptureReview"
              component={CaptureReviewScreen}
              options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
            />
            <Stack.Screen
              name="CatchDetail"
              component={CatchDetailScreen}
              options={{ headerShown: true, title: 'Catch' }}
            />
            <Stack.Screen
              name="SpeciesPicker"
              component={SpeciesPickerScreen}
              options={{ presentation: 'modal' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      ) : (
        <UnsupportedDevice />
      )}
    </SafeAreaProvider>
  );
}
