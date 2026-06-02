// ─── Presence: RTDB + onDisconnect + heartbeat + freshness ──────
// แก้ปัญหา "ghost sessions": onDisconnect ลบ node ได้เฉพาะตอนปิด graceful
// ถ้าเน็ตหลุด/คอมหลับ/สลับ identity → node ค้าง → นับเกินจริง
// วิธีแก้: heartbeat เคาะ lastSeen + นับเฉพาะคนที่ lastSeen สด + เก็บกวาด ghost
import {
  ref,
  onValue,
  onDisconnect,
  set as rtdbSet,
  remove as rtdbRemove,
  serverTimestamp as rtdbNow,
} from 'firebase/database';
import { rtdb } from './firebase.js';
import { ROOM_ID } from './config.js';
import { state } from './state.js';
import { viewerEl } from './dom.js';

// หมายเหตุ cost: ทุก heartbeat broadcast ให้ทุก listener (O(N²) download)
// 30 วิ เหมาะกับงานเล็ก-กลางบน free tier; งานใหญ่มากควรย้ายไป Cloud Functions
const HEARTBEAT_MS = 30000; // เคาะ lastSeen ทุก 30 วิ
const STALE_MS = 75000; // เกิน 75 วิ ไม่เคาะ = หลุด (ghost) — เผื่อพลาด 1-2 จังหวะ

let _visibilityHandler = null;
let _heartbeat = null;
let _serverOffset = 0; // ชดเชย clock client ให้ตรง server (จาก .info/serverTimeOffset)
const _cleanupTried = new Set(); // กันยิง remove ghost ซ้ำ ๆ ทุก snapshot

export function startPresence() {
  const myStatusRef = ref(rtdb, `status/${ROOM_ID}/${state.uid}`);

  const writePresence = () =>
    rtdbSet(myStatusRef, {
      online: true,
      name: state.myName,
      lastSeen: rtdbNow(), // server time
    });

  function stopHeartbeat() {
    if (_heartbeat) {
      clearInterval(_heartbeat);
      _heartbeat = null;
    }
  }
  function startHeartbeat() {
    stopHeartbeat();
    _heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') writePresence();
    }, HEARTBEAT_MS);
  }

  // server time offset — ใช้คำนวณ "now" ฝั่ง server เพื่อเทียบ staleness แม่นยำ
  onValue(ref(rtdb, '.info/serverTimeOffset'), (snap) => {
    _serverOffset = snap.val() || 0;
  });

  // เชื่อมต่อ/หลุด — ตั้ง onDisconnect + เขียน presence + เริ่ม heartbeat
  onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val() !== true) {
      stopHeartbeat();
      return;
    }
    onDisconnect(myStatusRef).remove(); // server ลบให้เมื่อหลุด graceful
    writePresence();
    startHeartbeat();
  });

  // นับคนออนไลน์ — เฉพาะ "คนสด" (lastSeen ภายใน STALE_MS) + เก็บกวาด ghost
  onValue(ref(rtdb, `status/${ROOM_ID}`), (snap) => {
    const serverNow = Date.now() + _serverOffset;
    let count = 0;
    snap.forEach((child) => {
      const v = child.val();
      const last = v?.lastSeen || 0;
      const isFresh = serverNow - last < STALE_MS;
      if (v?.online && isFresh) {
        count++;
      } else if (!isFresh && !_cleanupTried.has(child.key)) {
        // ghost — best-effort ลบ (ต้อง deploy RTDB rule ให้ลบ node stale ได้)
        // ถ้า rule ไม่อนุญาตจะ permission-denied → .catch กลืน, ยังนับถูกอยู่ดี
        _cleanupTried.add(child.key);
        rtdbRemove(child.ref).catch(() => {});
      }
    });
    viewerEl.textContent = String(count);
  });

  // มือถือ: visibilitychange เชื่อถือกว่า beforeunload
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler);
  }
  _visibilityHandler = () => {
    if (document.visibilityState === 'hidden') {
      stopHeartbeat();
      rtdbRemove(myStatusRef);
    } else {
      writePresence();
      startHeartbeat();
    }
  };
  document.addEventListener('visibilitychange', _visibilityHandler);
}
