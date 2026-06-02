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
  b.type = 'button';
  b.dataset.type = type;
  b.setAttribute('aria-label', `${REACTION_EMOJI[type]} ${count || 0} คน`);

  const emoji = document.createElement('span');
  emoji.className = 'reaction-emoji';
  emoji.textContent = REACTION_EMOJI[type];

  const countEl = document.createElement('span');
  countEl.className = 'reaction-count';
  countEl.textContent = String(count || 0);

  b.append(emoji, countEl);

  if (state.myReactions.get(id) === type) {
    b.classList.add('reacted');
    b.setAttribute('aria-pressed', 'true');
  } else {
    b.setAttribute('aria-pressed', 'false');
  }

  b.addEventListener('click', () => onReact(id, type));
  return b;
}

function reportBtn(id, onReport) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'report-btn';
  b.setAttribute('aria-label', 'รายงานข้อความนี้');
  b.title = 'รายงาน';
  b.textContent = '⚑';
  b.addEventListener('click', () => onReport(id));
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
  onReport,
}) {
  const card = document.createElement('article');
  card.className = 'comment-card' + (isSelf ? ' is-self' : '');
  card.dataset.id = id;
  card.dataset.ts = String(createdMs);
  card.setAttribute('aria-label', `ข้อความจาก ${name}`);

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.background = safeColor(color);
  avatar.textContent = initialOf(name);
  avatar.setAttribute('aria-hidden', 'true');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const nameEl = document.createElement('div');
  nameEl.className = 'bubble-name';
  nameEl.textContent = name;

  const textEl = document.createElement('p');
  textEl.className = 'bubble-text';
  textEl.textContent = text;

  const timeEl = document.createElement('time');
  timeEl.className = 'bubble-time';
  timeEl.dateTime = new Date(createdMs).toISOString();
  timeEl.textContent = formatTime(createdMs);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'bubble-actions';

  const reactionsEl = document.createElement('div');
  reactionsEl.className = 'reactions';
  reactionsEl.setAttribute('role', 'group');
  reactionsEl.setAttribute('aria-label', 'reactions');
  reactionsEl.append(
    reactionBtn(id, 'like', reactions.like, onReact),
    reactionBtn(id, 'love', reactions.love, onReact),
    reactionBtn(id, 'clap', reactions.clap, onReact)
  );

  actionsEl.append(reactionsEl);
  // ไม่แสดงปุ่ม report บนข้อความของตัวเอง
  if (!isSelf && onReport) {
    actionsEl.append(reportBtn(id, onReport));
  }

  bubble.append(nameEl, textEl, timeEl, actionsEl);
  card.append(avatar, bubble);
  return card;
}

// แทรกการ์ดตามลำดับเวลา
// Fast path O(1): ข้อความใหม่มักมาหลังสุดเสมอ (limitToLast + asc order)
// Slow path O(n): fallback สำหรับกรณีพิเศษที่ timestamp ไม่เรียงลำดับ (หายากมาก)
function insertByTime(card) {
  const ms = Number(card.dataset.ts);
  // getElementsByClassName คืน live HTMLCollection — index access เป็น O(1)
  const cards = feed.getElementsByClassName('comment-card');
  const lastCard = cards[cards.length - 1];
  if (!lastCard || ms >= Number(lastCard.dataset.ts)) {
    // fast path: แค่ append ก่อน spacer-bottom
    feed.insertBefore(card, feed.lastElementChild);
    return;
  }
  // slow path: scan forward เพื่อหาตำแหน่งแทรก (out-of-order message)
  for (const existing of cards) {
    if (Number(existing.dataset.ts) > ms) {
      feed.insertBefore(card, existing);
      return;
    }
  }
  feed.insertBefore(card, feed.lastElementChild);
}

export function renderMessage(
  id,
  data,
  { onReact, onReport, scroll = false } = {}
) {
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
    onReport,
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
  const msgId = card.dataset.id;
  const myType = state.myReactions.get(msgId);
  card.querySelectorAll('.reactions button').forEach((b) => {
    const type = b.dataset.type;
    const count = reactions?.[type] || 0;
    const countEl = b.querySelector('.reaction-count');
    if (countEl) countEl.textContent = String(count);
    b.setAttribute('aria-label', `${REACTION_EMOJI[type]} ${count} คน`);
    const isActive = type === myType;
    b.classList.toggle('reacted', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

// Optimistic update — DOM ขยับทันทีก่อนรอ server (และ rollback ได้)
// prevType / newType: 'like' | 'love' | 'clap' | null
export function applyOptimisticReaction(msgId, prevType, newType) {
  const card = messageEls.get(msgId);
  if (!card) return;

  card.querySelectorAll('.reactions button').forEach((b) => {
    const type = b.dataset.type;
    const countEl = b.querySelector('.reaction-count');
    let count = Number(countEl?.textContent) || 0;
    if (type === prevType) count = Math.max(0, count - 1);
    if (type === newType) count += 1;
    if (countEl) countEl.textContent = String(count);
    const isActive = type === newType;
    b.classList.toggle('reacted', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    b.setAttribute(
      'aria-label',
      `${REACTION_EMOJI[type]} ${count} คน`
    );
  });

  if (newType) state.myReactions.set(msgId, newType);
  else state.myReactions.delete(msgId);
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
  el.setAttribute('role', 'status');
  el.textContent = text;
  feed.insertBefore(el, feed.lastElementChild);
}
