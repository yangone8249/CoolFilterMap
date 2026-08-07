import * as SQLite from 'expo-sqlite';

const DB_NAME = 'shelters.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * SQLite는 디스크(파일) 기반이라 앱을 종료해도 데이터가 남는다.
 * 5~6만 건을 메모리에 올리지 않고 인덱스로 필요한 만큼만 읽는 것이 핵심.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS shelters (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      address       TEXT NOT NULL,
      lat           REAL NOT NULL,
      lng           REAL NOT NULL,
      facility_type TEXT,
      capacity      INTEGER
    );

    -- bounding box 조회용. lat을 선행 컬럼으로 두고 범위를 좁힌다.
    CREATE INDEX IF NOT EXISTS idx_shelters_lat_lng ON shelters(lat, lng);

    -- 동기화 상태(마지막 hash 등)를 담는 key-value 테이블
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export const META_KEYS = {
  dataHash: 'shelters:hash',
  syncedAt: 'shelters:syncedAt',
} as const;
