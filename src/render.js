// ─── Message rendering (DOM API ล้วน — กัน XSS, M5/M6) ──────────
import { feed } from './dom.js';
import { MAX_DOM } from './config.js';
import { state } from './state.js';
import {
  initialOf,
  safeColor,
  tsToMillis,
  formatTime,
  REACTION_EMOJI,
} from './utils.js';
import { scrollToBottom } from './ui.js';

export const messageEls = new Map(); // msgId -> card element (แทน getElementById)

function reactionBtn(id, type, count, onReact) {
  const b = document.createElement('button');
  b.dataset.type = type;
  b.textContent = `${REACTION_EMOJI[type]} ${count || 0}`;
  b.addEventListener('click', () => onReact(id, type)); // ไม่ใช้ inline onclick
  return b;
}

function buildCard({
  id,
  name,
  text,
  color,
  createdMs,
  isSelf,
  reactions,
  onReact,
}) {
  const card = document.createElement('div');
  card.className = 'comment-card' + (isSelf ? ' is-self' : '');
  card.dataset.id = id;
  card.dataset.ts = String(createdMs);

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.background = safeColor(color);
  avatar.textContent = initialOf(name);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const nameEl = document.createElement('div');
  nameEl.className = 'bubble-name';
  nameEl.textContent = name;

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';
  textEl.textContent = text;

  const timeEl = document.createElement('div');
  timeEl.className = 'bubble-time';
  timeEl.textContent = formatTime(createdMs);

  const reactionsEl = document.createElement('div');
  reactionsEl.className = 'reactions';
  reactionsEl.append(
    reactionBtn(id, 'like', reactions.like, onReact),
    reactionBtn(id, 'love', reactions.love, onReact),
    reactionBtn(id, 'clap', reactions.clap, onReact)
  );

  bubble.append(nameEl, textEl, timeEl, reactionsEl);
  card.append(avatar, bubble);
  return card;
}

// แทรกการ์ดตามลำดับเวลา (รองรับ batch แรก desc + ข้อความใหม่)
function insertByTime(card) {
  const ms = Number(card.dataset.ts);
  const cards = feed.querySelectorAll('.comment-card');
  for (const existing of cards) {
    if (Number(existing.dataset.ts) > ms) {
      feed.insertBefore(card, existing);
      return;
    }
  }
  feed.insertBefore(card, feed.lastElementChild); // ก่อน spacer ล่างสุด
}

export function renderMessage(id, data, { onReact, scroll = false } = {}) {
  if (messageEls.has(id)) return;
  const card = buildCard({
    id,
    name: data.name || '?',
    text: data.text || '',
    color: data.color,
    createdMs: tsToMillis(data.createdAt),
    isSelf: data.uid === state.uid,
    reactions: data.reactionCounts || {},
    onReact,
  });
  messageEls.set(id, card);
  insertByTime(card);

  if (messageEls.size > MAX_DOM) {
    const oldest = feed.querySelector('.comment-card');
    if (oldest) {
      messageEls.delete(oldest.dataset.id);
      oldest.remove();
    }
  }
  if (scroll) scrollToBottom();
}

export function updateReactions(card, reactions) {
  card.querySelectorAll('.reactions button').forEach((b) => {
    const type = b.dataset.type;
    b.textContent = `${REACTION_EMOJI[type]} ${reactions?.[type] || 0}`;
  });
}

export function removeMessage(id) {
  const el = messageEls.get(id);
  if (el) {
    el.remove();
    messageEls.delete(id);
  }
}

export function renderSystem(text) {
  const el = document.createElement('div');
  el.className = 'system-msg';
  el.textContent = text;
  feed.insertBefore(el, feed.lastElementChild);
}
