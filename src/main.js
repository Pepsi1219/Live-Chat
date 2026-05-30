// ─── Boot & event wiring ────────────────────────────────────────
import { doc, getDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { ROOM_ID } from './config.js';
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
} from './dom.js';
import { startMessageStream, sendComment } from './messages.js';
import { startPresence } from './presence.js';
import { adminClear } from './admin.js';
import { renderSystem } from './render.js';
import { toast, updateCharCount } from './ui.js';
import { avatarColor, initialOf } from './utils.js';

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

  selfInitial.textContent = initialOf(state.myName);
  selfInitial.parentElement.style.background = state.myColor;
  modalOverlay.classList.add('hidden');

  renderSystem(`คุณ (${state.myName}) เข้าร่วมแล้ว`);
  startPresence();
  commentInput.focus();
}

// เปิด/ปิดงานจาก rooms/{ROOM_ID}.status (แทน hardcode redirect)
async function gateByRoomStatus() {
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
}

async function boot() {
  viewerEl.textContent = '0';
  wireEvents();

  const open = await gateByRoomStatus();
  if (!open) return;

  nameInput.focus();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.uid = user.uid;
      startMessageStream(); // public read เริ่มได้เมื่อมี auth
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
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      navigator.serviceWorker
        .register(swUrl)
        .catch((err) => console.warn('SW error', err));
    });
  }
}

boot();
