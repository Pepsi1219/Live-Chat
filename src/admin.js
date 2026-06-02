// ─── Admin: 2-step flow — กดครั้งแรก = sign-in, ครั้งที่ 2 = ล้าง ──
// (ไม่มีรหัสฝังใน client, C2) — security จริงคือ firestore.rules + RTDB rules
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, remove as rtdbRemove } from 'firebase/database';
import { auth, db, rtdb } from './firebase.js';
import { ROOM_ID } from './config.js';
import { state } from './state.js';
import { toast } from './ui.js';

// ลบ reports subcollection ใน Firestore (legacy reactions ลบด้วยถ้ายังมีเหลือ)
async function deleteFirestoreSubcollections(msgId) {
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
  // Step 1: ยังไม่ login admin → sign in อย่างเดียว (ไม่ลบ)
  if (!state.isAdmin) {
    const email = prompt('Admin email:');
    const pass = prompt('Admin password:');
    if (!email || !pass) return;
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      toast('Login admin สำเร็จ ✅ ปุ่มปักหมุดใช้ได้แล้ว');
    } catch (err) {
      console.error('admin login failed', err);
      toast('Login ไม่สำเร็จ');
    }
    return;
  }

  // Step 2: เป็น admin แล้ว → confirm + ล้าง
  if (!confirm('ล้างคอมเมนต์ทั้งหมด?')) return;
  try {
    const snap = await getDocs(collection(db, `rooms/${ROOM_ID}/messages`));
    await Promise.all(
      snap.docs.map(async (d) => {
        // ลบ Firestore subcollections (reports + legacy reactions)
        await deleteFirestoreSubcollections(d.id);
        // ลบ RTDB reactions (votes + counts) ของข้อความนี้
        await rtdbRemove(ref(rtdb, `reactions/${ROOM_ID}/${d.id}`));
        // ลบ message doc
        await deleteDoc(d.ref);
      })
    );
    toast('ล้างคอมเมนต์แล้ว ✅');
  } catch (err) {
    console.error('admin clear failed', err);
    toast('ล้างไม่สำเร็จ');
  }
}
