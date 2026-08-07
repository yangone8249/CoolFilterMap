#!/usr/bin/env node
/**
 * 전국 무더위쉼터 데이터를 수집해 앱이 내려받을 정적 파일로 가공한다.
 * GitHub Actions가 하루 1회 실행한다.
 *
 *   node scripts/build-shelter-data.mjs            빌드
 *   node scripts/build-shelter-data.mjs --inspect  원본 응답 구조만 출력 (스키마 확인용)
 *
 * 출처는 행정안전부 재난안전데이터공유플랫폼(safetydata.go.kr)이다.
 * data.go.kr의 HeatWaveShelter 계열 엔드포인트와는 다른 플랫폼이며,
 * 그쪽은 현재 NO_OPENAPI_SERVICE_ERROR로 폐기된 상태다.
 *
 * 인증키는 GitHub Secrets(DATA_GO_KR_SERVICE_KEY)에서 온다. 앱에는 절대 넣지 않는다.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://www.safetydata.go.kr/V2/api/DSSP-IF-10942';
const PAGE_SIZE = 1000;
const OUT_DIR = 'dist';

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;
/** 현재 배포돼 있는 manifest. 해시 비교로 불필요한 배포를 건너뛴다. */
const PUBLISHED_MANIFEST_URL = process.env.PUBLISHED_MANIFEST_URL ?? '';

const inspectMode = process.argv.includes('--inspect');
/**
 * 인증키 없이 파이프라인 전체(정규화 → 해시 → 배포)를 검증하기 위한 모드.
 * 목 데이터도 원본 API와 같은 형태라 normalize/필터링까지 동일하게 거친다.
 */
const mockMode =
  process.argv.includes('--mock') || process.env.USE_MOCK === 'true';
/** 건수 급감 방어를 의도적으로 해제한다. 실제로 쉼터가 줄어든 경우에만 쓴다. */
const allowShrink =
  process.argv.includes('--allow-shrink') ||
  process.env.ALLOW_SHRINK === 'true';

async function main() {
  if (!SERVICE_KEY && !mockMode) {
    fail('DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다. (검증만 하려면 --mock)');
  }

  if (inspectMode) {
    return inspect();
  }

  const rows = mockMode ? await readMockRows() : await fetchAllRows();
  console.log(`원본 ${rows.length}건 수집${mockMode ? ' (목 데이터)' : ''}`);

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
  assertNotShrunk(shelters.length, published);

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

/** 이 비율 아래로 줄면 수집이 중간에 끊긴 것으로 보고 배포를 막는다. */
const SHRINK_THRESHOLD = 0.8;

/**
 * 건수가 갑자기 급감했다면 정상적인 데이터 변경이 아니라 사고일 가능성이 높다.
 * 페이지네이션이 빈 응답으로 조기 종료됐거나, 지오코딩 한도가 소진돼 좌표를
 * 못 채운 레코드가 대량으로 걸러진 경우다. 둘 다 에러 없이 조용히 일어나므로
 * 여기서 명시적으로 막지 않으면 반쪽짜리 데이터가 그대로 배포된다.
 */
function assertNotShrunk(count, published) {
  if (allowShrink) return;
  if (!published?.count) return; // 최초 배포면 비교 대상이 없다

  const floor = Math.floor(published.count * SHRINK_THRESHOLD);
  if (count >= floor) return;

  fail(
    `건수 급감 감지: ${published.count}건 → ${count}건 ` +
      `(허용 하한 ${floor}건). 수집이 중간에 끊겼을 수 있어 배포를 중단합니다.\n` +
      `의도한 변경이라면 --allow-shrink 로 다시 실행하세요.`,
  );
}

async function readMockRows() {
  const file = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'mock-shelters.json',
  );
  const text = await readFile(file, 'utf8');
  // Windows 편집기가 붙이는 BOM은 JSON.parse가 못 읽는다.
  return JSON.parse(text.replace(/^﻿/, ''));
}

/** API는 페이지 단위로만 응답하므로 totalCount를 채울 때까지 돈다. */
async function fetchAllRows() {
  const all = [];
  let totalCount = null;

  for (let pageNo = 1; ; pageNo++) {
    const json = await fetchPage(pageNo);
    const rows = extractRows(json);

    if (totalCount === null) {
      totalCount = Number(json.totalCount);
      console.log(`  totalCount=${totalCount}`);
    }

    if (rows.length === 0) break;
    all.push(...rows);
    console.log(`  page ${pageNo}: ${rows.length}건 (누적 ${all.length})`);

    if (Number.isFinite(totalCount) && all.length >= totalCount) break;
    if (rows.length < PAGE_SIZE) break;
    if (pageNo > 500) {
      fail('페이지가 500을 넘었습니다. 종료 조건을 확인하세요.');
    }
  }

  // 페이지네이션이 중간에 끊기면 부분 데이터가 조용히 배포된다.
  if (Number.isFinite(totalCount) && all.length !== totalCount) {
    fail(`수집 누락: totalCount=${totalCount}인데 ${all.length}건만 모았습니다.`);
  }

  return all;
}

async function fetchPage(pageNo) {
  const url = new URL(API_URL);
  // serviceKey는 이미 인코딩된 형태로 발급되므로 재인코딩하지 않는다.
  url.search = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    returnType: 'json',
  }).toString();
  const withKey = `${url.toString()}&serviceKey=${SERVICE_KEY}`;

  const res = await fetch(withKey);
  // 실패 사유는 본문에 담겨 온다. 상태 코드만 보고 죽으면 원인을 알 수 없다.
  const text = await res.text();

  if (!res.ok) {
    fail(`API ${res.status} ${res.statusText}\n응답 본문:\n${text.slice(0, 800)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증키 오류 등은 JSON이 아니라 XML/HTML로 돌아오는 경우가 있다
    fail(`JSON 파싱 실패. 응답 앞부분:\n${text.slice(0, 500)}`);
  }

  // HTTP 200이어도 header에 에러가 담겨 오므로 반드시 확인한다.
  const header = json?.header;
  if (header && header.resultCode !== '00') {
    fail(
      `API 오류 resultCode=${header.resultCode} ${header.resultMsg ?? ''} ${header.errorMsg ?? ''}`,
    );
  }

  return json;
}

/** 응답 봉투는 { header, totalCount, body: [...] } 형태다. */
function extractRows(json) {
  const body = json?.body;
  if (Array.isArray(body)) return body;
  if (body == null) return [];
  fail(`예상과 다른 응답 구조입니다: body가 배열이 아님 (${typeof body})`);
}

/**
 * safetydata.go.kr의 원본 필드명은 대문자 스네이크다.
 * 위경도(LA/LO)가 응답에 포함되어 있어 지오코딩이 필요 없다.
 *
 * TODO: FCLTY_TY는 '001' 같은 코드값이다. API 명세서의 코드표를 확인해
 * 사람이 읽을 수 있는 라벨로 매핑할 것. 확인 전까지는 원본 코드를 그대로 둔다.
 */
function normalize(raw) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] != null && raw[k] !== '') return raw[k];
    }
    return null;
  };

  return {
    id: String(pick('RSTR_FCLTY_NO') ?? ''),
    name: String(pick('RSTR_NM') ?? ''),
    // 도로명주소를 우선하고, 없으면 지번주소로 떨어진다.
    address: String(pick('RN_DTL_ADRES', 'DTL_ADRES') ?? ''),
    lat: Number(pick('LA')),
    lng: Number(pick('LO')),
    facilityType: pick('FCLTY_TY'),
    capacity: toIntOrNull(pick('USE_PSBL_NMPR')),
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

/**
 * process.exit()을 바로 부르면 stdout이 비워지기 전에 프로세스가 끊겨
 * 메시지가 잘리거나 Windows에서 libuv 어서션으로 죽는다. 던지고 최상위에서
 * exitCode만 세팅해 정상 종료 경로로 빠져나간다.
 */
function fail(message) {
  throw new Error(message);
}

// 직접 실행할 때만 돈다. 테스트에서 개별 함수를 가져다 쓸 수 있도록.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  });
}

export { extractRows, normalize, isUsable };
