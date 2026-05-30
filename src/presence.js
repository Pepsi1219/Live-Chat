// ─── Presence: Realtime DB + onDisconnect (H3 + M1 + M2) ────────
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

export function startPresence() {
  const myStatusRef = ref(rtdb, `status/${ROOM_ID}/${state.uid}`);

  onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(myStatusRef).remove(); // server ลบให้เมื่อหลุด (เชื่อถือได้บนมือถือ)
    rtdbSet(myStatusRef, {
      online: true,
      name: state.myName,
      lastSeen: rtdbNow(),
    });
  });

  // นับคนออนไลน์จาก RTDB (เลขเดียว ไม่ poll Firestore — เลี่ยง O(N²))
  onValue(ref(rtdb, `status/${ROOM_ID}`), (snap) => {
    let count = 0;
    snap.forEach((child) => {
      if (child.val()?.online) count++;
    });
    viewerEl.textContent = String(count);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      rtdbRemove(myStatusRef);
    } else {
      rtdbSet(myStatusRef, {
        online: true,
        name: state.myName,
        lastSeen: rtdbNow(),
      });
    }
  });
}
