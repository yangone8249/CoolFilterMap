/**
 * 필터용 분류. 원본의 FCLTY_TY는 4종뿐이라 도서관과 주민센터가 한 덩어리로
 * 묶인다. 정작 구분하고 싶은 건 그 안쪽이라 파이프라인이 이름으로 다시 나눈다.
 */
export type ShelterCategory =
  | 'senior' // 경로당·노인정
  | 'village' // 마을회관
  | 'office' // 주민센터·행정복지센터
  | 'library' // 도서관
  | 'welfare' // 복지관·보건소
  | 'private' // 은행·마트·농협
  | 'culture' // 문화·체육·전시
  | 'outdoor' // 정자·그늘막·공원
  | 'etc';

/** 앱 내부에서 쓰는 정규화된 쉼터 모델. 공공데이터 원본 스키마와는 분리한다. */
export interface Shelter {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  facilityType: string | null;
  capacity: number | null;
  category: ShelterCategory;
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
