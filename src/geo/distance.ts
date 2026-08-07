import type { Bounds, LatLng } from '../types';

const EARTH_RADIUS_M = 6_371_000;
/** 위도 1도의 거리(m). 경도는 위도에 따라 달라지므로 cos 보정이 필요하다. */
const METERS_PER_LAT_DEGREE = 111_320;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 지점 사이의 대권거리(m) */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * 반경(m)을 감싸는 사각 영역. SQL 인덱스로 후보를 좁히는 데 쓴다.
 * 사각형이 원보다 넓으므로 결과는 haversine으로 한 번 더 걸러야 한다.
 */
export function boundsFromRadius(center: LatLng, radiusM: number): Bounds {
  const latDelta = radiusM / METERS_PER_LAT_DEGREE;
  const lngDelta =
    radiusM / (METERS_PER_LAT_DEGREE * Math.cos(toRad(center.lat)));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/** 네이버 지도의 Region(남서 좌표 + delta)을 Bounds로 변환 */
export function boundsFromRegion(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): Bounds {
  return {
    minLat: region.latitude,
    maxLat: region.latitude + region.latitudeDelta,
    minLng: region.longitude,
    maxLng: region.longitude + region.longitudeDelta,
  };
}

/** 화면에 보이는 영역의 중심 */
export function centerOfBounds(bounds: Bounds): LatLng {
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
