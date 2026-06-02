// ─── Firebase init (bundled โดย Vite — ไม่โหลดจาก CDN แล้ว) ──────
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase, forceWebSockets } from 'firebase/database';
import { firebaseConfig } from './config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// บังคับใช้ WebSocket เท่านั้น — กัน Long Polling fallback
// ที่ต้อง inject <script> tag แล้วโดน CSP script-src 'self' บล็อก
forceWebSockets();

// App Check (กัน bot) — เปิดใช้โดยตั้ง VITE_RECAPTCHA_SITE_KEY ใน .env
// ดูขั้นตอนใน SETUP.md ข้อ 6
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  const { initializeAppCheck, ReCaptchaV3Provider } =
    await import('firebase/app-check');
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
