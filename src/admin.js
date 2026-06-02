// ─── Admin: ล้างคอมเมนต์ผ่าน Auth จริง (ไม่มีรหัสใน client, C2) ──
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { ROOM_ID } from './config.js';
import { toast } from './ui.js';

// ลบทุก doc ใน subcollection ของ message (reactions + reports)
async function deleteSubcollections(msgId) {
  const paths = ['reactions', 'reports'];
  await Promise.all(
    paths.map(async (sub) => {
      const snap = await getDocs(
        collection(db, `rooms/${ROOM_ID}/messages/${msgId}/${sub}`)
      );
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    })
  );
}

export async function adminClear() {
  if (!confirm('ล้างคอมเมนต์ทั้งหมด? (ต้องเป็น admin)')) return;
  try {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
      const email = prompt('Admin email:');
      const pass = prompt('Admin password:');
      if (!email || !pass) return;
      await signInWithEmailAndPassword(auth, email, pass);
    }
    const snap = await getDocs(collection(db, `rooms/${ROOM_ID}/messages`));
    // ลบ subcollections (reactions + reports) ก่อน แล้วค่อยลบ message doc
    await Promise.all(
      snap.docs.map(async (d) => {
        await deleteSubcollections(d.id);
        await deleteDoc(d.ref);
      })
    );
    toast('ล้างคอมเมนต์แล้ว ✅');
  } catch (err) {
    console.error('admin clear failed', err);
    toast('ล้างไม่สำเร็จ (ตรวจสอบสิทธิ์ admin)');
  }
}
