// ─── Moderation: report ข้อความ ────────────────────────────────
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { ROOM_ID } from './config.js';
import { state } from './state.js';
import { toast } from './ui.js';

// ผู้ใช้ report ได้คนละ 1 ครั้งต่อข้อความ (doc id = uid ป้องกัน spam)
// admin เห็น collection reports/ และตัดสินใจลบเองใน Firebase Console หรือ admin UI
export async function reportMessage(msgId) {
  if (!state.uid) return;
  try {
    await setDoc(
      doc(db, `rooms/${ROOM_ID}/messages/${msgId}/reports/${state.uid}`),
      {
        reportedAt: serverTimestamp(),
        reporterUid: state.uid,
      }
    );
    toast('รายงานแล้ว ✅ ทีมงานจะตรวจสอบ');
  } catch (err) {
    if (err?.code === 'permission-denied') {
      toast('คุณรายงานข้อความนี้ไปแล้ว');
    } else {
      console.error('report failed', err);
      toast('รายงานไม่สำเร็จ ลองใหม่');
    }
  }
}
