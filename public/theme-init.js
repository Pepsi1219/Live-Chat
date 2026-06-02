// FOUC guard — รันแบบ blocking ใน <head> ก่อน paint
// ตั้ง data-theme จาก localStorage หรือ system preference
// (inline script ทำไม่ได้เพราะ CSP script-src 'self' — จึงแยกไฟล์ same-origin)
(function () {
  try {
    var saved = localStorage.getItem('lc-theme');
    var theme =
      saved ||
      (window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#eef1f8' : '#090a1a');
    }
  } catch (e) {
    /* localStorage บล็อก (private mode) — default ตาม CSS = dark */
  }
})();
