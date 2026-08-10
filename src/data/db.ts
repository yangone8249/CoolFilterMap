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

/**
 * 스키마를 바꿀 때마다 올린다.
 *
 * 쉼터 데이터는 원격에서 다시 받으면 그만이라 ALTER로 조심스럽게 옮길 이유가
 * 없다. 버전이 올라가면 테이블을 통째로 지우고 다시 만든다. meta도 같이 지워야
 * 해시가 초기화되어 재동기화가 걸린다.
 */
const SCHEMA_VERSION = 2;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );

  if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
    await db.execAsync(`
      DROP TABLE IF EXISTS shelters;
      DROP TABLE IF EXISTS meta;
    `);
  }

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS shelters (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      address       TEXT NOT NULL,
      lat           REAL NOT NULL,
      lng           REAL NOT NULL,
      facility_type TEXT,
      capacity      INTEGER,
      category      TEXT NOT NULL DEFAULT 'etc'
    );

    -- bounding box 조회용. lat을 선행 컬럼으로 두고 범위를 좁힌다.
    CREATE INDEX IF NOT EXISTS idx_shelters_lat_lng ON shelters(lat, lng);

    -- 동기화 상태(마지막 hash 등)를 담는 key-value 테이블
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
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
