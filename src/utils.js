// ─── Pure helpers (ไม่มี side-effect / DOM / Firebase → unit-test ได้) ──
import { AVATAR_COLORS } from './config.js';

// สีอวตารแบบ deterministic จากชื่อ
export function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function initialOf(name) {
  return (name.trim().charAt(0) || '?').toUpperCase();
}

// รับเฉพาะสี hex 6 หลัก — กัน CSS/attribute injection (M5)
export function safeColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#74B9FF';
}

// Firestore Timestamp → millis (รองรับ serverTimestamp ที่ยัง pending)
export function tsToMillis(ts) {
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  return Date.now();
}

export function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const REACTION_EMOJI = { like: '👍', love: '❤️', clap: '👏' };
