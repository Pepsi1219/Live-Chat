// ─── Error monitoring (Sentry) ──────────────────────────────────
// เปิดใช้โดยตั้ง VITE_SENTRY_DSN ใน .env
// ถ้าไม่ตั้งค่า → ไม่โหลด Sentry เลย (zero cost / zero bundle)
//
// Sentry โหลดจาก CDN ณ runtime (dynamic import) เพื่อไม่ให้อยู่ใน bundle หลัก
// ต้องเพิ่ม https://browser.sentry-cdn.com ใน CSP connect-src ด้วย (ดู SETUP.md)

const SENTRY_CDN = 'https://browser.sentry-cdn.com/8/bundle.min.js';

let _Sentry = null;

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    // โหลด Sentry จาก CDN เป็น side-effect script (window.Sentry)
    await new Promise((resolve, reject) => {
      if (window.Sentry) return resolve();
      const s = document.createElement('script');
      s.src = SENTRY_CDN;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    _Sentry = window.Sentry;
    _Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.2,
      beforeSend(event) {
        const msg = event?.exception?.values?.[0]?.value || '';
        if (msg.includes('Failed to fetch') || msg.includes('Network Error')) {
          return null;
        }
        return event;
      },
    });
  } catch (err) {
    console.warn('Sentry init failed', err);
  }
}

export function captureError(err, context = {}) {
  if (_Sentry) {
    _Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      _Sentry.captureException(err);
    });
  } else {
    console.error('[error]', err, context);
  }
}
