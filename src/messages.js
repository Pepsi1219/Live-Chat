// ─── Messages: stream (read), send, react ───────────────────────
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limitToLast,
  writeBatch,
  runTransaction,
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
  applyOptimisticReaction,
  messageEls,
} from './render.js';
import { scrollToBottom, toast, updateCharCount } from './ui.js';
import { REACTION_EMOJI } from './utils.js';
import { reportMessage } from './moderation.js';

function messagesCol() {
  return collection(db, `rooms/${ROOM_ID}/messages`);
}

// ─── Reactions: toggle + atomic + optimistic ─────────────────────
// กดซ้ำ type เดิม = ถอน, กด type อื่น = สลับ, ใหม่ = สร้าง
// runTransaction กัน race, pendingReactions กัน double-click,
// optimistic UI ตอบสนองทันที + rollback ถ้า fail
export async function react(msgId, type) {
  if (!state.uid) return;
  if (state.pendingReactions.has(msgId)) return;

  const prevType = state.myReactions.get(msgId) || null;
  // toggle off ถ้ากด type เดิม, else สลับ/สร้าง
  const newType = prevType === type ? null : type;

  // 1) Optimistic update DOM + state ทันที (สลับ active, ปรับ count)
  applyOptimisticReaction(msgId, prevType, newType);
  if (newType) floatEmoji(newType);

  state.pendingReactions.add(msgId);

  const reactionRef = doc(
    db,
    `rooms/${ROOM_ID}/messages/${msgId}/reactions/${state.uid}`
  );
  const msgRef = doc(db, `rooms/${ROOM_ID}/messages/${msgId}`);

  try {
    // 2) Transaction — read + write atomic (กัน race ระหว่าง 2 tabs/click ซ้อน)
    await runTransaction(db, async (tx) => {
      const reactSnap = await tx.get(reactionRef);
      const msgSnap = await tx.get(msgRef);
      if (!msgSnap.exists()) throw new Error('message-gone');

      const serverType = reactSnap.exists() ? reactSnap.data().type : null;
      if (serverType === newType) return; // no-op (server ตรงกับที่ user คาด)

      if (serverType === null) {
        tx.set(reactionRef, { type: newType, createdAt: serverTimestamp() });
        tx.update(msgRef, { [`reactionCounts.${newType}`]: increment(1) });
      } else if (newType === null) {
        tx.delete(reactionRef);
        tx.update(msgRef, {
          [`reactionCounts.${serverType}`]: increment(-1),
        });
      } else {
        tx.set(reactionRef, { type: newType, createdAt: serverTimestamp() });
        tx.update(msgRef, {
          [`reactionCounts.${serverType}`]: increment(-1),
          [`reactionCounts.${newType}`]: increment(1),
        });
      }
    });
  } catch (err) {
    // 3) Rollback optimistic ถ้าพัง
    applyOptimisticReaction(msgId, newType, prevType);
    if (err.message === 'message-gone') {
      toast('ข้อความนี้ถูกลบแล้ว');
    } else if (err?.code === 'permission-denied') {
      toast('ไม่มีสิทธิ์โหวต');
    } else {
      toast('โหวตไม่สำเร็จ ลองใหม่');
    }
    console.error('react failed', err);
  } finally {
    state.pendingReactions.delete(msgId);
  }
}

// โหลด own reactions ของ msg ที่กำลังแสดง — ให้ UI รู้ว่าตัวเองเคย vote อะไร
async function loadOwnReactions(msgIds) {
  if (!state.uid || !msgIds.length) return;
  try {
    const snaps = await Promise.all(
      msgIds.map((id) =>
        getDoc(
          doc(db, `rooms/${ROOM_ID}/messages/${id}/reactions/${state.uid}`)
        )
      )
    );
    snaps.forEach((snap, i) => {
      if (snap.exists()) state.myReactions.set(msgIds[i], snap.data().type);
    });
  } catch (err) {
    console.warn('load own reactions failed', err);
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

// ─── Read: single onSnapshot ครอบทุก message ที่แสดงอยู่ ──────────
// ใช้ limitToLast แทน getDocs+boundary เพื่อให้ modified (reaction)
// บน message เก่า sync ได้ด้วย ไม่แค่ message ใหม่
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
          // initial batch ไม่ scroll ทีละใบ — รอ scrollToBottom() ท้าย
          renderMessage(id, data, {
            onReact: react,
            onReport: reportMessage,
            scroll: !isInitial,
          });
        } else if (change.type === 'modified') {
          // reaction/status เปลี่ยน — sync ทุก user ที่เปิดอยู่
          const el = messageEls.get(id);
          if (el) updateReactions(el, data.reactionCounts);
        } else if (change.type === 'removed') {
          removeMessage(id);
        }
      });

      if (isInitial) {
        scrollToBottom();
        // โหลด own reactions เฉพาะ 10 ข้อความล่าสุด (ประหยัด reads)
        const msgIds = snap.docs.slice(-10).map((d) => d.id);
        loadOwnReactions(msgIds).then(() => {
          snap.docs.forEach((d) => {
            const card = messageEls.get(d.id);
            if (card) updateReactions(card, d.data().reactionCounts || {});
          });
        });
      }
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
      // TTL: client clock + 5 min buffer กัน drift เล็กน้อย
      // server validate ว่า expireAt อยู่ใน (now, now+2d) ใน rules
      expireAt: Timestamp.fromMillis(Date.now() + MSG_TTL_MS + 5 * 60_000),
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
