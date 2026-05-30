# Live Comments

แอพแชท/คอมเมนต์สดแบบ real-time (PWA) — Firebase + Vite + Vanilla JS

ระบบความคิดเห็นสดสำหรับงานอีเวนต์/ไลฟ์/Q&A: ผู้ชมเข้าร่วมด้วยชื่อ ส่งคอมเมนต์
react (👍 ❤️ 👏) และเห็นจำนวนผู้ชมออนไลน์แบบเรียลไทม์ ติดตั้งเป็นแอปได้ (PWA)

## Stack
- **Frontend:** Vanilla JS (ES modules) + Vite
- **Backend:** Firebase — Firestore (ข้อความ), Realtime DB (presence), Auth (anonymous + admin)
- **Security:** Firestore/RTDB Security Rules + App Check + CSP

## เริ่มต้น
```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
```

## คำสั่งหลัก
| คำสั่ง | หน้าที่ |
|--------|---------|
| `npm run dev`     | dev server |
| `npm run build`   | production build → `dist/` |
| `npm run lint`    | ESLint |
| `npm run format`  | Prettier |
| `npm test`        | unit tests (Vitest) |
| `npm run test:e2e`| e2e (Playwright) |

## Deploy & การตั้งค่า
ดู **[SETUP.md](./SETUP.md)** — มีขั้นตอน Firebase Console (Auth, RTDB, TTL, App Check),
การ deploy rules + hosting, ตารางความเสี่ยงที่แก้ไปแล้ว และ residual risks

> ⚠️ ต้อง deploy Security Rules และตั้งค่า Console ตาม SETUP.md ก่อนเปิดใช้งานจริง
