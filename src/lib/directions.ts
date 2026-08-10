import { Linking } from 'react-native';
import type { Shelter } from '../types';

/** nmap 스킴이 요구하는 호출 앱 식별자. app.config.ts의 패키지명과 맞춘다. */
const APP_NAME = 'com.coolfiltermap.app';

/**
 * 길찾기는 직접 구현하지 않고 지도 앱에 넘긴다.
 * 실시간 안내·대중교통 경로를 공짜로 얻을 수 있고, 국내 보행자 경로 품질도
 * 직접 그리는 것보다 낫다.
 *
 * canOpenURL은 Android 11+의 패키지 가시성 제한과 iOS의 스킴 화이트리스트
 * (LSApplicationQueriesSchemes) 때문에 설정 없이는 항상 false를 반환한다.
 * 그래서 openURL을 순서대로 시도하고 실패하면 다음 후보로 넘어간다.
 */
export async function openDirections(shelter: Shelter): Promise<boolean> {
  const { lat, lng, name } = shelter;
  const encodedName = encodeURIComponent(name);

  const candidates = [
    // 네이버지도 앱 — 도보 경로.
    // 쉼터는 대부분 걸어갈 거리라 대중교통(route/public)보다 도보가 맞다.
    `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=${encodedName}&appname=${APP_NAME}`,
    // 카카오맵 앱 — 도보(by=FOOT)
    `kakaomap://route?ep=${lat},${lng}&by=FOOT`,
    // 둘 다 없으면 웹으로. 앱 미설치 사용자도 길찾기는 되어야 한다.
    // 웹 링크는 이동수단을 지정할 수 없어 사용자가 화면에서 고른다.
    `https://map.kakao.com/link/to/${encodedName},${lat},${lng}`,
  ];

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // 해당 앱이 없으면 다음 후보로
    }
  }

  return false;
}
