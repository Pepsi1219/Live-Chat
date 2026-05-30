// ─── Shared mutable state ───────────────────────────────────────
// ใช้ object เดียวร่วมกันทุก module (อ้างอิงเดียวกัน)
export const state = {
  uid: null,
  myName: '',
  myColor: '',
  joined: false,
  messageStreamStarted: false,
  unsubMessages: null,
};
