/** 앱 내부에서 쓰는 정규화된 쉼터 모델. 공공데이터 원본 스키마와는 분리한다. */
export interface Shelter {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  facilityType: string | null;
  capacity: number | null;
}

export interface NearbyShelter extends Shelter {
  /** 기준점으로부터의 거리(m) */
  distance: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** 남서-북동 좌표로 표현한 사각 영역 */
export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * GCS에 올라가는 매니페스트. 앱은 매 실행마다 이것만 받아(수백 바이트)
 * hash를 비교하고, 달라졌을 때만 실제 데이터를 내려받는다.
 */
export interface ShelterManifest {
  /** 데이터 내용의 해시. 배치가 매일 돌아도 내용이 같으면 그대로다. */
  hash: string;
  /** 데이터 파일 URL (매니페스트 기준 상대경로 또는 절대 URL) */
  url: string;
  /** 생성 시각 (ISO 8601) */
  generatedAt: string;
  count?: number;
}
