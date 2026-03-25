const CACHE_NAME = "live-comments-v3"; // อัปเดตเวอร์ชันเพื่อล้างแคชเก่า

const urlsToCache = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-152.png",
  "./screenshot-mobile.png", // เพิ่มไฟล์ภาพ Screenshot มือถือ
  "./screenshot-desktop.png" // เพิ่มไฟล์ภาพ Screenshot คอมพิวเตอร์
];

// 1. ขั้นตอน Install: เก็บไฟล์ลง Cache
self.addEventListener("install", event => {
  // บังคับให้ Service Worker ตัวใหม่ทำงานทันที ไม่ต้องรอปิดเบราว์เซอร์เก่า
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("Caching all assets...");
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. ขั้นตอน Activate: ลบ Cache เก่าทิ้ง
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log("Deleting old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. ขั้นตอน Fetch: ดึงข้อมูลจาก Cache ถ้าไม่มีค่อยไปดึงจากเน็ต
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // ถ้าเจอใน Cache ให้ส่งไฟล์จาก Cache (ช่วยให้เปิดแอปไวมาก)
      // ถ้าไม่เจอ ให้ไป fetch จากเน็ตตามปกติ
      return response || fetch(event.request);
    })
  );
});
