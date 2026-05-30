'use strict';

// ════════════════════════════════════════════════════════════════
//  Live Comments — app.js  (Phase 0 + 1)
//
//  • Auth        : Firebase Anonymous (ได้ uid จริงไว้ทำ react-uniqueness / rate-limit)
//  • Reads       : Firestore onSnapshot (limit 50) — ไม่โหลดทั้ง collection
//  • Reactions   : atomic increment + 1 react/คน/ข้อความ (ไม่อ่านทั้ง collection)
//  • Presence    : Realtime Database + onDisconnect (เชื่อถือได้บนมือถือ)
//  • Time        : serverTimestamp() (ไม่พึ่งนาฬิกา client)
//  • Admin       : Firebase Auth + uid allowlist ใน rules (ไม่มีรหัสฝังใน client)
//  • เปิด/ปิดงาน : อ่านจาก rooms/{ROOM_ID}.status (ไม่ hardcode redirect)
//  • Render      : DOM API ล้วน (กัน XSS) + ไม่ใช้ getElementById กับ docId
// ════════════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs,
  onSnapshot, query, orderBy, where, limit,
  writeBatch, increment, serverTimestamp, Timestamp, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getDatabase, ref, onValue, onDisconnect,
  set as rtdbSet, remove as rtdbRemove, serverTimestamp as rtdbNow
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// ─── Firebase init ──────────────────────────────────────────────
// NOTE (Phase 2): ย้ายค่านี้ไป .env ผ่าน Vite — ตอนนี้พึ่ง Security Rules + App Check คุมความปลอดภัย
const firebaseConfig = {
  apiKey: 'AIzaSyAkM-kBPSeuABLv_UeZnz2YLrn0pqbJw4M',
  authDomain: 'live-comments-60609.firebaseapp.com',
  databaseURL: 'https://live-comments-60609-default-rtdb.firebaseio.com',
  projectId: 'live-comments-60609',
  storageBucket: 'live-comments-60609.firebasestorage.app',
  messagingSenderId: '104358541443',
  appId: '1:104358541443:web:f49a3fb3a23bb3dbaf03b6'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// ─── Config ─────────────────────────────────────────────────────
const ROOM_ID       = 'main';
const MAX_LEN       = 200;
const INITIAL_LIMIT = 50;          // โหลดล่าสุดแค่ 50 ข้อความ (กันอ่านทั้ง collection)
const MAX_DOM       = 200;         // กันการ์ดล้น DOM
const SLOW_MODE_MS  = 3000;        // best-effort slow mode
const MSG_TTL_MS    = 24 * 60 * 60 * 1000;  // ข้อความหมดอายุใน 24 ชม. (ใช้กับ Firestore TTL)
const AVATAR_COLORS = [
  '#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF',
  '#FF8B94','#6C5CE7','#FD79A8','#55EFC4',
  '#FDCB6E','#74B9FF','#F8A5C2','#A29BFE',
  '#81ECEC','#FAB1A0','#B2BEFF','#00CEC9',
];

// ─── State ──────────────────────────────────────────────────────
let uid = null;
let myName = '';
let myColor = '';
let joined = false;
let messageStreamStarted = false;
let unsubMessages = null;
const messageEls = new Map();   // msgId -> card element (แทน getElementById)

// ─── DOM ────────────────────────────────────────────────────────
const feed         = document.getElementById('comment-feed');
const commentInput = document.getElementById('comment-input');
const sendBtn      = document.getElementById('send-btn');
const charCount    = document.getElementById('char-count');
const viewerEl     = document.getElementById('viewer-count');
const selfInitial  = document.getElementById('self-initial');
const modalOverlay = document.getElementById('modal-overlay');
const nameInput    = document.getElementById('name-input');
const joinBtn      = document.getElementById('join-btn');
const clearBtn     = document.getElementById('clear-btn');

// ─── Helpers ────────────────────────────────────────────────────
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initialOf(name) {
  return (name.trim().charAt(0) || '?').toUpperCase();
}

// รับเฉพาะสี hex 6 หลัก ป้องกัน CSS/attribute injection (M5)
function safeColor(c) {
  return (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c : '#74B9FF';
}

function tsToMillis(ts) {
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  return Date.now();   // serverTimestamp ที่ยัง pending
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// toast เบา ๆ แทน alert() ที่บล็อกทั้งหน้า
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function scrollToBottom() {
  requestAnimationFrame(() => feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }));
}

// ─── Render (DOM API ล้วน — ไม่มี innerHTML กับข้อมูลผู้ใช้) ──────
function buildCard({ id, name, text, color, createdMs, isSelf, reactions }) {
  const card = document.createElement('div');
  card.className = 'comment-card' + (isSelf ? ' is-self' : '');
  card.dataset.id = id;
  card.dataset.ts = String(createdMs);

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.background = safeColor(color);
  avatar.textContent = initialOf(name);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const nameEl = document.createElement('div');
  nameEl.className = 'bubble-name';
  nameEl.textContent = name;

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';
  textEl.textContent = text;

  const timeEl = document.createElement('div');
  timeEl.className = 'bubble-time';
  timeEl.textContent = formatTime(createdMs);

  const reactionsEl = document.createElement('div');
  reactionsEl.className = 'reactions';
  reactionsEl.appendChild(reactionBtn(id, 'like', '👍', reactions.like));
  reactionsEl.appendChild(reactionBtn(id, 'love', '❤️', reactions.love));
  reactionsEl.appendChild(reactionBtn(id, 'clap', '👏', reactions.clap));

  bubble.append(nameEl, textEl, timeEl, reactionsEl);
  card.append(avatar, bubble);
  return card;
}

function reactionBtn(id, type, emoji, count) {
  const b = document.createElement('button');
  b.dataset.type = type;
  b.textContent = `${emoji} ${count || 0}`;
  b.addEventListener('click', () => react(id, type));   // ไม่ใช้ inline onclick (กัน XSS)
  return b;
}

function updateReactions(card, reactions) {
  card.querySelectorAll('.reactions button').forEach(b => {
    const type = b.dataset.type;
    const emoji = { like: '👍', love: '❤️', clap: '👏' }[type];
    b.textContent = `${emoji} ${reactions?.[type] || 0}`;
  });
}

// แทรกการ์ดตามลำดับเวลา (รองรับทั้ง batch แรกที่มาแบบ desc และข้อความใหม่)
function insertByTime(card) {
  const ms = Number(card.dataset.ts);
  const cards = feed.querySelectorAll('.comment-card');
  for (const existing of cards) {
    if (Number(existing.dataset.ts) > ms) {
      feed.insertBefore(card, existing);
      return;
    }
  }
  feed.insertBefore(card, feed.lastElementChild);   // ก่อน spacer ล่างสุด
}

function renderMessage(id, data, { scroll = false } = {}) {
  if (messageEls.has(id)) return;
  const createdMs = tsToMillis(data.createdAt);
  const card = buildCard({
    id,
    name: data.name || '?',
    text: data.text || '',
    color: data.color,
    createdMs,
    isSelf: data.uid === uid,
    reactions: data.reactionCounts || {}
  });
  messageEls.set(id, card);
  insertByTime(card);

  // กันการ์ดล้น DOM
  if (messageEls.size > MAX_DOM) {
    const oldest = feed.querySelector('.comment-card');
    if (oldest) { messageEls.delete(oldest.dataset.id); oldest.remove(); }
  }
  if (scroll) scrollToBottom();
}

function removeMessage(id) {
  const el = messageEls.get(id);
  if (el) { el.remove(); messageEls.delete(id); }
}

function renderSystem(text) {
  const el = document.createElement('div');
  el.className = 'system-msg';
  el.textContent = text;
  feed.insertBefore(el, feed.lastElementChild);
}

// ─── Messages: read (pagination + live) ─────────────────────────
async function startMessageStream() {
  if (messageStreamStarted) return;
  messageStreamStarted = true;

  const col = collection(db, `rooms/${ROOM_ID}/messages`);

  // 1) โหลดล่าสุด INITIAL_LIMIT ข้อความ (ไม่ใช่ทั้ง collection)
  let boundary = Timestamp.now();
  try {
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc'), limit(INITIAL_LIMIT)));
    const docsAsc = snap.docs.reverse();
    docsAsc.forEach(d => renderMessage(d.id, d.data()));
    if (docsAsc.length) {
      const newest = docsAsc[docsAsc.length - 1].data().createdAt;
      if (newest) boundary = newest;
    }
    scrollToBottom();
  } catch (err) {
    console.error('initial load failed', err);
  }

  // 2) ฟังเฉพาะข้อความใหม่หลัง boundary (รวม modified/removed ของช่วงนั้น)
  unsubMessages = onSnapshot(
    query(col, where('createdAt', '>', boundary), orderBy('createdAt', 'asc')),
    (snap) => {
      snap.docChanges().forEach(change => {
        const id = change.doc.id;
        const data = change.doc.data();
        if (change.type === 'added')    renderMessage(id, data, { scroll: true });
        if (change.type === 'modified') {
          const el = messageEls.get(id);
          if (el) updateReactions(el, data.reactionCounts);
        }
        if (change.type === 'removed')  removeMessage(id);
      });
    },
    (err) => console.error('stream error', err)
  );
}

// ─── Messages: send (validate + best-effort slow mode) ──────────
async function sendComment() {
  if (!joined || !uid) return;
  const text = commentInput.value.trim();
  if (!text) return;
  if (text.length > MAX_LEN) { toast('ข้อความยาวเกินไป'); return; }

  const original = commentInput.value;
  commentInput.value = '';
  updateCharCount();

  try {
    const batch = writeBatch(db);
    const msgRef = doc(collection(db, `rooms/${ROOM_ID}/messages`));
    batch.set(msgRef, {
      uid,
      name: myName,
      color: myColor,
      text,
      status: 'visible',
      createdAt: serverTimestamp(),                       // เวลา server (M3)
      reactionCounts: { like: 0, love: 0, clap: 0 },
      expireAt: Timestamp.fromMillis(Date.now() + MSG_TTL_MS)  // TTL (H5)
    });
    // best-effort slow mode
    batch.set(doc(db, `rooms/${ROOM_ID}/rateLimits/${uid}`), {
      nextAllowed: Timestamp.fromMillis(Date.now() + SLOW_MODE_MS)
    });
    await batch.commit();
  } catch (err) {
    console.error('send failed', err);
    commentInput.value = original;   // ไม่ทำข้อความผู้ใช้หาย (M4)
    updateCharCount();
    toast(err?.code === 'permission-denied' ? 'ส่งถี่เกินไป รอสักครู่' : 'ส่งไม่สำเร็จ ลองใหม่');
  }
}

// ─── Reactions: atomic, 1 ครั้ง/คน/ข้อความ (แก้ H1 + H2) ─────────
async function react(msgId, type) {
  if (!uid) return;
  const reactionRef = doc(db, `rooms/${ROOM_ID}/messages/${msgId}/reactions/${uid}`);
  try {
    const existing = await getDoc(reactionRef);   // อ่าน 1 doc (ไม่ใช่ทั้ง collection)
    if (existing.exists()) { toast('คุณโหวตข้อความนี้แล้ว'); return; }

    const batch = writeBatch(db);
    batch.set(reactionRef, { type, createdAt: serverTimestamp() });
    batch.update(doc(db, `rooms/${ROOM_ID}/messages/${msgId}`), {
      [`reactionCounts.${type}`]: increment(1)     // atomic
    });
    await batch.commit();
    floatEmoji(type);
  } catch (err) {
    console.error('react failed', err);
  }
}

function floatEmoji(type) {
  const emoji = { like: '👍', love: '❤️', clap: '👏' }[type] || '✨';
  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.textContent = emoji;
  el.style.left = Math.random() * window.innerWidth + 'px';
  el.style.bottom = '80px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ─── Presence: Realtime DB + onDisconnect (แก้ H3 + M1 + M2) ─────
function startPresence() {
  const myStatusRef = ref(rtdb, `status/${ROOM_ID}/${uid}`);

  onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(myStatusRef).remove();   // server ลบให้เองเมื่อหลุด (เชื่อถือได้บนมือถือ)
    rtdbSet(myStatusRef, { online: true, name: myName, lastSeen: rtdbNow() });
  });

  // นับคนออนไลน์จาก RTDB (เลขเดียว ไม่ poll Firestore — เลี่ยง O(N²))
  onValue(ref(rtdb, `status/${ROOM_ID}`), (snap) => {
    let count = 0;
    snap.forEach(child => { if (child.val()?.online) count++; });
    viewerEl.textContent = count;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') rtdbRemove(myStatusRef);
    else rtdbSet(myStatusRef, { online: true, name: myName, lastSeen: rtdbNow() });
  });
}

// ─── Join ───────────────────────────────────────────────────────
function joinLive() {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  if (!uid)  { toast('กำลังเชื่อมต่อ… ลองอีกครั้ง'); return; }

  myName = name.slice(0, 20);
  myColor = avatarColor(myName);
  joined = true;

  selfInitial.textContent = initialOf(myName);
  selfInitial.parentElement.style.background = myColor;
  modalOverlay.classList.add('hidden');

  renderSystem(`คุณ (${myName}) เข้าร่วมแล้ว`);
  startPresence();
  commentInput.focus();
}

// ─── Admin: ล้างคอมเมนต์ (ผ่าน Auth จริง — ไม่มีรหัสใน client, แก้ C2) ──
async function adminClear() {
  if (!confirm('ล้างคอมเมนต์ทั้งหมด? (ต้องเป็น admin)')) return;
  try {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
      const email = prompt('Admin email:');
      const pass  = prompt('Admin password:');
      if (!email || !pass) return;
      await signInWithEmailAndPassword(auth, email, pass);
    }
    const snap = await getDocs(collection(db, `rooms/${ROOM_ID}/messages`));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    toast('ล้างคอมเมนต์แล้ว ✅');
  } catch (err) {
    console.error('admin clear failed', err);
    toast('ล้างไม่สำเร็จ (ตรวจสอบสิทธิ์ admin)');
  }
}

// ─── Input UI ───────────────────────────────────────────────────
function updateCharCount() {
  const remaining = MAX_LEN - commentInput.value.length;
  charCount.textContent = remaining;
  charCount.className = 'char-count' + (remaining <= 0 ? ' error' : remaining <= 30 ? ' warn' : '');
}

commentInput.addEventListener('input', updateCharCount);
commentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
});
sendBtn.addEventListener('click', sendComment);
joinBtn.addEventListener('click', joinLive);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinLive(); });
if (clearBtn) clearBtn.addEventListener('click', adminClear);

// ─── Boot ───────────────────────────────────────────────────────
async function gateByRoomStatus() {
  // เปิด/ปิดงานจากข้อมูลใน DB (แทนการ hardcode redirect)
  try {
    const roomSnap = await getDoc(doc(db, 'rooms', ROOM_ID));
    if (roomSnap.exists() && roomSnap.data().status === 'closed') {
      window.location.href = 'closed.html';
      return false;
    }
  } catch (err) {
    console.warn('room status check failed, defaulting to open', err);
  }
  return true;
}

async function boot() {
  viewerEl.textContent = '0';
  const open = await gateByRoomStatus();
  if (!open) return;

  nameInput.focus();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      uid = user.uid;
      startMessageStream();   // อ่านได้ทันที (public read) เมื่อมี auth
    }
  });

  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.error('anonymous sign-in failed', err);
    toast('เชื่อมต่อไม่สำเร็จ');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW error', err));
    });
  }
}

boot();
