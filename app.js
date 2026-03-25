'use strict';

// ─── Config ───────────────────────────────────────────────────
const CONFIG = {
  maxComments: 200,
  autoScrollDelay: 80,
  avatarColors: [
    '#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF',
    '#FF8B94','#6C5CE7','#FD79A8','#55EFC4',
    '#FDCB6E','#74B9FF','#F8A5C2','#A29BFE',
    '#81ECEC','#FAB1A0','#B2BEFF','#00CEC9',
  ],
};

// ─── State ────────────────────────────────────────────────────
let myName = '';
let myColor = '';
let isScrolled = false;
let viewerCount = 0;

const viewerId = Math.random().toString(36).substring(2);

let unsubscribeComments = null;
let unsubscribeViewers = null;

// ─── DOM ──────────────────────────────────────────────────────
const feed = document.getElementById('comment-feed');
const commentInput = document.getElementById('comment-input');
const sendBtn = document.getElementById('send-btn');
const charCount = document.getElementById('char-count');
const viewerEl = document.getElementById('viewer-count');
const selfInitialEl = document.getElementById('self-initial');
const modalOverlay = document.getElementById('modal-overlay');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const clearBtn = document.getElementById('clear-btn');

// ─── Helpers ──────────────────────────────────────────────────
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return CONFIG.avatarColors[Math.abs(h) % CONFIG.avatarColors.length];
}

function getInitial(name) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function scrollToBottom(force = false) {
  if (!isScrolled || force) {
    requestAnimationFrame(() => {
      feed.scrollTo({
        top: feed.scrollHeight,
        behavior: 'smooth'
      });
    });
  }
}

// ─── Render ───────────────────────────────────────────────────
function renderComment({ id, name, text, isSelf = false, color, time, reactions = {} }) {
  const card = document.createElement('div');
  card.className = 'comment-card' + (isSelf ? ' is-self' : '');

  const avatarColor = color || getAvatarColor(name);
  const initial = getInitial(name);
  const timeStr = formatTime(time || Date.now());

  card.innerHTML = `
    <div class="avatar" style="background:${avatarColor};">${initial}</div>
    <div class="bubble">
      <div class="bubble-name">${escapeHtml(name)}</div>
      <div class="bubble-text">${escapeHtml(text)}</div>
      <div class="bubble-time">${timeStr}</div>

      <div class="reactions">
        <button onclick="react('${id}', 'like')">👍 ${reactions.like || 0}</button>
        <button onclick="react('${id}', 'love')">❤️ ${reactions.love || 0}</button>
        <button onclick="react('${id}', 'clap')">👏 ${reactions.clap || 0}</button>
      </div>
    </div>
  `;

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
}

// ─── Firestore: Comments ──────────────────────────────────────
async function sendComment() {
  const text = commentInput.value.trim();
  if (!text || text.length > 200) return;

  const payload = {
    name: myName,
    text,
    color: myColor,
    time: Date.now(),
    viewerId,
    reactions: {}
  };

  try {
    await window.fb.addDoc(
      window.fb.collection(window.db, "comments"),
      payload
    );
  } catch (err) {
    alert("ส่งข้อความไม่สำเร็จ ❌");
  }

  commentInput.value = '';
  updateCharCount();
}

// 🔥 FIX ตัวสำคัญ (ของเดิมพังตรงนี้)
function listenComments() {
  if (unsubscribeComments) unsubscribeComments();

  const q = window.fb.query(
    window.fb.collection(window.db, "comments"),
    window.fb.orderBy("time", "asc")
  );

  unsubscribeComments = window.fb.onSnapshot(q, (snapshot) => {
    feed.innerHTML = '<div class="feed-spacer-top"></div><div class="feed-spacer-bottom"></div>';

    snapshot.forEach(doc => {
      const data = doc.data();

      renderComment({
        id: doc.id,
        name: data.name,
        text: data.text,
        color: data.color,
        time: data.time,
        reactions: data.reactions || {}
      });
    });
  });
}

// ─── Firestore: Viewers ───────────────────────────────────────
function listenViewerCount() {
  if (unsubscribeViewers) unsubscribeViewers();

  const col = window.fb.collection(window.db, "viewers");

  unsubscribeViewers = window.fb.onSnapshot(col, (snapshot) => {
    const now = Date.now();

    const active = snapshot.docs.filter(doc => {
      const d = doc.data();
      return now - (d.lastActive || 0) < 10000;
    });

    viewerCount = active.length;
    viewerEl.textContent = viewerCount;
  });
}

// ─── Reaction ─────────────────────────────────────────────────
async function react(docId, type) {
  const ref = window.fb.doc(window.db, "comments", docId);

  const snap = await window.fb.getDocs(
    window.fb.query(window.fb.collection(window.db, "comments"))
  );

  const target = snap.docs.find(d => d.id === docId);
  if (!target) return;

  const data = target.data();
  const reactions = data.reactions || {};

  reactions[type] = (reactions[type] || 0) + 1;

  await window.fb.setDoc(ref, { reactions }, { merge: true });

  triggerReactionEffect(type);
}

function triggerReactionEffect(type) {
  const map = { like: '👍', love: '❤️', clap: '👏' };
  const emoji = map[type] || '✨';

  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.textContent = emoji;

  el.style.left = Math.random() * window.innerWidth + 'px';
  el.style.bottom = '80px';

  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
window.react = react;

// ─── Input ────────────────────────────────────────────────────
function updateCharCount() {
  const remaining = 200 - commentInput.value.length;

  charCount.textContent = remaining;
  charCount.className = 'char-count' +
    (remaining <= 0 ? ' error' : remaining <= 30 ? ' warn' : '');
}

commentInput.addEventListener('input', updateCharCount);

commentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendComment();
  }
});

sendBtn.addEventListener('click', sendComment);

// ─── Join ─────────────────────────────────────────────────────
async function joinLive() {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();

  myName = name.slice(0, 20);
  myColor = getAvatarColor(myName);

  selfInitialEl.textContent = getInitial(myName);
  selfInitialEl.parentElement.style.background = myColor;

  modalOverlay.classList.add('hidden');

  renderSystem(`คุณ (${myName}) เข้าร่วมแล้ว`);

  listenComments();
  listenViewerCount();

  await window.fb.setDoc(
    window.fb.doc(window.db, "viewers", viewerId),
    { name: myName, lastActive: Date.now() }
  );

  setInterval(() => {
    window.fb.setDoc(
      window.fb.doc(window.db, "viewers", viewerId),
      { lastActive: Date.now() },
      { merge: true }
    );
  }, 5000);
}

joinBtn.addEventListener('click', joinLive);
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') joinLive();
});

// ─── Admin ────────────────────────────────────────────────────
async function clearAllComments() {
  const pass = prompt("รหัส Admin:");

  if (pass !== "Admin2026") return alert("ผิด ❌");

  const snap = await window.fb.getDocs(
    window.fb.collection(window.db, "comments")
  );

  await Promise.all(snap.docs.map(d => window.fb.deleteDoc(d.ref)));

  alert("ล้างแล้ว ✅");
}

if (clearBtn) clearBtn.addEventListener('click', clearAllComments);

// ─── Exit ─────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  window.fb.deleteDoc(
    window.fb.doc(window.db, "viewers", viewerId)
  );
});

// ─── Boot ─────────────────────────────────────────────────────
viewerEl.textContent = viewerCount;
nameInput.focus();
