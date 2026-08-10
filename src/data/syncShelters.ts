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

    // 최초 동기화는 전량을 메모리에 올렸다가 SQLite로 옮기는 구간이라
    // 저사양 기기에서 가장 위험하다. 어느 단계가 무거운지 남겨둔다.
    const dataUrl = new URL(manifest.url, REMOTE.manifestUrl).toString();

    const t0 = Date.now();
    const raw = await fetchJson<unknown[]>(dataUrl);
    const t1 = Date.now();
    const shelters = raw.map(normalize).filter(isUsable);
    const t2 = Date.now();

    await replaceAllShelters(shelters);
    const t3 = Date.now();
    console.log(
      `[sync] ${shelters.length}건 — 다운로드+파싱 ${t1 - t0}ms, ` +
        `정규화 ${t2 - t1}ms, SQLite 저장 ${t3 - t2}ms`,
    );
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
 * 원본 API의 필드 매핑은 파이프라인(scripts/build-shelter-data.mjs)이 끝내고
 * 올리므로, 여기서는 타입만 다시 맞춘다. 배포본이 깨졌을 때 앱이 통째로
 * 죽지 않도록 하는 방어선이다.
 */
function normalize(raw: any): Shelter {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    address: String(raw.address ?? ''),
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    facilityType: raw.facilityType ?? null,
    capacity: raw.capacity != null ? Number(raw.capacity) : null,
    category: raw.category ?? 'etc',
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
