#!/usr/bin/env node
/**
 * 배포본 스냅샷을 SQLite 파일로 만들어 앱 번들에 넣는다.
 *
 *   npm run bundle:db
 *
 * 이게 없으면 설치 직후 첫 실행에서 6만 건을 내려받아 넣는 동안(약 7초)
 * 빈 지도가 보이고, 인터넷이 없으면 아예 아무것도 못 본다.
 *
 * 앱은 이 파일을 복사만 하고 바로 쓴다. meta에 해시를 함께 넣어두므로
 * 원격이 그대로면 재동기화도 일어나지 않는다.
 *
 * 스키마는 src/data/db.ts와 일치해야 한다. 바꿀 때 양쪽을 같이 고칠 것.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** src/data/db.ts의 SCHEMA_VERSION과 같아야 한다. */
const SCHEMA_VERSION = 2;
const INSERT_CHUNK = 1000;

const MANIFEST_URL =
  process.env.EXPO_PUBLIC_SHELTER_MANIFEST_URL ??
  'https://yangone8249.github.io/CoolFilterMap/manifest.json';

const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'shelters.db',
);

async function main() {
  console.log(`매니페스트: ${MANIFEST_URL}`);
  const manifest = await fetchJson(MANIFEST_URL);
  const dataUrl = new URL(manifest.url, MANIFEST_URL).toString();

  const shelters = await fetchJson(dataUrl);
  if (!Array.isArray(shelters) || shelters.length === 0) {
    fail('배포본에서 레코드를 가져오지 못했습니다.');
  }
  console.log(`${shelters.length.toLocaleString()}건 · hash=${manifest.hash}`);

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  // 이어붙이면 안 되므로 기존 파일과 저널을 먼저 지운다.
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    await rm(OUT_PATH + suffix, { force: true });
  }

  const db = new DatabaseSync(OUT_PATH);
  try {
    createSchema(db);
    insertAll(db, shelters);
    // 해시를 함께 심어두면 첫 실행에서 원격이 그대로일 때 재다운로드하지 않는다.
    setMeta(db, 'shelters:hash', manifest.hash);
    setMeta(db, 'shelters:syncedAt', manifest.generatedAt ?? '');
    db.exec('CREATE INDEX idx_shelters_lat_lng ON shelters(lat, lng)');
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    // 삽입 과정에서 생긴 빈 페이지를 정리해 번들 크기를 줄인다.
    db.exec('VACUUM');
  } finally {
    db.close();
  }

  const { size } = await stat(OUT_PATH);
  console.log(
    `생성됨 ${path.relative(process.cwd(), OUT_PATH)} — ${(size / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log('APK 안에서는 압축되어 실제 증가분은 이보다 작다.');
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE shelters (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      address       TEXT NOT NULL,
      lat           REAL NOT NULL,
      lng           REAL NOT NULL,
      facility_type TEXT,
      capacity      INTEGER,
      category      TEXT NOT NULL DEFAULT 'etc'
    );
    CREATE TABLE meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function insertAll(db, shelters) {
  const columns = 8;
  db.exec('BEGIN');
  try {
    for (let i = 0; i < shelters.length; i += INSERT_CHUNK) {
      const chunk = shelters.slice(i, i + INSERT_CHUNK);
      const placeholders = new Array(chunk.length)
        .fill(`(${new Array(columns).fill('?').join(',')})`)
        .join(',');
      const params = [];
      for (const s of chunk) {
        params.push(
          String(s.id),
          s.name,
          s.address,
          s.lat,
          s.lng,
          s.facilityType ?? null,
          s.capacity ?? null,
          s.category ?? 'etc',
        );
      }
      db.prepare(
        `INSERT INTO shelters
           (id, name, address, lat, lng, facility_type, capacity, category)
         VALUES ${placeholders}`,
      ).run(...params);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) fail(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

function fail(message) {
  throw new Error(message);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
