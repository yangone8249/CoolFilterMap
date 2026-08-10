# CoolFilterMap

전국 무더위쉼터를 지도에서 찾고 길을 안내받는 앱.

## 구조

```
[GitHub Actions]  cron 하루 1회 (03:00 KST)   🔑 Secrets: 공공데이터 서비스키
      │  전국무더위쉼터표준데이터 수집 → 정규화 → 내용 해시 계산
      │  해시가 배포본과 같으면 → 여기서 종료 (배포 안 함)
      └→ [GitHub Pages]
             manifest.json (수백 B)  +  shelters-<hash>.json

[앱]  실행 시 manifest만 받아 해시 비교
        같음 → 로컬 SQLite 그대로 사용 (네트워크 0)
        다름 → 데이터 내려받아 SQLite 교체
```

전부 무료 한도 안에서 돌아간다. public repo의 Actions는 무제한 무료이고,
Pages는 월 100GB 대역폭에 CDN이 붙어 있다. 결제 수단 등록이 필요 없어
한도 초과로 과금될 여지 자체가 없다.

### 설계 근거

**서버를 상시 띄우지 않는다.** 쉼터 데이터는 시즌 단위로만 바뀌는 정적 데이터라
사용자 요청마다 공공데이터 API를 호출할 이유가 없다. 배치로 미리 가공해두면
API 쿼터를 소모하지 않고, 공공데이터 API가 죽어도 앱은 정상 동작한다.

**앱과 데이터 소스는 URL 하나로만 결합한다.** 파이프라인을 GitHub에서 GCP로
옮기더라도 앱은 `EXPO_PUBLIC_SHELTER_MANIFEST_URL`만 바꾸면 된다.

**키는 클라이언트에 두지 않는다.** 공공데이터 서비스키는 GitHub Secrets에만 있다.
`EXPO_PUBLIC_` 환경변수는 JS 번들에 평문으로 박혀 APK 디컴파일로 노출되므로
감춰야 하는 값을 넣으면 안 된다. 네이버 지도 Client ID는 지도 SDK가 앱에서 직접
통신하는 구조상 포함될 수밖에 없으므로, 대신 NCP 콘솔에 등록한 패키지명으로
사용처를 제한한다.

**메모리가 아니라 SQLite에 담는다.** 5~6만 건을 `JSON.parse`해 배열로 들고 있으면
메모리가 수십 MB로 뛰고 앱 시작도 느려진다. SQLite는 디스크 기반이라 앱을 종료해도
데이터가 남고, 인덱스로 화면에 필요한 만큼만 읽는다.

**반경 검색은 사각형으로 먼저 좁힌다.** 거리 계산은 비싸므로 SQL의 bounding box
조회로 후보를 걸러낸 뒤, 살아남은 소수에만 haversine을 돌린다.

**화면에 다 못 그릴 양이면 아예 그리지 않는다.** 일부만 잘라 그리면 사용자는
그게 전부인 줄 알고 클러스터 숫자도 틀린 값이 된다. 실제 개수를 세서
넘치면 확대를 유도한다.

## 데이터에 대해 알아둘 것

공식 무더위쉼터의 71.7%가 경로당이다. 행안부가 경로당을 주력으로 지정하기
때문이며 데이터 오류가 아니다. 다만 젊은 사람이 들어가기는 어려운 곳이라,
필터 없이는 도서관 771곳·은행 644곳 같은 실제로 쓸 수 있는 장소가 4.4만 개의
경로당에 묻힌다. 카테고리 필터를 넣은 이유다.

지하철역 무더위쉼터는 이 데이터셋에 없다. 필요하면 별도 출처를 병합해야 한다.

| 카테고리 | 건수 | | 카테고리 | 건수 |
|---|---|---|---|---|
| 경로당 | 43,977 | | 주민센터 | 1,517 |
| 마을회관 | 4,646 | | 야외 | 828 |
| 기타 | 4,243 | | 도서관 | 771 |
| 복지·보건 | 2,806 | | 문화·체육 | 174 |
| 은행·마트 | 2,400 | | | |

## 디렉터리

```
.github/workflows/
  update-shelter-data.yml    하루 1회 수집 → 변경 시에만 Pages 배포
scripts/
  build-shelter-data.mjs     수집 · 정규화 · 해시 · 배포본 생성
src/
  config.ts                  앱 설정, 공개 가능한 환경변수
  types.ts                   정규화된 도메인 모델
  geo/distance.ts            haversine, bounding box 계산
  lib/directions.ts          지도 앱 딥링크 (길찾기)
  lib/categories.ts          필터 칩 목록과 라벨
assets/
  shelters.db                번들 스냅샷 (npm run bundle:db로 갱신)
  data/
    db.ts                    SQLite 연결, 스키마, 마이그레이션
    shelterRepository.ts     bbox / 반경 조회, 전체 교체
    syncShelters.ts          manifest 비교 후 갱신
    mockShelters.ts          개발용 목 데이터 (실데이터 붙으면 삭제)
  hooks/
    useCurrentLocation.ts    위치 권한 + 현재 위치
    useShelterData.ts        부트스트랩, 백그라운드 동기화
  screens/MapScreen.tsx      지도 + 클러스터 + 상세 시트
```

### 자주 건드리게 되는 파일

| 하고 싶은 것 | 볼 파일 |
|---|---|
| API 키·URL 넣기 | `.env` |
| 반경·마커 수·클러스터 강도 조정 | `src/config.ts` |
| 패키지명, 플러그인 추가, 권한 문구 | `app.config.ts` |
| 공공데이터 필드 매핑 | `scripts/build-shelter-data.mjs`의 `normalize()` |
| 화면 UI·상호작용 | `src/screens/MapScreen.tsx` |
| 조회 쿼리 바꾸기 | `src/data/shelterRepository.ts` |
| 갱신 주기 | `.github/workflows/update-shelter-data.yml`의 `cron` |

나머지는 한 번 정해지면 거의 손대지 않는다.

> ⚠️ `normalize()`가 **두 군데** 있다. 스키마가 확정되면
> `scripts/build-shelter-data.mjs`(파이프라인)와 `src/data/syncShelters.ts`(앱 방어용)를
> 같이 고쳐야 한다.

## 실행

```bash
npm install
```

`.env.example`을 `.env`로 복사하고 값을 채운다. 비워두면 목 데이터로 동작한다.

네이버 지도는 네이티브 모듈이라 **Expo Go로는 실행되지 않는다.** 개발 빌드가 필요하다:

```bash
npx expo run:android
```

### 한글 Windows에서 빌드하기

Android NDK 빌드는 경로에 non-ASCII 문자가 섞이면 깨진다. 두 곳을 봐야 한다.

**프로젝트 경로** — 한글이나 공백이 없는 곳에 두어야 한다. Gradle이 아예
`Your project path contains non-ASCII characters`로 거부한다.

**TEMP 경로** — 사용자명이 한글이면(`C:\Users\홍길동\AppData\Local\Temp`) 더
고약하다. AGP가 생성하는 `prefab_command.bat` 안에 그 경로가 박히는데, cmd.exe가
한글을 OEM 코드페이지로 읽으면서 바이트 오프셋이 틀어지고 `^` 줄바꿈 파싱이
깨진다. 증상은 엉뚱하다:

```
'ass-path' is not recognized as an internal or external command
```

`--class-path`가 `ass-path`로 잘린 것이다. 경로 문제로 안 보여서 헤매기 쉽다.
빌드 전에 TEMP를 ASCII 경로로 돌려두면 된다:

```bash
setx TEMP D:\temp && setx TMP D:\temp
```

설정 후에는 터미널을 새로 열어야 적용된다. Gradle 데몬이 옛 환경변수를 물고
있으므로 `android/gradlew --stop`으로 한 번 내려주는 것도 필요하다.

### USB로 실기기에 붙이기

`expo run:android`는 PC의 IP를 자동 감지하는데, 공인 IP를 잡아버리면 폰이 Metro에
접속하지 못한다. USB로 연결돼 있다면 `adb reverse`로 넘기는 편이 확실하다.

```bash
adb reverse tcp:8081 tcp:8081
```

폰과 PC가 다른 네트워크에 있어도 USB만 꽂혀 있으면 이걸로 해결된다.

⚠️ 이때 Metro를 `--localhost`로 띄우면 **IPv6(`::1`)에만 바인딩되어** 접속이
실패한다. adb reverse는 IPv4로 붙기 때문이다. 증상은 앱에서 이렇게 보인다:

```
java.io.IOException: unexpected end of stream on http://localhost:8081/...
Caused by: java.io.EOFException: \n not found: limit=0
```

플래그 없이 띄우면 `0.0.0.0`에 바인딩되어 정상 동작한다.

```bash
npx expo start --dev-client
```

확인할 때 `curl http://localhost:8081/status`는 Windows가 `::1`로 먼저 해석해서
성공해버린다. **`127.0.0.1`로 확인해야** 이 문제가 드러난다.

## 데이터 파이프라인

### 스키마 확인 (가장 먼저 할 것)

인증키를 발급받으면 실제 응답 구조부터 확인한다. **위경도가 응답에 있는지**에
따라 이후 작업이 갈린다.

```bash
DATA_GO_KR_SERVICE_KEY=발급키 npm run data:inspect
```

원본 필드명과 `normalize()` 매핑 결과를 출력한다. 응답에 위경도(`LA`/`LO`)가
들어 있어 지오코딩은 필요 없다.

### GitHub 설정

1. repo를 **public**으로 둔다 (Actions 무제한 무료 조건)
2. Settings → Pages → Source를 **GitHub Actions**로 설정
3. Settings → Secrets and variables → Actions
   - Secret `DATA_GO_KR_SERVICE_KEY` — 공공데이터 인증키
   - Variable `PUBLISHED_MANIFEST_URL` — `https://<user>.github.io/<repo>/manifest.json`
4. Actions 탭에서 워크플로를 수동 실행(`workflow_dispatch`)해 첫 배포
5. 배포된 URL을 앱 `.env`의 `EXPO_PUBLIC_SHELTER_MANIFEST_URL`에 넣는다

인증키가 아직 없다면 **목 데이터로 먼저 배포해 파이프라인을 검증**할 수 있다.
수동 실행 시 `mock` 옵션을 켜면 Secret 없이도 끝까지 돌아간다. 목 데이터도
원본 API와 같은 형태라 `normalize()`와 좌표 필터링을 동일하게 거친다.

```bash
npm run data:mock   # 로컬에서 dist/ 결과만 확인
```

> ⚠️ public repo의 scheduled workflow는 **60일간 저장소 활동이 없으면 자동
> 비활성화**된다. 오래 손대지 않으면 데이터 갱신이 멈추므로, 멈춘 걸 발견하면
> Actions 탭에서 다시 활성화한다.

### 번들 스냅샷 갱신

`assets/shelters.db`는 설치 직후 첫 실행에서 복사해 쓰는 스냅샷이다. 이게 없으면
6만 건을 받아 넣는 동안(약 7초) 빈 지도가 보이고, **인터넷이 없으면 아예 아무것도
못 본다.** 릴리스 빌드 전에 갱신한다.

```bash
npm run bundle:db
```

배포된 manifest에서 현재 데이터를 받아 SQLite 파일로 만든다. 생성 시점의 해시도
함께 심어두므로, 원격이 그대로면 첫 실행에서 재다운로드도 일어나지 않는다.

> 스키마는 `src/data/db.ts`의 `SCHEMA_VERSION`과 맞아야 한다. 스키마를 바꾸면
> 스크립트의 상수도 같이 올리고 `npm run bundle:db`를 다시 돌릴 것. 버전이
> 어긋나면 앱이 번들 DB를 버리고 전체 재동기화로 떨어진다(동작은 하지만 느리다).

## 남은 작업

- [x] 인증키 발급 → 스키마 확인. 위경도가 응답에 있어 지오코딩 불필요
- [x] GitHub Pages + Secrets + 자동 배포 (cron이 하루 1회 스스로 갱신)
- [x] NCP 패키지명(`com.coolfiltermap.app`) 등록 후 Client ID 발급
- [x] 마커 클러스터링 (`NaverMapView`의 `clusters` prop)
- [x] 길찾기 — 네이버지도 → 카카오맵 → 웹 순으로 폴백
- [x] 대량 삽입 최적화 — 6만 건 저장 41초 → 5초
- [x] 카테고리 필터
- [x] 실기기(SM-G998N) 검증 — 지도, 원격 동기화, 클러스터링, 거리 계산,
      딥링크, 필터까지 동작 확인
- [x] 초기 DB를 앱 번들에 동봉 — 첫 실행 지연과 오프라인 공백 제거
- [ ] **실기기에서 번들 DB 검증** (구현만 끝났고 기기 연결이 끊겨 미확인)
- [ ] 목록 화면 (지도 ↔ 리스트 전환)
- [ ] 델타 동기화 — 데이터가 며칠에 한 번 바뀌는데 그때마다 6만 건을 다시 넣는다.
      28건 바뀐 날에도 11MB를 받고 485MB를 쓴다. 지도는 네이티브라 안 끊기지만
      저사양 기기에서는 OOM 여지가 있다.
- [ ] 카테고리 분류를 API 명세서 코드표로 검증 (지금은 이름 기반 추론)

## 데이터 출처

[재난안전데이터공유플랫폼](https://www.safetydata.go.kr/) — 행정안전부
`DSSP-IF-10942` (전국 무더위쉼터)

> `data.go.kr`의 [전국무더위쉼터표준데이터](https://www.data.go.kr/data/15013199/standard.do)도
> 같은 데이터를 안내하지만, `apis.data.go.kr/1741000/HeatWaveShelter*` 엔드포인트는
> 모든 버전이 `NO_OPENAPI_SERVICE_ERROR`(폐기됨)를 반환한다.
