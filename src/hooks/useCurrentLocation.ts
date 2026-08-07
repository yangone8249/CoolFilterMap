import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '../types';

type PermissionState = 'pending' | 'granted' | 'denied';

export function useCurrentLocation() {
  const [permission, setPermission] = useState<PermissionState>('pending');
  const [location, setLocation] = useState<LatLng | null>(null);

  const request = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      // 권한을 거부해도 앱은 동작해야 한다. 지도는 기본 위치에서 시작한다.
      setPermission('denied');
      return;
    }

    setPermission('granted');

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setLocation({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  return { permission, location, refresh: request };
}
