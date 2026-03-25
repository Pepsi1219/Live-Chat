const CACHE_NAME = "live-comments-v2"; // เปลี่ยนเวอร์ชันเพื่อบังคับอัปเดต

const urlsToCache = [
  "./",                // แทนที่ "/"
  "./index.html",      // แทนที่ "/index.html"
  "./style.css",
  "./app.js",
  "./manifest.json",   // ควร Cache ไฟล์นี้ด้วย
  "./icon-192.png",    // แนะนำให้ Cache ไอคอนไว้ด้วยเพื่อให้เปิด Offline ได้
  "./icon-512.png"
];

// install
self.addEventListener("install", event => {
  self.skipWaiting(); // บังคับให้ Service Worker ตัวใหม่ทำงานทันที
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // ใช้ addAll แบบระมัดระวัง ถ้าไฟล์ไหนหาไม่เจอ มันจะพังทั้งชุด
      return cache.addAll(urlsToCache);
    })
  );
});

// fetch
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
