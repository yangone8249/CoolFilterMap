import type { Shelter } from '../types';

/**
 * 개발용 목 데이터. 공공데이터 인증키를 발급받기 전까지 앱을 굴리기 위한 것으로,
 * 실제 무더위쉼터 정보가 아니다. 좌표는 서울 주요 지점 근처의 임의 값이다.
 * 실데이터 파이프라인이 붙으면 이 파일은 삭제한다.
 */
export const MOCK_SHELTERS: Shelter[] = [
  {
    id: 'mock-001',
    name: '[목] 시청역 주민센터',
    address: '서울특별시 중구',
    lat: 37.5665,
    lng: 126.978,
    facilityType: '주민센터',
    capacity: 40,
  },
  {
    id: 'mock-002',
    name: '[목] 을지로 경로당',
    address: '서울특별시 중구',
    lat: 37.5662,
    lng: 126.9912,
    facilityType: '경로당',
    capacity: 25,
  },
  {
    id: 'mock-003',
    name: '[목] 광화문 복지회관',
    address: '서울특별시 종로구',
    lat: 37.5759,
    lng: 126.9769,
    facilityType: '복지회관',
    capacity: 60,
  },
  {
    id: 'mock-004',
    name: '[목] 남대문 마을회관',
    address: '서울특별시 중구',
    lat: 37.5594,
    lng: 126.9755,
    facilityType: '마을회관',
    capacity: 30,
  },
  {
    id: 'mock-005',
    name: '[목] 서울역 보건소',
    address: '서울특별시 용산구',
    lat: 37.5547,
    lng: 126.9707,
    facilityType: '보건소',
    capacity: 50,
  },
  {
    id: 'mock-006',
    name: '[목] 명동 노인시설',
    address: '서울특별시 중구',
    lat: 37.5636,
    lng: 126.9827,
    facilityType: '노인시설',
    capacity: 35,
  },
  {
    id: 'mock-007',
    name: '[목] 동대문 주민센터',
    address: '서울특별시 종로구',
    lat: 37.5714,
    lng: 127.0094,
    facilityType: '주민센터',
    capacity: 45,
  },
  {
    id: 'mock-008',
    name: '[목] 여의도 복지관',
    address: '서울특별시 영등포구',
    lat: 37.5219,
    lng: 126.9245,
    facilityType: '복지회관',
    capacity: 80,
  },
];
