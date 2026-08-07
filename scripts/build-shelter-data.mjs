#!/usr/bin/env node
/**
 * 전국무더위쉼터표준데이터를 수집해 앱이 내려받을 정적 파일로 가공한다.
 * GitHub Actions가 하루 1회 실행한다.
 *
 *   node scripts/build-shelter-data.mjs            빌드
 *   node scripts/build-shelter-data.mjs --inspect  원본 응답 구조만 출력 (스키마 확인용)
 *
 * 인증키는 GitHub Secrets(DATA_GO_KR_SERVICE_KEY)에서 온다. 앱에는 절대 넣지 않는다.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL =
  'http://apis.data.go.kr/1741000/HeatWaveShelter3/getHeatWaveShelterList3';
const PAGE_SIZE = 1000;
const OUT_DIR = 'dist';

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;
/** 현재 배포돼 있는 manifest. 해시 비교로 불필요한 배포를 건너뛴다. */
const PUBLISHED_MANIFEST_URL = process.env.PUBLISHED_MANIFEST_URL ?? '';

const inspectMode = process.argv.includes('--inspect');

async function main() {
  if (!SERVICE_KEY) {
    fail('DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.');
  }

  if (inspectMode) {
    return inspect();
  }

  const rows = await fetchAllRows();
  console.log(`원본 ${rows.length}건 수집`);

  const shelters = rows
    .map(normalize)
    .filter(isUsable)
    // 위도순 정렬. 나중에 이진탐색으로 위도 범위를 좁힐 여지를 남긴다.
    .sort((a, b) => a.lat - b.lat);

  const dropped = rows.length - shelters.length;
  if (dropped > 0) {
    console.warn(`좌표 없음/불량으로 ${dropped}건 제외 (남은 ${shelters.length}건)`);
  }
  if (shelters.length === 0) {
    fail('사용 가능한 레코드가 0건입니다. normalize() 필드 매핑을 확인하세요.');
  }

  const body = JSON.stringify(shelters);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);

  const published = await fetchPublishedManifest();
  if (published?.hash === hash) {
    console.log(`변경 없음 (hash=${hash}) — 배포를 건너뜁니다.`);
    await setOutput('changed', 'false');
    return;
  }

  const manifest = {
    hash,
    url: `./shelters-${hash}.json`,
    generatedAt: new Date().toISOString(),
    count: shelters.length,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, `shelters-${hash}.json`), body);
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`갱신됨 hash=${hash}, ${shelters.length}건`);
  await setOutput('changed', 'true');
}

/** 공공데이터 API는 페이지 단위로만 응답하므로 전량을 돌면서 모은다. */
async function fetchAllRows() {
  const all = [];

  for (let pageNo = 1; ; pageNo++) {
    const json = await fetchPage(pageNo);
    const rows = extractRows(json);

    if (rows.length === 0) break;
    all.push(...rows);
    console.log(`  page ${pageNo}: ${rows.length}건 (누적 ${all.length})`);

    if (rows.length < PAGE_SIZE) break;
    if (pageNo > 200) {
      fail('페이지가 200을 넘었습니다. 종료 조건을 확인하세요.');
    }
  }

  return all;
}

async function fetchPage(pageNo) {
  const url = new URL(API_URL);
  // serviceKey는 이미 인코딩된 형태로 발급되므로 재인코딩하지 않는다.
  url.search = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    type: 'json',
  }).toString();
  const withKey = `${url.toString()}&serviceKey=${SERVICE_KEY}`;

  const res = await fetch(withKey);
  if (!res.ok) {
    fail(`API ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // 인증키 오류 등은 JSON이 아니라 XML로 돌아오는 경우가 많다
    fail(`JSON 파싱 실패. 응답 앞부분:\n${text.slice(0, 500)}`);
  }
}

/**
 * 표준데이터 응답은 { HeatWaveShelter: [{ head: [...] }, { row: [...] }] } 형태로
 * 감싸여 오는 경우가 많지만 확정적이지 않다. 레코드 배열을 찾아서 꺼낸다.
 */
function extractRows(json) {
  const found = [];

  const walk = (node) => {
    if (Array.isArray(node)) {
      const objects = node.filter(
        (v) => v && typeof v === 'object' && !Array.isArray(v),
      );
      // head/result 같은 메타 배열이 아니라 실제 레코드로 보이는 것만
      if (objects.length === node.length && node.length > 0 && looksLikeRecord(node[0])) {
        found.push(...node);
        return;
      }
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };

  walk(json);
  return found;
}

function looksLikeRecord(obj) {
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  return keys.some((k) => k.includes('nm') || k.includes('name')) && keys.length > 3;
}

/**
 * TODO: 인증키를 발급받아 --inspect로 실제 필드명을 확인한 뒤 확정할 것.
 * 위경도가 응답에 없다면 여기서 네이버 Geocoding API를 호출해 채워야 한다.
 * (앱이 아니라 이 스크립트에서 하는 이유: 5만 건을 1회만 변환하면 되고,
 *  Geocoding 키도 앱에 노출되지 않는다.)
 */
function normalize(raw) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] != null && raw[k] !== '') return raw[k];
    }
    return null;
  };

  const lat = pick('la', 'lat', 'latitude', 'yCrdnt', 'ycord');
  const lng = pick('lo', 'lng', 'longitude', 'xCrdnt', 'xcord');

  return {
    id: String(pick('rstrFcltyNo', 'id', 'fcltyNo') ?? ''),
    name: String(pick('rstrNm', 'name', 'fcltyNm') ?? ''),
    address: String(pick('rnDtlAdres', 'address', 'dtlAdres', 'adres') ?? ''),
    lat: Number(lat),
    lng: Number(lng),
    facilityType: pick('fcltyType', 'facilityType', 'fcltySclas'),
    capacity: toIntOrNull(pick('usePsblNmpr', 'capacity')),
  };
}

function toIntOrNull(v) {
  if (v == null) return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/** 좌표가 없는 레코드는 지도에 올릴 수 없으므로 버린다. */
function isUsable(s) {
  return (
    s.id !== '' &&
    s.name !== '' &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    // 한반도 대략 범위. 좌표계가 뒤바뀐 레코드를 걸러낸다.
    s.lat > 33 && s.lat < 39 &&
    s.lng > 124 && s.lng < 132
  );
}

async function fetchPublishedManifest() {
  if (!PUBLISHED_MANIFEST_URL) return null;
  try {
    const res = await fetch(PUBLISHED_MANIFEST_URL);
    if (!res.ok) return null; // 최초 배포 전이면 404
    return await res.json();
  } catch {
    return null;
  }
}

/** 스키마 확인용. 원본 레코드를 그대로 찍어본다. */
async function inspect() {
  const json = await fetchPage(1);
  const rows = extractRows(json);

  console.log('=== 응답 최상위 구조 ===');
  console.log(JSON.stringify(json, null, 2).slice(0, 1500));
  console.log(`\n=== 추출된 레코드 ${rows.length}건 중 첫 번째 ===`);
  console.log(JSON.stringify(rows[0], null, 2));
  console.log('\n=== 필드명 목록 ===');
  console.log(Object.keys(rows[0] ?? {}).join(', '));
  console.log('\n=== normalize() 결과 ===');
  const normalized = normalize(rows[0] ?? {});
  console.log(JSON.stringify(normalized, null, 2));
  console.log(
    isUsable(normalized)
      ? '\n✅ 매핑 정상 — 위경도가 응답에 들어 있습니다.'
      : '\n⚠️  매핑 실패 — 필드명을 확인하거나, 위경도가 없다면 지오코딩이 필요합니다.',
  );
}

async function setOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) await appendFile(file, `${key}=${value}\n`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// 직접 실행할 때만 돈다. 테스트에서 개별 함수를 가져다 쓸 수 있도록.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { extractRows, normalize, isUsable };
