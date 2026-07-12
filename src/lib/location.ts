import * as Location from 'expo-location';

/**
 * Best-effort GPS fix for tagging a catch. Returns null if permission is
 * denied or no fix arrives quickly — a catch is never blocked on location.
 */
export async function getCatchLocation(): Promise<
  { lat: number; lon: number; accuracyM: number | null } | null
> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? null,
    };
  } catch {
    return null;
  }
}
