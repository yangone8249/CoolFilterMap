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

const COLUMN_COUNT = 7;
/**
 * 한 INSERT에 넣을 행 수. 왕복 횟수를 줄일수록 빨라지지만 SQLite의 변수 상한에
 * 걸린다. 요즘 SQLite(3.32+)의 상한은 32766이라 7컬럼 × 500행 = 3500개면 여유가
 * 있다. 100행일 때 6만 건에 9초가 걸렸다.
 */
const INSERT_CHUNK = 500;

/**
 * 전체 교체. 다운로드 도중 앱이 죽어도 DB가 반쯤 갱신된 상태로 남지 않도록
 * 트랜잭션으로 묶는다.
 *
 * 행마다 executeAsync를 부르면 6만 건에 JS↔네이티브 왕복이 6만 번 발생해
 * 실기기에서 40초가 넘게 걸린다. 여러 행을 한 INSERT로 묶어 왕복을 줄인다.
 */
export async function replaceAllShelters(shelters: Shelter[]): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM shelters');
    // 인덱스를 걸어둔 채로 대량 삽입하면 행마다 B-tree를 갱신한다.
    // 넣고 나서 한 번에 만드는 편이 빠르다. 트랜잭션 안이라 중간에 죽어도
    // 인덱스가 사라진 상태로 남지 않는다.
    await db.execAsync('DROP INDEX IF EXISTS idx_shelters_lat_lng');

    for (let i = 0; i < shelters.length; i += INSERT_CHUNK) {
      const chunk = shelters.slice(i, i + INSERT_CHUNK);
      const placeholders = new Array(chunk.length)
        .fill(`(${new Array(COLUMN_COUNT).fill('?').join(',')})`)
        .join(',');

      const params: (string | number | null)[] = [];
      for (const s of chunk) {
        params.push(
          s.id,
          s.name,
          s.address,
          s.lat,
          s.lng,
          s.facilityType,
          s.capacity,
        );
      }

      await db.runAsync(
        `INSERT INTO shelters (id, name, address, lat, lng, facility_type, capacity)
         VALUES ${placeholders}`,
        params,
      );
    }

    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_shelters_lat_lng ON shelters(lat, lng)',
    );
  });
}
