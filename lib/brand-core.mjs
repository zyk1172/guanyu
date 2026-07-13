const BRAND_IDENTITIES = {
  'zh-CN': { name: '观隅', tagline: '看见新闻没有展开的一角' },
  'zh-TW': { name: '觀隅', tagline: '看見新聞尚未展開的一角' },
  'en-US': { name: 'NewsLens', tagline: 'See the angle a news story leaves unexplored' },
  'ja-JP': { name: 'ニュースの死角', tagline: 'ニュースが見落とした角度を見つける' },
  'ko-KR': { name: '뉴스의 사각', tagline: '뉴스가 펼치지 못한 관점을 보다' },
  'de-DE': { name: 'Nachrichtenwinkel', tagline: 'Die unerzaehlte Seite einer Nachricht sehen' },
  'it-IT': { name: 'Angolo Notizie', tagline: "Vedere l'angolo che una notizia non ha esplorato" },
};

export function getBrandIdentity(language = 'zh-CN') {
  return BRAND_IDENTITIES[language] || BRAND_IDENTITIES['zh-CN'];
}

export function getSupportedBrandLanguages() {
  return Object.keys(BRAND_IDENTITIES);
}
