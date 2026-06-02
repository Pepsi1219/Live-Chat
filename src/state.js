// ─── Shared mutable state ───────────────────────────────────────
// ใช้ object เดียวร่วมกันทุก module (อ้างอิงเดียวกัน)
export const state = {
  uid: null,
  myName: '',
  myColor: '',
  joined: false,
  isAdmin: false, // true เมื่อ sign-in ด้วย email/password ที่อยู่ใน ADMIN_UIDS
  messageStreamStarted: false,
  unsubMessages: null,
  // own reactions: msgId → 'like' | 'love' | 'clap' (สำหรับ visual active state)
  myReactions: new Map(),
  // กัน double-click ส่ง request ซ้ำซ้อน (msgId ที่กำลัง pending)
  pendingReactions: new Set(),
};
