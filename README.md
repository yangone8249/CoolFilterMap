# CoolFilterMap

전국 무더위쉼터 **약 6만여 곳**을 지도에서 찾고 도보 길찾기로 연결하는 안드로이드 앱.

**[APK 내려받기](https://github.com/yangone8249/CoolFilterMap/releases/latest)**
· Android 7.0+ · arm64

## 사용 기술

| 영역 | 사용 |
|---|---|
| 앱 | Expo (React Native) · TypeScript |
| 지도 | 네이버 지도 SDK (`@mj-studio/react-native-naver-map`) |
| 로컬 저장 | expo-sqlite |
| 위치 | expo-location |
| 데이터 수집 | GitHub Actions (cron), GitHub Pages |
| 길찾기 | 네이버지도 / 카카오맵 딥링크 |


## 구조

```
[GitHub Actions]  매일 03:00 KST · 🔑 Secrets: 공공데이터 서비스키
      │  수집 → 정규화 → 카테고리 분류 → 내용 해시 계산
      │  해시가 배포본과 같으면 여기서 종료
      └→ [GitHub Pages]  manifest.json (200B) + shelters-<hash>.json (2MB)

[앱]  설치 직후   번들 DB 복사 → 61,362곳 즉시 표시 (네트워크 0)
      실행할 때   manifest만 받아 해시 비교
                   같음 → 아무것도 안 함
                   다름 → 데이터 받아 SQLite 교체
      사용 중     화면 영역만 bbox 쿼리 → 마커 렌더
```

앱은 정적 파일을 **가져갈** 뿐이다. 서버가 폰으로 보내지 않으므로 사용자가
늘어도 Actions 실행 횟수는 하루 1회로 고정이다.

## 설계 근거

**상시 서버를 두지 않는다.** 쉼터 데이터는 정적이라 사용자 요청마다 공공데이터
API를 부를 이유가 없다. 배치로 미리 가공하면 API 쿼터를 쓰지 않고, 공공데이터
API가 죽어도 앱은 정상 동작한다.

**키는 클라이언트에 두지 않는다.** 서비스키는 GitHub Secrets에만 있다.
`EXPO_PUBLIC_` 값은 JS 번들에 평문으로 박히므로 감출 것을 넣으면 안 된다.
지도 Client ID는 SDK 구조상 포함될 수밖에 없어 NCP에 등록한 패키지명으로 제한한다.

**메모리가 아니라 SQLite에 담는다.** 6만 건을 배열로 들면 메모리가 수십 MB로
뛰고 앱 시작도 느려진다. SQLite는 디스크 기반이라 앱을 종료해도 남고 인덱스로
필요한 만큼만 읽는다.

**스냅샷을 앱에 동봉한다.** 없으면 첫 실행에서 7초간 빈 지도가 보이고,
인터넷이 없으면 아예 아무것도 못 본다. 후자가 특히 나쁘다.

**다 못 그릴 양이면 아예 그리지 않는다.** 일부만 잘라 그리면 사용자는 그게
전부인 줄 알고 클러스터 숫자도 틀린 값이 된다. 실제 개수를 세서 넘치면
확대를 유도한다.

## 디렉터리

```
.github/workflows/           하루 1회 수집 → 변경 시에만 Pages 배포
plugins/withReleaseSigning   릴리스 서명을 build.gradle에 주입
scripts/
  build-shelter-data.mjs     수집 · 정규화 · 분류 · 해시
  build-bundled-db.mjs       번들 스냅샷 생성
  build-apk.mjs              릴리스 APK 빌드 (arm64)
src/
  config.ts                  반경 · 마커 상한 · 클러스터 설정
  geo/distance.ts            haversine · bounding box
  data/                      SQLite · 조회 · 동기화
  hooks/                     위치 · 데이터 부트스트랩
  lib/                       딥링크 · 카테고리
  screens/MapScreen.tsx      지도 · 필터 · 상세
assets/shelters.db           번들 스냅샷 (npm run bundle:db)
```

## 실행

```bash
npm install
```

`.env.example`을 `.env`로 복사하고 값을 채운다. 비워두면 목 데이터로 동작한다.

네이버 지도는 네이티브 모듈이라 **Expo Go로는 안 된다.** 개발 빌드가 필요하다.

```bash
npx expo run:android
```

빌드나 연결이 막히면 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) 참고.

## 릴리스 빌드

서명 키를 만든다 (최초 1회, 프로젝트 루트에서).

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias coolfiltermap -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ 이 파일을 잃으면 같은 앱으로 업데이트를 낼 수 없다. 백업할 것.

`keystore.properties.example`을 `keystore.properties`로 복사해 값을 채운 뒤:

```bash
npm run build:apk
```

`android/app/build/outputs/apk/release/app-release.apk` (56MB)가 나온다.
arm64만 담는다. 4개 아키텍처를 다 담으면 170MB가 되고, 요즘 기기는 전부 arm64다.

서명 설정은 `plugins/withReleaseSigning.js`가 prebuild마다 주입한다. `android/`는
`prebuild --clean`이 다시 만드는 폴더라 거기에 직접 넣으면 날아간다. 비밀번호는
build.gradle에 박히지 않고, gradle이 빌드 시점에 `keystore.properties`를 읽는다.

**APK에 들어가는 것** — 뜯어서 확인한 결과다.

| | |
|---|---|
| 공공데이터 서비스키 | 없음 |
| keystore 비밀번호 | 없음 (서명은 빌드 시점에만) |
| 네이버 Client ID | 있음 (패키지명으로 제한) |

## 데이터 파이프라인

인증키를 받으면 응답 구조부터 확인한다.

```bash
DATA_GO_KR_SERVICE_KEY=발급키 npm run data:inspect
```

### GitHub 설정

1. repo를 **public**으로 (Actions 무제한 무료 조건)
2. Settings → Pages → Source를 **GitHub Actions**로
3. Secret `DATA_GO_KR_SERVICE_KEY`, Variable `PUBLISHED_MANIFEST_URL` 등록
4. Actions 탭에서 수동 실행 → 배포된 URL을 `.env`에 반영

인증키가 없어도 `mock` 옵션으로 파이프라인을 검증할 수 있다.

> ⚠️ public repo의 scheduled workflow는 **60일간 저장소 활동이 없으면 자동
> 비활성화**된다. 멈춘 걸 발견하면 Actions 탭에서 다시 켠다.

### 번들 스냅샷 갱신

```bash
npm run bundle:db
```

릴리스 빌드 전에 돌린다. 스키마는 `src/data/db.ts`의 `SCHEMA_VERSION`과 맞아야
한다. 어긋나면 앱이 번들 DB를 버리고 전체 재동기화로 떨어진다.

## 데이터

출처: 행정안전부 [재난안전데이터공유플랫폼](https://www.safetydata.go.kr/)
`DSSP-IF-10942`. 위경도가 응답에 포함되어 지오코딩이 필요 없다.

공식 무더위쉼터의 **71.7%가 경로당**이다. 행안부가 경로당을 주력으로 지정하기
때문이며 데이터 오류가 아니다. 다만 아무나 들어가기는 어려운 곳이라, 필터 없이는
도서관 771곳·은행 644곳 같은 실제로 쓸 수 있는 장소가 묻힌다. 카테고리 필터를
넣은 이유다. 지하철역 무더위쉼터는 이 데이터셋에 없다.

| 카테고리 | 건수 | | 카테고리 | 건수 |
|---|---|---|---|---|
| 경로당 | 43,977 | | 주민센터 | 1,517 |
| 마을회관 | 4,646 | | 야외 | 828 |
| 기타 | 4,243 | | 도서관 | 771 |
| 복지·보건 | 2,806 | | 문화·체육 | 174 |
| 은행·마트 | 2,400 | | | |

## 남은 작업

- [ ] 목록 화면 (지도 ↔ 리스트 전환)
- [ ] 델타 동기화 — 데이터가 며칠에 한 번 바뀌는데 그때마다 6만 건을 다시 넣는다.
      28건 바뀐 날에도 11MB를 받고 485MB를 쓴다. 지도는 네이티브라 안 끊기지만
      저사양 기기에서는 OOM 여지가 있다.
- [ ] 카테고리 분류를 API 명세서 코드표로 검증 (지금은 이름 기반 추론)
- [ ] `SYSTEM_ALERT_WINDOW` 권한 제거 (expo-dev-client가 넣은 것이 릴리스에 남음)
