// ─── Reactions: RTDB-based (ลด Firestore reads 98%) ─────────────
// votes + counters อยู่ใน RTDB ทั้งหมด — Firestore ไม่ถูกแตะเลย
// RTDB คิด cost เป็น data transfer ไม่ใช่ read/write count
// → 50 คน react ทุก msg ก็อยู่ใน Spark free tier สบาย
import {
  ref,
  get,
  set,
  remove,
  onValue,
  runTransaction,
  off,
} from 'firebase/database';
import { rtdb } from './firebase.js';
import { ROOM_ID } from './config.js';
import { state } from './state.js';
import { applyOptimisticReaction, updateReactions, messageEls } from './render.js';
import { toast } from './ui.js';
import { REACTION_EMOJI, tsToMillis } from './utils.js';

// ─── Paths ──────────────────────────────────────────────────────
function votePath(msgId, uid) {
  return `reactions/${ROOM_ID}/${msgId}/votes/${uid}`;
}
function countsPath(msgId) {
  return `reactions/${ROOM_ID}/${msgId}/counts`;
}

// ─── Toggle reaction (optimistic + RTDB transaction) ────────────
// กดซ้ำ = ถอน, กดอื่น = สลับ, ใหม่ = สร้าง
export async function toggleReaction(msgId, type) {
  if (!state.uid) return;
  if (state.pendingReactions.has(msgId)) return;

  const prevType = state.myReactions.get(msgId) || null;
  const newType = prevType === type ? null : type;

  // 1) Optimistic UI ทันที
  applyOptimisticReaction(msgId, prevType, newType);
  if (newType) floatEmoji(newType);

  state.pendingReactions.add(msgId);

  const voteRef = ref(rtdb, votePath(msgId, state.uid));

  try {
    // 2) เขียน vote (set / remove)
    if (newType) {
      await set(voteRef, newType);
    } else {
      await remove(voteRef);
    }

    // 3) อัปเดต counter ด้วย transaction (atomic)
    if (prevType) {
      // ลด counter เก่า
      await runTransaction(ref(rtdb, `${countsPath(msgId)}/${prevType}`), (cur) =>
        Math.max(0, (cur || 0) - 1)
      );
    }
    if (newType) {
      // เพิ่ม counter ใหม่
      await runTransaction(ref(rtdb, `${countsPath(msgId)}/${newType}`), (cur) =>
        (cur || 0) + 1
      );
    }
  } catch (err) {
    // 4) Rollback
    applyOptimisticReaction(msgId, newType, prevType);
    console.error('reaction failed', err);
    toast('โหวตไม่สำเร็จ ลองใหม่');
  } finally {
    state.pendingReactions.delete(msgId);
  }
}

// ─── Listen to counters (real-time sync ข้ามจอ) ─────────────────
// เรียกต่อ 1 message — เมื่อ counter เปลี่ยน sync ลง DOM ทันที
const _listeners = new Map(); // msgId → unsubscribe fn

export function listenReactionCounts(msgId) {
  if (_listeners.has(msgId)) return; // มี listener แล้ว
  const countsRef = ref(rtdb, countsPath(msgId));
  const cb = onValue(countsRef, (snap) => {
    const counts = snap.val() || {};
    const card = messageEls.get(msgId);
    if (card) {
      updateReactions(card, {
        like: counts.like || 0,
        love: counts.love || 0,
        clap: counts.clap || 0,
      });
    }
  });
  _listeners.set(msgId, () => off(countsRef, 'value', cb));
}

// Cleanup listener เมื่อ message ถูกลบ
export function unlistenReactionCounts(msgId) {
  const unsub = _listeners.get(msgId);
  if (unsub) {
    unsub();
    _listeners.delete(msgId);
  }
}

// ─── Load own vote (เพื่อ active state ตอน initial load) ─────────
export async function loadMyVotes(msgIds) {
  if (!state.uid || !msgIds.length) return;
  try {
    const snaps = await Promise.all(
      msgIds.map((id) => get(ref(rtdb, votePath(id, state.uid))))
    );
    snaps.forEach((snap, i) => {
      if (snap.exists()) state.myReactions.set(msgIds[i], snap.val());
    });
  } catch (err) {
    console.warn('load own votes failed', err);
  }
}

// ─── Float emoji (ย้ายมาจาก messages.js) ────────────────────────
function floatEmoji(type) {
  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.textContent = REACTION_EMOJI[type] || '✨';
  el.style.left = Math.random() * window.innerWidth + 'px';
  el.style.bottom = '80px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
