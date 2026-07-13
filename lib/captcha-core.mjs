const CAPTCHA_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function createCaptchaText(random = Math.random, length = 6) {
  return Array.from({ length }, () => CAPTCHA_ALPHABET[Math.floor(random() * CAPTCHA_ALPHABET.length) % CAPTCHA_ALPHABET.length]).join('');
}

export function isCaptchaTextSafe(value) {
  const text = String(value || '');
  return text.length >= 6 && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/.test(text);
}

export function captchaGlyphLayout(text) {
  return Array.from(String(text || '')).map((char, index) => ({
    char,
    x: 23 + index * 27,
    y: 38 + ((index % 2) ? 3 : -2),
    rotate: [-12, 8, -6, 11, -9, 5][index % 6],
  }));
}
