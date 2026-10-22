// Shared by the popup, background and content script. No access to privileged APIs.
'use strict';
const FPSDomainConfig = (() => {
  const DEFAULT_ORIGINS = Object.freeze([
    'https://fps-arena-rosy.vercel.app',
    'http://localhost',
    'http://127.0.0.1'
  ]);
  const MAX_CUSTOM_ORIGINS = 25;
  function normalizeOrigin(value) {
    if (typeof value !== 'string') throw new Error('Vui lòng nhập địa chỉ trang web.');
    let input = value.trim();
    if (!input || input.length > 2048) throw new Error('Địa chỉ không hợp lệ.');
    // Accept either domain.tld or a full URL, without accepting arbitrary schemes.
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
      if (input.includes('://')) throw new Error('Chỉ hỗ trợ HTTP hoặc HTTPS.');
      input = `https://${input}`;
    }
    let url;
    try { url = new URL(input); }
    catch { throw new Error('Địa chỉ không hợp lệ.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Chỉ hỗ trợ HTTP hoặc HTTPS.');
    if (!url.hostname || url.username || url.password || url.hostname.includes('*')) {
      throw new Error('Không hỗ trợ ký tự *, tài khoản hoặc mật khẩu trong địa chỉ.');
    }
    if (url.hostname.includes(':')) throw new Error('Chưa hỗ trợ địa chỉ IPv6.');
    if (url.hostname.endsWith('.')) throw new Error('Tên miền không được kết thúc bằng dấu chấm.');
    // Keep HTTP available for local development; remote sites require HTTPS.
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' ||
      url.hostname === '::1' || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
    if (url.protocol === 'http:' && !isLocal) throw new Error('Tên miền công khai phải dùng HTTPS.');
    return url.origin;
  }
  function matchPattern(origin) {
    const parsed = new URL(origin);
    // WebExtension match patterns intentionally omit ports; the content script
    // does an additional exact-origin allowlist check before page injection.
    return `${parsed.protocol}//${parsed.hostname}/*`;
  }
  function sanitizeCustomDomains(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
      try {
        const origin = normalizeOrigin(item);
        if (!DEFAULT_ORIGINS.includes(origin) && !out.includes(origin)) out.push(origin);
      } catch { /* ignore old/invalid imported configuration */ }
      if (out.length >= MAX_CUSTOM_ORIGINS) break;
    }
    return out;
  }
  function isAllowedOrigin(urlOrOrigin, custom = []) {
    let u;
    try { u = new URL(urlOrOrigin); } catch { return false; }
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    // The two default local hosts intentionally match all dev-server ports.
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
    return DEFAULT_ORIGINS.includes(u.origin) || sanitizeCustomDomains(custom).includes(u.origin);
  }
  return { DEFAULT_ORIGINS, MAX_CUSTOM_ORIGINS, normalizeOrigin, matchPattern, sanitizeCustomDomains, isAllowedOrigin };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FPSDomainConfig;
