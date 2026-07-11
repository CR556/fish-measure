import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Text } from 'react-native';

import { LogScreen } from '../screens/LogScreen';
import { MapScreen } from '../screens/MapScreen';
import { MeasureScreen } from '../screens/MeasureScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function icon(glyph: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>
  );
}

export function RootTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#222' },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
      }}
    >
      <Tab.Screen name="Measure" component={MeasureScreen} options={{ tabBarIcon: icon('🎣') }} />
      <Tab.Screen name="Log" component={LogScreen} options={{ tabBarIcon: icon('📓') }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ tabBarIcon: icon('🗺️') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon('⚙️') }} />
    </Tab.Navigator>
  );
}
