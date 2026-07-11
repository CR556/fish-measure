import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isLidarSupported } from './modules/fish-measure';
import { RootTabs } from './src/navigation/RootTabs';
import { UnsupportedDevice } from './src/components/UnsupportedDevice';

function detectCapabilities() {
  try {
    return { lidar: isLidarSupported() };
  } catch {
    // Native module missing (e.g. Expo Go) — treat as unsupported.
    return { lidar: false };
  }
}

const capabilities = detectCapabilities();

// Modal routes (CaptureReview, SpeciesPicker) and CatchDetail join this stack
// in M3/M6 — the tabs stay the root screen.
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {capabilities.lidar ? (
        <NavigationContainer theme={DarkTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={RootTabs} />
          </Stack.Navigator>
        </NavigationContainer>
      ) : (
        <UnsupportedDevice />
      )}
    </SafeAreaProvider>
  );
}
