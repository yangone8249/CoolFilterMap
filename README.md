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
| 길찾기 | 네이버지도 API / 카카오맵 딥링크 |


## 구조

```
[GitHub Actions]  매일 03:00 KST · 🔑 Secrets: 공공데이터 서비스키
      │  수집 → 정규화 → 카테고리 분류 → 내용 해시 계산
      │  해시가 배포본과 같으면 여기서 종료
      └→ [GitHub Pages]  manifest.json (200B) + shelters-<hash>.json (2MB)

[앱]  설치 직후   번들 DB 복사 → 6만 개 즉시 표시 (네트워크 필요X)
      실행할 때   manifest만 받아 해시 비교
                   같음 → 아무것도 안 함
                   다름 → 데이터 받아 SQLite 교체
      사용 중     화면 영역만 bbox 쿼리 → 마커 렌더
```

앱은 정적 파일을 **가져갈** 뿐이다. 서버가 폰으로 보내지 않으므로 사용자가
늘어도 Actions 실행 횟수는 하루 1회로 고정이다.

## 동작 방식

**메모리가 아니라 SQLite에 담는다.** 6만 건을 배열로 들면 메모리가 수십 MB로
뛰고 앱 시작도 느려진다. SQLite는 디스크 기반이라 앱을 종료해도 남고 인덱스로
필요한 만큼만 읽는다.

**스냅샷을 앱에 동봉한다.** 없으면 첫 실행에서 7초간 빈 지도가 보이고,
인터넷이 없으면 아예 아무것도 못 본다. 후자가 특히 나쁘다.

**다 못 그릴 양이면 아예 그리지 않는다.** 일부만 잘라 그리면 사용자는 그게
전부인 줄 알고 클러스터 숫자도 틀린 값이 된다. 실제 개수를 세서 넘치면
확대를 유도한다.


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
