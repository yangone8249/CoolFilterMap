/** Metro가 에셋으로 처리하는 SQLite 번들 파일. require()의 반환값은 asset id다. */
declare module '*.db' {
  const asset: number;
  export default asset;
}
