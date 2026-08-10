import type { ShelterCategory } from '../types';

/**
 * 필터 칩에 노출할 카테고리와 라벨.
 *
 * 순서는 전국 실측 건수를 따르되, 사용자가 실제로 찾을 법한 것을 앞에 둔다.
 * 경로당이 71.7%로 압도적이지만 아무나 들어가기 어려운 곳이라 앞자리를 주지
 * 않았다. 도서관·복지관처럼 수는 적어도 실제로 쓸 수 있는 곳이 먼저다.
 */
export const CATEGORY_FILTERS: { key: ShelterCategory; label: string }[] = [
  { key: 'library', label: '도서관' },
  { key: 'welfare', label: '복지·보건' },
  { key: 'office', label: '주민센터' },
  { key: 'private', label: '은행·마트' },
  { key: 'culture', label: '문화·체육' },
  { key: 'outdoor', label: '야외' },
  { key: 'senior', label: '경로당' },
  { key: 'village', label: '마을회관' },
  { key: 'etc', label: '기타' },
];

const LABELS = new Map(CATEGORY_FILTERS.map((c) => [c.key, c.label]));

export function categoryLabel(category: ShelterCategory): string {
  return LABELS.get(category) ?? '기타';
}
