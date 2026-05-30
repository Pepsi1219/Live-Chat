// ─── App constants & Firebase config ────────────────────────────
// Firebase web config มาจาก .env (Vite) — เป็นค่า public โดยธรรมชาติ
// ความปลอดภัยพึ่ง Security Rules + App Check ไม่ใช่การซ่อนค่าเหล่านี้

export const ROOM_ID = 'main';
export const MAX_LEN = 200;
export const INITIAL_LIMIT = 50; // โหลดล่าสุดแค่ 50 ข้อความ
export const MAX_DOM = 200; // กันการ์ดล้น DOM
export const SLOW_MODE_MS = 3000; // best-effort slow mode
export const MSG_TTL_MS = 24 * 60 * 60 * 1000; // ข้อความหมดอายุใน 24 ชม. (Firestore TTL)

export const AVATAR_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#FFE66D',
  '#A8E6CF',
  '#FF8B94',
  '#6C5CE7',
  '#FD79A8',
  '#55EFC4',
  '#FDCB6E',
  '#74B9FF',
  '#F8A5C2',
  '#A29BFE',
  '#81ECEC',
  '#FAB1A0',
  '#B2BEFF',
  '#00CEC9',
];

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
