const CACHE_NAME = "live-comments-v5";

// precache เฉพาะ shell + ไฟล์ static ที่ชื่อคงที่
// (bundle ของ Vite มี hash → ใช้ runtime cache ใน fetch handler แทน)
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll ล้มทั้งชุดถ้าไฟล์ใดหาย → ใส่ทีละไฟล์แบบ best-effort แทน
      Promise.allSettled(urlsToCache.map(url => cache.add(url)))
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ข้าม Firebase / API ทั้งหมด — ต้อง real-time เสมอ ห้าม cache
  if (url.origin !== self.location.origin) return;

  // network-first สำหรับการเปิดหน้า (HTML) → สถานะเปิด/ปิดงานไม่ค้าง
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // cache-first สำหรับ static asset (เปิดแอปไว)
  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      })
    )
  );
});
