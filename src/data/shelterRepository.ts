import { getDb } from './db';
import { boundsFromRadius, haversine } from '../geo/distance';
import type { Bounds, LatLng, NearbyShelter, Shelter } from '../types';

interface ShelterRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  facility_type: string | null;
  capacity: number | null;
}

const toShelter = (row: ShelterRow): Shelter => ({
  id: row.id,
  name: row.name,
  address: row.address,
  lat: row.lat,
  lng: row.lng,
  facilityType: row.facility_type,
  capacity: row.capacity,
});

export async function countShelters(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM shelters',
  );
  return row?.n ?? 0;
}

/**
 * 사각 영역 안의 쉼터를 조회한다.
 * 전체를 메모리에 올리지 않고 인덱스로 걸러낸 것만 가져오는 것이 요점.
 */
export async function findInBounds(
  bounds: Bounds,
  limit: number,
): Promise<Shelter[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ShelterRow>(
    `SELECT * FROM shelters
      WHERE lat BETWEEN ? AND ?
        AND lng BETWEEN ? AND ?
      LIMIT ?`,
    [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng, limit],
  );
  return rows.map(toShelter);
}

/**
 * 반경 검색. SQL의 사각형 조회로 후보를 좁힌 뒤,
 * 살아남은 소수에만 haversine 정밀 계산을 돌린다.
 */
export async function findNearby(
  center: LatLng,
  radiusM: number,
  limit: number,
): Promise<NearbyShelter[]> {
  const candidates = await findInBounds(
    boundsFromRadius(center, radiusM),
    // 사각형이 원보다 넓으니 여유 있게 뽑아두고 거리로 다시 자른다
    limit * 4,
  );

  return candidates
    .map((s) => ({ ...s, distance: haversine(center, s) }))
    .filter((s) => s.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * 전체 교체. 다운로드 도중 앱이 죽어도 DB가 반쯤 갱신된 상태로 남지 않도록
 * 트랜잭션으로 묶는다.
 */
export async function replaceAllShelters(shelters: Shelter[]): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM shelters');

    const stmt = await db.prepareAsync(
      `INSERT INTO shelters (id, name, address, lat, lng, facility_type, capacity)
       VALUES ($id, $name, $address, $lat, $lng, $facilityType, $capacity)`,
    );

    try {
      for (const s of shelters) {
        await stmt.executeAsync({
          $id: s.id,
          $name: s.name,
          $address: s.address,
          $lat: s.lat,
          $lng: s.lng,
          $facilityType: s.facilityType,
          $capacity: s.capacity,
        });
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}
