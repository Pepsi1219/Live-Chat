// ─── Theme toggle: dark / light ─────────────────────────────────
// ค่าเริ่มต้นถูกตั้งโดย public/theme-init.js (กัน FOUC) ก่อนหน้านี้แล้ว
// โมดูลนี้ดูแลแค่การ "สลับ" ตอน user กดปุ่ม + จำค่า + อัปเดต status bar
const STORAGE_KEY = 'lc-theme';
const root = document.documentElement;

function setThemeColorMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#eef1f8' : '#090a1a');
  }
}

export function currentTheme() {
  return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  setThemeColorMeta(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (e) {
    /* private mode — แค่ไม่จำค่า ไม่ใช่ error */
  }
}
