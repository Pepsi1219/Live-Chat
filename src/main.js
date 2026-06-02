// ─── Boot & event wiring ────────────────────────────────────────
import { doc, getDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { ROOM_ID, ADMIN_UIDS } from './config.js';
import { state } from './state.js';
import {
  commentInput,
  sendBtn,
  viewerEl,
  selfInitial,
  modalOverlay,
  nameInput,
  joinBtn,
  clearBtn,
  themeToggleBtn,
} from './dom.js';
import { startMessageStream, sendComment } from './messages.js';
import { startPresence } from './presence.js';
import { adminClear } from './admin.js';
import { renderSystem } from './render.js';
import { toast, updateCharCount, initFeedScrollMonitor } from './ui.js';
import { avatarColor, initialOf } from './utils.js';
import { initMonitoring, captureError } from './monitoring.js';
import { toggleTheme } from './theme.js';

const STORAGE_NAME_KEY = 'lc-name';
const STORAGE_SESSION_KEY = 'lc-session';

// session ปัจจุบันของห้อง (จาก rooms/{ROOM_ID}.session)
// ใช้ผูกกับชื่อที่บันทึก — ถ้า organizer เปลี่ยน session = รีเซ็ตชื่อทุกเครื่อง
let currentSession = null;

// เข้าร่วมห้องและบันทึกชื่อลง localStorage
function joinLive() {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  if (!state.uid) {
    toast('กำลังเชื่อมต่อ… ลองอีกครั้ง');
    return;
  }

  state.myName = name.slice(0, 20);
  state.myColor = avatarColor(state.myName);
  state.joined = true;

  localStorage.setItem(STORAGE_NAME_KEY, state.myName);
  // ผูกชื่อกับ session ปัจจุบัน — ครั้งหน้าถ้า session เปลี่ยนจะถือว่าเป็นงานใหม่
  if (currentSession !== null) {
    localStorage.setItem(STORAGE_SESSION_KEY, currentSession);
  }

  selfInitial.textContent = initialOf(state.myName);
  selfInitial.parentElement.style.background = state.myColor;
  modalOverlay.classList.add('hidden');

  renderSystem(`คุณ (${state.myName}) เข้าร่วมแล้ว`);
  startPresence();
  commentInput.focus();
}

// เข้าร่วมอัตโนมัติจากชื่อที่บันทึกไว้ (refresh / กลับมาครั้งหลัง)
function autoRejoin(name) {
  state.myName = name.slice(0, 20);
  state.myColor = avatarColor(state.myName);
  state.joined = true;

  selfInitial.textContent = initialOf(state.myName);
  selfInitial.parentElement.style.background = state.myColor;
  modalOverlay.classList.add('hidden');

  startPresence();
  toast(`ยินดีต้อนรับกลับ ${state.myName} 👋`);
  commentInput.focus();
}

// อ่าน rooms/{ROOM_ID} ครั้งเดียว — ได้ทั้งสถานะเปิด/ปิด และ session
// session: ออปชัน — ถ้าไม่ตั้งไว้ (null) ฟีเจอร์ reset จะไม่ทำงาน (backward-compatible)
async function fetchRoomState() {
  try {
    const roomSnap = await getDoc(doc(db, 'rooms', ROOM_ID));
    if (roomSnap.exists()) {
      const data = roomSnap.data();
      return {
        open: data.status !== 'closed',
        session: data.session != null ? String(data.session) : null,
      };
    }
  } catch (err) {
    console.warn('room state check failed, defaulting to open', err);
  }
  // อ่านไม่ได้ (เน็ต/permission) → default เปิด + ไม่รีเซ็ตชื่อ (กันลบชื่อพลาด)
  return { open: true, session: null };
}

function wireEvents() {
  commentInput.addEventListener('input', updateCharCount);
  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendComment();
    }
  });
  sendBtn.addEventListener('click', sendComment);
  joinBtn.addEventListener('click', joinLive);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinLive();
  });
  if (clearBtn) clearBtn.addEventListener('click', adminClear);
  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
}

async function boot() {
  await initMonitoring();
  viewerEl.textContent = '0';
  wireEvents();
  initFeedScrollMonitor();

  const room = await fetchRoomState();
  if (!room.open) {
    window.location.href = 'closed.html';
    return;
  }
  currentSession = room.session;

  // ── Event-session reset ───────────────────────────────────────
  // ถ้าห้องตั้ง session ไว้ และไม่ตรงกับที่เครื่องนี้จำ → เป็นงานใหม่
  // → ล้างชื่อเก่า เพื่อให้ผู้ใช้ตั้งชื่อใหม่ (welcome modal เด้ง)
  if (currentSession !== null) {
    const savedSession = localStorage.getItem(STORAGE_SESSION_KEY);
    if (savedSession !== currentSession) {
      localStorage.removeItem(STORAGE_NAME_KEY);
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }

  // pre-fill ชื่อที่เคยใช้ (ช่วย UX ทั้ง auto-rejoin และการแก้ชื่อเอง)
  const savedName = localStorage.getItem(STORAGE_NAME_KEY);
  if (savedName) {
    nameInput.value = savedName;
  } else {
    nameInput.focus();
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.uid = user.uid;
      // admin = sign-in ด้วย email/pass + uid อยู่ใน allowlist
      state.isAdmin = !user.isAnonymous && ADMIN_UIDS.includes(user.uid);
      document.body.classList.toggle('is-admin', state.isAdmin);

      startMessageStream(); // public read เริ่มได้เมื่อมี auth

      // auto-rejoin ถ้ามีชื่อเก่าบันทึกไว้
      const saved = localStorage.getItem(STORAGE_NAME_KEY);
      if (saved && !state.joined) {
        autoRejoin(saved);
      }
    } else {
      state.isAdmin = false;
      document.body.classList.remove('is-admin');
    }
  });

  try {
    await signInAnonymously(auth);
  } catch (err) {
    captureError(err, { context: 'anonymous-sign-in' });
    toast('เชื่อมต่อไม่สำเร็จ');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      navigator.serviceWorker
        .register(swUrl)
        .catch((err) => console.warn('SW error', err));
    });
  }
}

boot();
