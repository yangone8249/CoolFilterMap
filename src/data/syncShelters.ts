import { REMOTE } from '../config';
import { META_KEYS, getMeta, setMeta } from './db';
import { MOCK_SHELTERS } from './mockShelters';
import { countShelters, replaceAllShelters } from './shelterRepository';
import type { Shelter, ShelterManifest } from '../types';

export type SyncResult =
  | { status: 'up-to-date' }
  | { status: 'updated'; count: number }
  | { status: 'seeded-mock'; count: number }
  | { status: 'failed'; error: unknown };

/**
 * 앱 시작 시 데이터 동기화.
 *
 * 매 실행마다 오가는 건 매니페스트(수백 바이트)뿐이고,
 * hash가 그대로면 네트워크를 더 쓰지 않는다. 실제 다운로드는 데이터가
 * 바뀌었을 때만 일어난다.
 *
 * 실패해도 예외를 던지지 않는다 — 비행기 모드거나 원격이 죽었어도
 * 디스크에 있는 기존 데이터로 앱은 정상 동작해야 한다.
 */
export async function syncShelters(): Promise<SyncResult> {
  if (!REMOTE.manifestUrl) {
    return seedMockIfEmpty();
  }

  try {
    const manifest = await fetchJson<ShelterManifest>(REMOTE.manifestUrl);
    const cachedHash = await getMeta(META_KEYS.dataHash);

    // 배치가 매일 돌아도 내용이 같으면 hash가 같다 → 다운로드 없음
    if (cachedHash === manifest.hash && (await countShelters()) > 0) {
      return { status: 'up-to-date' };
    }

    const dataUrl = new URL(manifest.url, REMOTE.manifestUrl).toString();
    const raw = await fetchJson<unknown[]>(dataUrl);
    const shelters = raw.map(normalize).filter(isUsable);

    await replaceAllShelters(shelters);
    await setMeta(META_KEYS.dataHash, manifest.hash);
    await setMeta(META_KEYS.syncedAt, new Date().toISOString());

    return { status: 'updated', count: shelters.length };
  } catch (error) {
    // 기존 데이터는 그대로 두고 조용히 실패한다
    console.warn('[sync] 갱신 실패, 로컬 데이터를 계속 사용합니다', error);
    return { status: 'failed', error };
  }
}

async function seedMockIfEmpty(): Promise<SyncResult> {
  if ((await countShelters()) > 0) {
    return { status: 'up-to-date' };
  }
  await replaceAllShelters(MOCK_SHELTERS);
  return { status: 'seeded-mock', count: MOCK_SHELTERS.length };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * Cloud Functions가 이미 정규화해서 올리는 것이 원칙이지만,
 * 앱 쪽에서도 한 번 더 방어한다.
 *
 * TODO: 공공데이터 인증키를 받아 실제 응답 스키마를 확인한 뒤 필드명을 확정할 것.
 * 특히 위경도가 응답에 없다면 파이프라인에서 지오코딩을 거쳐야 한다.
 */
function normalize(raw: any): Shelter {
  return {
    id: String(raw.id ?? raw.rstrFcltyNo ?? ''),
    name: String(raw.name ?? raw.rstrNm ?? ''),
    address: String(raw.address ?? raw.rnDtlAdres ?? ''),
    lat: Number(raw.lat ?? raw.la),
    lng: Number(raw.lng ?? raw.lo),
    facilityType: raw.facilityType ?? raw.fcltyType ?? null,
    capacity: raw.capacity != null ? Number(raw.capacity) : null,
  };
}

/** 좌표가 없거나 깨진 레코드는 지도에 못 올리므로 버린다 */
function isUsable(s: Shelter): boolean {
  return (
    s.id !== '' &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    s.lat !== 0 &&
    s.lng !== 0
  );
}
