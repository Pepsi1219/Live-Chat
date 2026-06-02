// ─── Pin: admin ปักหมุดข้อความให้ลอยอยู่บนสุด ────────────────────
// คนทั่วไปเห็นว่าข้อความถูก pin แต่ปุ่มถูกซ่อนด้วย CSS (.is-admin gate)
// security จริง: firestore.rules อนุญาต update เฉพาะ admin
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { ROOM_ID } from './config.js';
import { state } from './state.js';
import { toast } from './ui.js';

export async function togglePin(msgId) {
  if (!state.isAdmin) {
    toast('สิทธิ์ admin เท่านั้น');
    return;
  }
  const msgRef = doc(db, `rooms/${ROOM_ID}/messages/${msgId}`);
  try {
    const snap = await getDoc(msgRef);
    if (!snap.exists()) {
      toast('ข้อความนี้ถูกลบแล้ว');
      return;
    }
    const currentlyPinned = snap.data().isPinned === true;
    await updateDoc(msgRef, {
      isPinned: !currentlyPinned,
      pinnedAt: currentlyPinned ? deleteField() : serverTimestamp(),
    });
    toast(currentlyPinned ? 'ยกเลิกปักหมุดแล้ว' : 'ปักหมุดแล้ว 📌');
  } catch (err) {
    console.error('pin failed', err);
    if (err?.code === 'permission-denied') {
      toast('ไม่มีสิทธิ์ปักหมุด');
    } else {
      toast('ปักหมุดไม่สำเร็จ');
    }
  }
}
