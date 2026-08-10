import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '../types';

/**
 * pending  아직 묻지 않음
 * granted  권한 있음 (위치를 못 잡았을 수도 있다)
 * denied   사용자가 거부
 * failed   권한은 있는데 측위에 실패 — 비행기 모드, 실내, 위치 서비스 꺼짐 등
 */
type PermissionState = 'pending' | 'granted' | 'denied' | 'failed';

export function useCurrentLocation() {
  const [permission, setPermission] = useState<PermissionState>('pending');
  const [location, setLocation] = useState<LatLng | null>(null);

  const request = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        // 권한을 거부해도 앱은 동작해야 한다. 지도는 기본 위치에서 시작한다.
        setPermission('denied');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setPermission('granted');
    } catch (error) {
      // 비행기 모드나 실내에서는 권한이 있어도 측위가 실패한다.
      // 잡지 않으면 처리되지 않은 Promise 거부로 에러 오버레이가 뜬다.
      console.warn('[location] 현재 위치를 가져오지 못했습니다', error);
      setPermission('failed');
    }
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  return { permission, location, refresh: request };
}
