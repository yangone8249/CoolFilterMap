const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * 릴리스 서명 설정을 android/app/build.gradle에 주입한다.
 *
 * android/는 prebuild --clean이 통째로 다시 만드는 폴더라, 거기에 서명 설정을
 * 직접 넣으면 날아간다. 플러그인으로 두면 prebuild가 매번 다시 넣어준다.
 *
 * 비밀번호를 build.gradle에 박아 넣지 않는다. 프로젝트 루트의
 * keystore.properties(gitignore 대상)를 gradle이 빌드 시점에 읽게만 한다.
 * 그 파일이 없으면 기존 동작(디버그 키로 서명)을 그대로 유지하므로,
 * 저장소를 clone한 사람도 개발 빌드는 문제없이 돌릴 수 있다.
 */

const RELEASE_SIGNING_CONFIG = `
        release {
            // 루트의 keystore.properties에서 읽는다. 없으면 아래에서 debug로 떨어진다.
            def props = new Properties()
            def propsFile = rootProject.file('../keystore.properties')
            if (propsFile.exists()) {
                props.load(new FileInputStream(propsFile))
                // storeFile은 프로젝트 루트 기준으로 적는다.
                // file()은 android/app 기준이라 헷갈리므로 쓰지 않는다.
                storeFile rootProject.file('../' + props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }`;

const RELEASE_BUILD_TYPE_SIGNING = `            signingConfig rootProject.file('../keystore.properties').exists() ? signingConfigs.release : signingConfigs.debug`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes('keystore.properties')) {
      return cfg; // 이미 적용됨
    }

    // 1) signingConfigs에 release 추가. debug 블록 닫힘 직후에 끼워 넣는다.
    const signingAnchor = `            keyPassword 'android'\n        }`;
    if (!contents.includes(signingAnchor)) {
      throw new Error(
        '[withReleaseSigning] signingConfigs.debug 블록을 찾지 못했습니다. ' +
          'Expo 템플릿이 바뀌었을 수 있으니 플러그인을 확인하세요.',
      );
    }
    contents = contents.replace(
      signingAnchor,
      `${signingAnchor}${RELEASE_SIGNING_CONFIG}`,
    );

    // 2) release 빌드타입이 debug 키로 서명하던 것을 조건부로 바꾼다.
    //    같은 문자열이 debug 블록에도 있으므로 주석까지 포함해 특정한다.
    const buildTypeAnchor =
      '            // see https://reactnative.dev/docs/signed-apk-android.\n' +
      '            signingConfig signingConfigs.debug';
    if (!contents.includes(buildTypeAnchor)) {
      throw new Error(
        '[withReleaseSigning] release 빌드타입의 signingConfig를 찾지 못했습니다. ' +
          'Expo 템플릿이 바뀌었을 수 있으니 플러그인을 확인하세요.',
      );
    }
    contents = contents.replace(
      buildTypeAnchor,
      '            // see https://reactnative.dev/docs/signed-apk-android.\n' +
        RELEASE_BUILD_TYPE_SIGNING,
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
};
