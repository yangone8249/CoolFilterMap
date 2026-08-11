#!/usr/bin/env node
/**
 * 배포용 릴리스 APK를 만든다.
 *
 *   npm run build:apk
 *
 * gradlew를 직접 부르지 않고 이 스크립트를 두는 이유:
 *  - Windows는 gradlew.bat, 그 외는 ./gradlew라 npm 스크립트 한 줄로 안 된다.
 *  - arm64-v8a만 빌드해야 한다. 기본값은 4개 아키텍처를 전부 넣어서
 *    APK가 170MB까지 부푼다. arm64만 담으면 56MB다. 요즘 안드로이드 기기는
 *    사실상 전부 arm64라 나머지는 낭비다.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const APK_PATH = path.join(
  ANDROID_DIR,
  'app/build/outputs/apk/release/app-release.apk',
);

if (!existsSync(ANDROID_DIR)) {
  console.error('✗ android/ 가 없습니다. 먼저 npx expo prebuild --platform android');
  process.exit(1);
}

if (!existsSync(path.join(ROOT, 'keystore.properties'))) {
  console.warn(
    '⚠ keystore.properties가 없어 디버그 키로 서명됩니다. 배포용으로는 쓸 수 없습니다.\n' +
      '  README의 "릴리스 빌드" 절을 참고해 키를 만드세요.\n',
  );
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(
  gradlew,
  [
    'assembleRelease',
    '-x',
    'lint',
    '-x',
    'test',
    '-PreactNativeArchitectures=arm64-v8a',
  ],
  { cwd: ANDROID_DIR, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  console.error('✗ 빌드 실패');
  process.exit(result.status ?? 1);
}

const { size } = statSync(APK_PATH);
console.log(`\n✓ ${path.relative(ROOT, APK_PATH)}`);
console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB`);
