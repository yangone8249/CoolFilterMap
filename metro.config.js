const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// assets/shelters.db를 에셋으로 번들에 넣기 위해. 기본 assetExts에 db가 없어서
// 이걸 빠뜨리면 require('...shelters.db')가 모듈로 해석되며 빌드가 깨진다.
config.resolver.assetExts.push('db');

module.exports = config;
