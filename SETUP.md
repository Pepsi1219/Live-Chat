# Live Comments — Setup & Deploy (Phase 0 + 1)

แอพแชท/คอมเมนต์สดแบบ real-time (PWA) บน Firebase — เวอร์ชันนี้ทำ **Phase 0 (security)**
และ **Phase 1 (re-architecture)** เสร็จแล้ว ไฟล์ฝั่ง client พร้อมใช้ แต่ต้องตั้งค่าใน
**Firebase Console** และ **deploy rules** ตามขั้นตอนด้านล่างก่อนเปิดใช้งานจริง

> ⚠️ **อย่าเพิ่งเปิดเว็บสาธารณะจนกว่าจะทำข้อ 1–4 เสร็จ** — ก่อนหน้านี้ Firestore เปิดโล่ง
> (ใครก็เขียน/ลบ DB ได้) ขั้นตอนเหล่านี้คือสิ่งที่ปิดช่องโหว่นั้น

---

## สิ่งที่โค้ดชุดนี้แก้ไปแล้ว (mapping กับความเสี่ยงเดิม)

| Risk | สถานะ | แก้ที่ |
|------|-------|--------|
| C1  DB เปิดโล่ง | ✅ | `firestore.rules` + `database.rules.json` |
| C2 รหัส admin ฝังใน client | ✅ | ลบรหัส → ใช้ Firebase Auth + uid allowlist |
| C3 ไม่มี auth/rate-limit | ✅ auth / ⚠️ rate-limit best-effort | Anonymous Auth + slow-mode (ดู residual) |
| H1 react อ่านทั้ง collection | ✅ | `react()` อ่าน 1 doc + `increment()` |
| H2 race / นับเพี้ยน | ✅ | atomic `increment()` ใน batch |
| H3 viewer O(N²) | ✅ | ย้าย presence ไป Realtime DB + onDisconnect |
| H4 โหลดคอมเมนต์ทั้งหมด | ✅ | `limit(50)` + live boundary |
| H5 DB โตไม่จำกัด | ✅ (ต้องเปิด TTL — ข้อ 5) | field `expireAt` + Firestore TTL policy |
| M1 setInterval ค้าง | ✅ | ใช้ RTDB presence แทน (ไม่มี interval) |
| M2 beforeunload ไม่ทำงานมือถือ | ✅ | onDisconnect + visibilitychange |
| M3 เวลา client | ✅ | `serverTimestamp()` (บังคับใน rules ด้วย) |
| M4 error/loading + ข้อความหาย | ✅ | toast + คืนค่า input เมื่อ fail |
| M5 XSS | ✅ | render ด้วย DOM API + `safeColor()` + ไม่มี inline onclick |
| M6 docId เป็น element id | ✅ | ใช้ `data-id` + `Map` |
| L1 README/LICENSE/gitignore | ◑ | เพิ่ม `.gitignore`, `SETUP.md` (LICENSE ยังไม่ใส่) |
| L2 config ใน repo | ◑ | คงไว้ก่อน (พึ่ง rules+App Check) — ย้าย .env ใน Phase 2 |
| L3 sw cache ไฟล์ที่ไม่มี | ✅ | ลบ icon-152 + allSettled + network-first HTML |
| L4 test/CI/linter | ⬜ | Phase 2–3 |
| L5 inline style/magic strings | ◑ | ย้าย logic เข้า config ใน app.js (modularize Phase 2) |

---

## ขั้นตอนตั้งค่า (ทำครั้งเดียว)

### 1. เปิด Anonymous Authentication
Firebase Console → **Authentication → Sign-in method** → เปิด **Anonymous**

### 2. สร้างบัญชี Admin + ใส่ UID ลง rules
1. Console → **Authentication → Users → Add user** (ใส่ email/password ของ admin)
2. คัดลอก **User UID** ของบัญชีนั้น
3. แก้ `firestore.rules` → ฟังก์ชัน `adminUids()` แทน `'REPLACE_WITH_ADMIN_UID'`
   ```
   function adminUids() {
     return ['<ADMIN_UID_ของคุณ>'];
   }
   ```

### 3. เปิด Realtime Database
Console → **Realtime Database → Create database** → เลือก region → เริ่มแบบ locked
(rules จะถูก deploy จาก `database.rules.json` ในข้อ 4)
ตรวจว่า `databaseURL` ใน `app.js` ตรงกับของจริง

### 4. Deploy rules + hosting
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,database,hosting
```

### 5. เปิด Firestore TTL (ลบข้อความเก่าอัตโนมัติ — แก้ H5)
Console → **Firestore → TTL** → Create policy
- Collection group: `messages`
- Timestamp field: `expireAt`

### 6. เปิด App Check (กัน bot ยิง API ตรง — เสริม C1/C3)
1. Console → **App Check** → ลงทะเบียน web app ด้วย **reCAPTCHA v3**
2. เพิ่มใน `app.js` (หลัง `initializeApp`):
   ```js
   import { initializeAppCheck, ReCaptchaV3Provider }
     from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
   initializeAppCheck(app, {
     provider: new ReCaptchaV3Provider('<RECAPTCHA_SITE_KEY>'),
     isTokenAutoRefreshEnabled: true
   });
   ```
3. เปิด **Enforcement** ของ Firestore + Realtime DB ใน Console

### 7. สร้าง room doc + ควบคุมการเปิด/ปิดงาน
สร้าง document `rooms/main`:
```json
{ "title": "Live", "status": "open" }
```
- ปิดงาน: เปลี่ยน `status` เป็น `"closed"` → ผู้ใช้ถูกพาไป `closed.html` อัตโนมัติ
  (ไม่ต้องแก้โค้ด/deploy ใหม่อีกต่อไป)

---

## ⚠️ Residual risks (ข้อจำกัดของ rules-only — ปิดสนิทต้องใช้ Cloud Functions)

1. **Rate-limit เป็น best-effort** — rules บังคับ batch ข้าม document แบบ atomic ไม่ได้
   client ที่ตั้งใจโกงอาจเลี่ยงได้ App Check ช่วยกัน bot ส่วนใหญ่ แต่การบังคับ slow-mode
   จริงจังต้องทำผ่าน callable Function
2. **กรองคำหยาบ/moderation** — ตอนนี้ทำได้แค่ฝั่ง client (bypass ได้) ควรย้ายไป Function
3. **Reaction counter** — rules จำกัด delta ได้แค่ 0..1 ต่อการเขียน แต่ผูก "สร้าง reaction doc"
   กับ "เพิ่ม counter" แบบ atomic ข้าม collection ไม่ได้ → Function จะทำให้แม่นยำ  100%

> แนะนำ: ถ้าปริมาณผู้ใช้โตขึ้นหรือเริ่มเจอ abuse ให้ยกระดับเป็น **Firebase Blaze + Cloud Functions**
> (Phase ถัดไป) เพื่อปิด residual ทั้ง 3 ข้อ

---

## ทดสอบ local
```bash
firebase emulators:start          # firestore + database + hosting + auth
# หรือเสิร์ฟ static ธรรมดา
npx serve .
```
