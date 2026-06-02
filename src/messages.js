// ─── Messages: stream (read), send ──────────────────────────────
// Reaction ย้ายไป RTDB แล้ว (src/reactions.js) — ไฟล์นี้ดูแลแค่ข้อความ
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limitToLast,
  writeBatch,
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
  updatePinState,
  messageEls,
} from './render.js';
import { scrollToBottom, toast, updateCharCount } from './ui.js';
import { tsToMillis } from './utils.js';
import { togglePin } from './pin.js';
import {
  toggleReaction,
  listenReactionCounts,
  unlistenReactionCounts,
  loadMyVotes,
} from './reactions.js';

function messagesCol() {
  return collection(db, `rooms/${ROOM_ID}/messages`);
}

// ─── Read: single onSnapshot ครอบทุก message ที่แสดงอยู่ ──────────
export function startMessageStream() {
  if (state.messageStreamStarted) return;
  state.messageStreamStarted = true;

  const col = messagesCol();
  let firstSnapshot = true;

  state.unsubMessages = onSnapshot(
    query(col, orderBy('createdAt', 'asc'), limitToLast(INITIAL_LIMIT)),
    (snap) => {
      const isInitial = firstSnapshot;
      firstSnapshot = false;

      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        const data = change.doc.data();
        if (change.type === 'added') {
          renderMessage(id, data, {
            onReact: toggleReaction,
            onPin: togglePin,
            scroll: !isInitial,
          });
          // ฟัง RTDB counter ของ msg นี้ (real-time sync ข้ามจอ)
          listenReactionCounts(id);
        } else if (change.type === 'modified') {
          // pin เปลี่ยน — sync ทุก user (reaction sync ผ่าน RTDB แล้ว)
          const el = messageEls.get(id);
          if (el) {
            updatePinState(
              el,
              data.isPinned === true,
              tsToMillis(data.pinnedAt)
            );
          }
        } else if (change.type === 'removed') {
          unlistenReactionCounts(id);
          removeMessage(id);
        }
      });

      if (isInitial) {
        scrollToBottom();
        // โหลด own votes จาก RTDB เพื่อ active state (10 msg ล่าสุด)
        const msgIds = snap.docs.slice(-10).map((d) => d.id);
        loadMyVotes(msgIds).then(() => {
          // trigger re-render active state หลังรู้ว่าตัวเองโหวตอะไร
          snap.docs.forEach((d) => {
            const card = messageEls.get(d.id);
            if (card) {
              const myType = state.myReactions.get(d.id);
              card.querySelectorAll('.reactions button').forEach((b) => {
                const t = b.dataset.type;
                const isActive = t === myType;
                b.classList.toggle('reacted', isActive);
                b.setAttribute(
                  'aria-pressed',
                  isActive ? 'true' : 'false'
                );
              });
            }
          });
        });
      }
    },
    (err) => console.error('stream error', err)
  );
}

// ─── Send (validate + best-effort slow mode) ────────────────────
// reactionCounts ไม่ต้องใส่ใน Firestore แล้ว — counter อยู่ RTDB
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
      createdAt: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + MSG_TTL_MS + 5 * 60_000),
    });
    batch.set(doc(db, `rooms/${ROOM_ID}/rateLimits/${state.uid}`), {
      nextAllowed: Timestamp.fromMillis(Date.now() + SLOW_MODE_MS),
    });
    await batch.commit();
  } catch (err) {
    console.error('send failed', err);
    commentInput.value = original;
    updateCharCount();
    toast(
      err?.code === 'permission-denied'
        ? 'ส่งถี่เกินไป รอสักครู่'
        : 'ส่งไม่สำเร็จ ลองใหม่'
    );
  }
}
