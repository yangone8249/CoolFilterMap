import { Asset } from 'expo-asset';
import { Directory, File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'shelters.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * SQLite는 디스크(파일) 기반이라 앱을 종료해도 데이터가 남는다.
 * 5~6만 건을 메모리에 올리지 않고 인덱스로 필요한 만큼만 읽는 것이 핵심.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      await restoreBundledDatabase();
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

/**
 * 설치 후 첫 실행이면 앱에 동봉된 스냅샷 DB를 복사해 쓴다.
 *
 * 이게 없으면 6만 건을 내려받아 넣는 동안(약 7초) 빈 지도가 보이고, 인터넷이
 * 없으면 아예 아무것도 못 본다. 복사는 수백 ms면 끝난다.
 *
 * 스냅샷에는 생성 시점의 해시도 함께 들어 있어서, 원격이 그대로면 첫 실행에서
 * 재다운로드도 일어나지 않는다.
 *
 * 실패해도 조용히 넘어간다. 빈 DB로 시작해 네트워크 동기화를 하면 되므로
 * 여기서 앱을 죽일 이유가 없다.
 */
async function restoreBundledDatabase(): Promise<void> {
  const dbDirectory = SQLite.defaultDatabaseDirectory;
  let assetUri: string | null = null;

  try {
    // defaultDatabaseDirectory는 스킴 없는 경로(/data/user/0/...)로 오는데
    // File/Directory는 file:// URI를 요구해 'URI is not absolute'로 죽는다.
    const directory = new Directory(toFileUri(dbDirectory));
    const target = new File(directory, DB_NAME);
    if (target.exists) return;

    const asset = Asset.fromModule(require('../../assets/shelters.db'));
    await asset.downloadAsync();
    assetUri = asset.localUri;
    if (!assetUri) return;

    if (!directory.exists) directory.create({ intermediates: true });
    await new File(toFileUri(assetUri)).copy(target);
    console.log('[db] 번들 DB 복사 완료');
  } catch (error) {
    // 빈 DB로 시작해 네트워크 동기화로 떨어지면 되므로 앱을 죽이지 않는다.
    console.warn(
      `[db] 번들 DB 복사 실패, 빈 DB로 시작합니다 ` +
        `(dbDir=${dbDirectory} asset=${assetUri})`,
      error,
    );
  }
}

function toFileUri(pathOrUri: string): string {
  if (pathOrUri.startsWith('file://')) return pathOrUri;
  return `file://${pathOrUri}`;
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
