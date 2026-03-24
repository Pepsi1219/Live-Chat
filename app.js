/* ================================================================
   Live Comments — app.js
   Real-time via BroadcastChannel (same device, multiple tabs).
   No simulation. Only real users typing comments.
================================================================ */

'use strict';

// ─── Config ───────────────────────────────────────────────────
const CONFIG = {
  channelName:     'live-comments-v1',
  maxComments:     200,
  autoScrollDelay: 80,
  avatarColors: [
    '#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF',
    '#FF8B94','#6C5CE7','#FD79A8','#55EFC4',
    '#FDCB6E','#74B9FF','#F8A5C2','#A29BFE',
    '#81ECEC','#FAB1A0','#B2BEFF','#00CEC9',
  ],
};

// ─── State ────────────────────────────────────────────────────
let myName     = '';
let myColor    = '';
let isScrolled = false;
let viewerCount = 1;

// ─── DOM ──────────────────────────────────────────────────────
const feed          = document.getElementById('comment-feed');
const commentInput  = document.getElementById('comment-input');
const sendBtn       = document.getElementById('send-btn');
const charCount     = document.getElementById('char-count');
const viewerEl      = document.getElementById('viewer-count');
const selfInitialEl = document.getElementById('self-initial');
const modalOverlay  = document.getElementById('modal-overlay');
const nameInput     = document.getElementById('name-input');
const joinBtn       = document.getElementById('join-btn');

// ─── Helpers ──────────────────────────────────────────────────
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return CONFIG.avatarColors[Math.abs(h) % CONFIG.avatarColors.length];
}

function getInitial(name) { return name.trim().charAt(0).toUpperCase() || '?'; }

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scrollToBottom(force = false) {
  if (!isScrolled || force) {
    requestAnimationFrame(() => {
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    });
  }
}

// ─── Render Comment ───────────────────────────────────────────
function renderComment({ name, text, isSelf = false, color, time }) {
  const card = document.createElement('div');
  card.className = 'comment-card' + (isSelf ? ' is-self' : '');

  const avatarColor = color || getAvatarColor(name);
  const initial     = getInitial(name);
  const timeStr     = formatTime(time || Date.now());

  card.innerHTML = `
    <div class="avatar" style="background:${avatarColor};">${initial}</div>
    <div class="bubble">
      <div class="bubble-name">${escapeHtml(name)}</div>
      <div class="bubble-text">${escapeHtml(text)}</div>
      <div class="bubble-time">${timeStr}</div>
    </div>
  `;

  // Trim old nodes to keep DOM light
  const cards = feed.querySelectorAll('.comment-card');
  if (cards.length >= CONFIG.maxComments) cards[0].remove();

  feed.insertBefore(card, feed.lastElementChild);
  setTimeout(() => scrollToBottom(), CONFIG.autoScrollDelay);
}

function renderSystem(text) {
  const el = document.createElement('div');
  el.className = 'system-msg';
  el.textContent = text;
  feed.insertBefore(el, feed.lastElementChild);
  scrollToBottom();
}

// ─── Send Comment ─────────────────────────────────────────────
async function sendComment() {
  const text = commentInput.value.trim();
  if (!text || text.length > 200) return;

  const payload = {
    name: myName,
    text,
    color: myColor,
    time: Date.now(),
  };

  renderComment({ ...payload, isSelf: true });

  // 🔥 ส่งขึ้น Firestore
  await window.fb.addDoc(
    window.fb.collection(window.db, "comments"),
    payload
  );

  commentInput.value = '';
  updateCharCount();
  scrollToBottom(true);
  triggerEmojiBurst();
}

function listenComments() {
  const q = window.fb.query(
    window.fb.collection(window.db, "comments"),
    window.fb.orderBy("time", "asc")
  );

  window.fb.onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const data = change.doc.data();

        // กัน comment ตัวเองซ้ำ
        if (data.name === myName && data.time > Date.now() - 2000) return;

        renderComment({
          name: data.name,
          text: data.text,
          color: data.color,
          time: data.time
        });
      }
    });
  });
}

// ─── Emoji Burst ──────────────────────────────────────────────
const BURST_EMOJIS = ['💬', '✨', '👏', '🎉', '❤️', '🔥'];

function triggerEmojiBurst() {
  const emoji = BURST_EMOJIS[randomInt(0, BURST_EMOJIS.length - 1)];
  for (let i = 0; i < 2; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'emoji-burst';
      el.textContent = emoji;
      el.style.left   = randomInt(20, window.innerWidth - 60) + 'px';
      el.style.bottom = '100px';
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }, i * 130);
  }
}

// ─── Input Handlers ───────────────────────────────────────────
function updateCharCount() {
  const remaining = 200 - commentInput.value.length;
  charCount.textContent = remaining;
  charCount.className = 'char-count' +
    (remaining <= 0 ? ' error' : remaining <= 30 ? ' warn' : '');
}

commentInput.addEventListener('input', updateCharCount);
commentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
});
sendBtn.addEventListener('click', sendComment);

// ─── Scroll Detection ─────────────────────────────────────────
feed.addEventListener('scroll', () => {
  const distFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
  isScrolled = distFromBottom > 100;
});

// ─── Modal / Onboarding ───────────────────────────────────────
function joinLive() {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  myName  = name.slice(0, 20);
  myColor = getAvatarColor(myName);

  selfInitialEl.textContent                    = getInitial(myName);
  selfInitialEl.parentElement.style.background = myColor;

  modalOverlay.classList.add('hidden');
  commentInput.focus();

  renderSystem(`คุณ (${myName}) เข้าร่วมการสนทนาแล้ว 👋`);
  renderSystem('💡 เปิดแท็บใหม่ในหน้านี้เพื่อเพิ่มผู้ใช้งาน');

  listenComments();
}

joinBtn.addEventListener('click', joinLive);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinLive();
});

// ─── Boot ─────────────────────────────────────────────────────
viewerEl.textContent = viewerCount;
nameInput.focus();
