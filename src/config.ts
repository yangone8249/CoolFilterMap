/**
 * 앱 설정. EXPO_PUBLIC_ 접두사가 붙은 값은 JS 번들에 평문으로 박히므로
 * 노출돼도 되는 값만 여기에 둔다. 공공데이터 서비스키처럼 감춰야 하는 키는
 * Cloud Functions에만 두고 앱에는 절대 넣지 않는다.
 */

export const REMOTE = {
  /** 비어 있으면 목 데이터로 동작한다 (키 발급 전 개발용) */
  manifestUrl: process.env.EXPO_PUBLIC_SHELTER_MANIFEST_URL ?? '',
};

export const SEARCH = {
  /** '내 주변' 기본 반경 */
  defaultRadiusM: 1000,
  /**
   * 한 번에 지도에 올릴 최대 마커 수.
   * 네이티브 클러스터링이 렌더링을 감당하므로 낱개로 그릴 때보다 높게 잡는다.
   *
   * 화면 범위 안의 쉼터가 이 수를 넘으면 마커를 아예 그리지 않고 확대를
   * 유도한다. 일부만 잘라 그리면 사용자는 그게 전부인 줄 알고, 클러스터에
   * 찍히는 숫자도 틀린 값이 된다.
   *
   * 줌 레벨로 자르는 방법도 시도했지만, 서울 도심 전체가 들어와도 369곳뿐인
   * 경우가 있어 멀쩡히 그릴 수 있는 상황에서도 숨겨버렸다. 밀도는 지역마다
   * 다르므로 개수로 판단하는 편이 정확하다.
   */
  maxMarkers: 500,
};

export const CLUSTER = {
  /** 이 화면 거리(px) 안에 있는 마커끼리 묶는다. 클수록 더 뭉친다. */
  screenDistance: 70,
  /** 이 줌 레벨을 넘으면 클러스터를 풀고 낱개로 보여준다. */
  maxZoom: 16,
};

/** 초기 카메라 위치 (서울시청). 위치 권한을 받으면 현재 위치로 옮긴다. */
export const INITIAL_CAMERA = {
  latitude: 37.5665,
  longitude: 126.978,
  zoom: 14,
};
