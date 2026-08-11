import type { ConfigContext, ExpoConfig } from 'expo/config';

// 지도 SDK는 앱이 네이버 서버와 직접 통신하므로 client_id는 앱에 포함될 수밖에 없다.
// 숨기는 대신 NCP 콘솔에 등록한 패키지명으로 사용처를 제한한다.
// 등록한 패키지명과 다르면 네이버가 401로 거부한다.
const NAVER_MAP_CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID ?? '';

// TODO: NCP에 앱을 등록하기 전에 확정할 것. 등록 후에는 변경이 번거롭다.
const BUNDLE_ID = 'com.coolfiltermap.app';

// 네이버 지도 SDK(com.naver.maps:map-sdk)는 Maven Central이 아니라 네이버 자체
// 저장소에 있다. 지도 라이브러리가 의존성만 선언하고 저장소는 앱이 추가하도록
// 되어 있어, 이게 없으면 "Could not find com.naver.maps:map-sdk"로 빌드가 깨진다.
const NAVER_MAVEN_REPO = 'https://repository.map.naver.com/archive/maven';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'CoolFilterMap',
  slug: 'CoolFilterMap',
  android: {
    ...config.android,
    package: BUNDLE_ID,
  },
  ios: {
    ...config.ios,
    bundleIdentifier: BUNDLE_ID,
  },
  // 플러그인은 여기가 단일 소스다. `npx expo install`이 app.json에 플러그인을
  // 추가하더라도 이 배열이 덮어쓰므로, 새 플러그인은 이쪽으로 옮겨야 한다.
  plugins: [
    './plugins/withReleaseSigning',
    'expo-sqlite',
    'expo-dev-client',
    ['expo-build-properties', { android: { extraMavenRepos: [NAVER_MAVEN_REPO] } }],
    ['@mj-studio/react-native-naver-map', { client_id: NAVER_MAP_CLIENT_ID }],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          '가까운 무더위쉼터를 찾기 위해 현재 위치를 사용합니다.',
      },
    ],
  ],
});
