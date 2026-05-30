// ─── Messages: stream (read), send, react ───────────────────────
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  writeBatch,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';
import {
  ROOM_ID,
  MAX_LEN,
  INITIAL_LIMIT,
  SLOW_MODE_MS,
  MSG_TTL_MS,
} from './config.js';
import { state } from './state.js';
import { commentInput } from './dom.js';
import {
  renderMessage,
  removeMessage,
  updateReactions,
  messageEls,
} from './render.js';
import { scrollToBottom, toast, updateCharCount } from './ui.js';
import { REACTION_EMOJI } from './utils.js';

function messagesCol() {
  return collection(db, `rooms/${ROOM_ID}/messages`);
}

// ─── Reactions: atomic, 1 ครั้ง/คน/ข้อความ (H1 + H2) ────────────
export async function react(msgId, type) {
  if (!state.uid) return;
  const reactionRef = doc(
    db,
    `rooms/${ROOM_ID}/messages/${msgId}/reactions/${state.uid}`
  );
  try {
    const existing = await getDoc(reactionRef); // อ่าน 1 doc (ไม่ใช่ทั้ง collection)
    if (existing.exists()) {
      toast('คุณโหวตข้อความนี้แล้ว');
      return;
    }
    const batch = writeBatch(db);
    batch.set(reactionRef, { type, createdAt: serverTimestamp() });
    batch.update(doc(db, `rooms/${ROOM_ID}/messages/${msgId}`), {
      [`reactionCounts.${type}`]: increment(1), // atomic
    });
    await batch.commit();
    floatEmoji(type);
  } catch (err) {
    console.error('react failed', err);
  }
}

function floatEmoji(type) {
  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.textContent = REACTION_EMOJI[type] || '✨';
  el.style.left = Math.random() * window.innerWidth + 'px';
  el.style.bottom = '80px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ─── Read: pagination + live boundary (H4) ──────────────────────
export async function startMessageStream() {
  if (state.messageStreamStarted) return;
  state.messageStreamStarted = true;

  const col = messagesCol();
  let boundary = Timestamp.now();

  try {
    const snap = await getDocs(
      query(col, orderBy('createdAt', 'desc'), limit(INITIAL_LIMIT))
    );
    const docsAsc = snap.docs.reverse();
    docsAsc.forEach((d) => renderMessage(d.id, d.data(), { onReact: react }));
    if (docsAsc.length) {
      const newest = docsAsc[docsAsc.length - 1].data().createdAt;
      if (newest) boundary = newest;
    }
    scrollToBottom();
  } catch (err) {
    console.error('initial load failed', err);
  }

  state.unsubMessages = onSnapshot(
    query(col, where('createdAt', '>', boundary), orderBy('createdAt', 'asc')),
    (snap) => {
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        const data = change.doc.data();
        if (change.type === 'added') {
          renderMessage(id, data, { onReact: react, scroll: true });
        } else if (change.type === 'modified') {
          const el = messageEls.get(id);
          if (el) updateReactions(el, data.reactionCounts);
        } else if (change.type === 'removed') {
          removeMessage(id);
        }
      });
    },
    (err) => console.error('stream error', err)
  );
}

// ─── Send (validate + best-effort slow mode) ────────────────────
export async function sendComment() {
  if (!state.joined || !state.uid) return;
  const text = commentInput.value.trim();
  if (!text) return;
  if (text.length > MAX_LEN) {
    toast('ข้อความยาวเกินไป');
    return;
  }

  const original = commentInput.value;
  commentInput.value = '';
  updateCharCount();

  try {
    const batch = writeBatch(db);
    const msgRef = doc(messagesCol());
    batch.set(msgRef, {
      uid: state.uid,
      name: state.myName,
      color: state.myColor,
      text,
      status: 'visible',
      createdAt: serverTimestamp(), // เวลา server (M3)
      reactionCounts: { like: 0, love: 0, clap: 0 },
      expireAt: Timestamp.fromMillis(Date.now() + MSG_TTL_MS), // TTL (H5)
    });
    batch.set(doc(db, `rooms/${ROOM_ID}/rateLimits/${state.uid}`), {
      nextAllowed: Timestamp.fromMillis(Date.now() + SLOW_MODE_MS),
    });
    await batch.commit();
  } catch (err) {
    console.error('send failed', err);
    commentInput.value = original; // ไม่ทำข้อความผู้ใช้หาย (M4)
    updateCharCount();
    toast(
      err?.code === 'permission-denied'
        ? 'ส่งถี่เกินไป รอสักครู่'
        : 'ส่งไม่สำเร็จ ลองใหม่'
    );
  }
}
