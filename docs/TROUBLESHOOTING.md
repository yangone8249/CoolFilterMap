# 삽질 기록

개발하면서 실제로 막혔던 것들. 증상이 원인과 동떨어져 보이는 것 위주로 남긴다.

## 한글 Windows에서 NDK 빌드가 깨진다

경로에 non-ASCII 문자가 섞이면 Android NDK 빌드가 실패한다. 두 곳을 봐야 한다.

**프로젝트 경로** — Gradle이 아예 거부한다. 그나마 메시지가 정직하다.

```
Your project path contains non-ASCII characters
```

한글·공백 없는 경로로 옮기면 된다.

**TEMP 경로** — 사용자명이 한글이면(`C:\Users\홍길동\AppData\Local\Temp`) 훨씬
고약하다. AGP가 만드는 `prefab_command.bat`에 그 경로가 박히는데, cmd.exe가
한글을 OEM 코드페이지로 읽으면서 바이트 오프셋이 틀어지고 `^` 줄바꿈 파싱이
무너진다. 증상은 경로와 아무 상관 없어 보인다.

```
'ass-path' is not recognized as an internal or external command
```

`--class-path`가 `ass-path`로 잘린 것이다. 빌드 전에 TEMP를 ASCII로 돌려둔다.

```bash
setx TEMP D:\temp && setx TMP D:\temp
```

터미널을 새로 열어야 적용된다. Gradle 데몬이 옛 환경변수를 물고 있으므로
`android/gradlew --stop`으로 한 번 내려주는 것도 필요하다.

## 네이버 지도 SDK를 찾지 못한다

```
Could not find com.naver.maps:map-sdk:3.23.2
```

`com.naver.maps:map-sdk`는 Maven Central이 아니라 네이버 자체 저장소에 있다.
지도 라이브러리가 의존성만 선언하고 저장소 등록은 앱에 맡긴다.
`app.config.ts`의 `expo-build-properties`에서 `extraMavenRepos`로 추가한다.

## 폰이 Metro에 붙지 못한다

`expo run:android`는 PC의 IP를 자동 감지하는데, 공인 IP를 잡아버리면 폰이
접속하지 못한다. USB로 연결돼 있다면 `adb reverse`가 확실하다.

```bash
adb reverse tcp:8081 tcp:8081
```

폰과 PC가 다른 네트워크에 있어도 USB만 꽂혀 있으면 해결된다.

⚠️ 이때 Metro를 `--localhost`로 띄우면 **IPv6(`::1`)에만 바인딩되어** 실패한다.
adb reverse는 IPv4로 붙기 때문이다. 앱에는 이렇게 보인다.

```
java.io.IOException: unexpected end of stream on http://localhost:8081/...
Caused by: java.io.EOFException: \n not found: limit=0
```

플래그 없이 `npx expo start --dev-client`로 띄우면 `0.0.0.0`에 바인딩되어
정상 동작한다.

확인할 때 `curl http://localhost:8081/status`는 Windows가 `::1`로 먼저 해석해
성공해버린다. **`127.0.0.1`로 확인해야** 이 문제가 드러난다.

## 번들 DB 복사가 실패한다

```
java.lang.IllegalArgumentException: URI is not absolute
```

`SQLite.defaultDatabaseDirectory`는 스킴 없는 경로(`/data/user/0/...`)를 주는데
`expo-file-system`의 `File`/`Directory`는 `file://` URI를 요구한다.
`src/data/db.ts`의 `toFileUri()`가 이걸 처리한다.

## 데이터 수집이 fetch failed로만 죽는다

Node의 `fetch`는 실제 원인을 `error.cause`에 감추고 겉에는 `fetch failed`만
남긴다. 원인 체인을 끝까지 펼쳐야 `ENOTFOUND`인지 인증서 문제인지 알 수 있다.
`scripts/build-shelter-data.mjs`의 `describeError()`가 그 역할을 한다.

62페이지를 순차로 받는 동안 한 번만 실패해도 전체가 죽으므로 4회 재시도를 둔다.

## data.go.kr 엔드포인트가 전부 폐기됐다

```
NO_OPENAPI_SERVICE_ERROR — 해당 오픈API 서비스가 없거나 폐기됨
```

`apis.data.go.kr/1741000/HeatWaveShelter*`는 모든 버전이 이 응답을 준다.
살아 있는 것은 재난안전데이터공유플랫폼(`safetydata.go.kr`) 쪽이다.
인증키 문제로 착각하기 쉽다.

## PowerShell이 파일에 BOM을 붙인다

`Set-Content -Encoding utf8`은 UTF-8 **with BOM**으로 쓴다. `package.json`이나
JSON 데이터 파일에 붙으면 파싱이 깨진다.

```
SyntaxError: Unexpected token '﻿', "﻿{ "name"... is not valid JSON
```

`[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`
를 쓰면 BOM 없이 쓴다.
