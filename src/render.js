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
import { maybeScrollOrNotify } from './ui.js';

export const messageEls = new Map(); // msgId -> card element (แทน getElementById)

// ─── Reaction button ────────────────────────────────────────────
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

// ─── Pin button (admin only — ซ่อนด้วย CSS สำหรับคนปกติ) ──────────
function createPinButton(id, isPinned, onPin) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pin-btn' + (isPinned ? ' active' : '');
  b.setAttribute(
    'aria-label',
    isPinned ? 'ยกเลิกปักหมุดข้อความ' : 'ปักหมุดข้อความ'
  );
  b.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
  b.title = isPinned ? 'ยกเลิกปักหมุด' : 'ปักหมุดข้อความ';
  b.textContent = '📌';
  b.addEventListener('click', () => onPin(id));
  return b;
}

function buildCard({
  id,
  name,
  text,
  color,
  createdMs,
  isSelf,
  isPinned,
  reactions,
  onReact,
  onPin,
}) {
  const card = document.createElement('article');
  card.className = 'comment-card' + (isSelf ? ' is-self' : '') + (isPinned ? ' pinned' : '');
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

  // header: ชื่อ (สี avatar) + เวลา อยู่บรรทัดเดียวกัน
  const headerEl = document.createElement('div');
  headerEl.className = 'bubble-header';

  const nameEl = document.createElement('span');
  nameEl.className = 'bubble-name';
  nameEl.textContent = name;
  nameEl.style.color = safeColor(color);

  const timeEl = document.createElement('time');
  timeEl.className = 'bubble-time';
  timeEl.dateTime = new Date(createdMs).toISOString();
  timeEl.textContent = formatTime(createdMs);

  headerEl.append(nameEl, timeEl);

  const textEl = document.createElement('p');
  textEl.className = 'bubble-text';
  textEl.textContent = text;

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

  // Pin button (always rendered, CSS hide for non-admin)
  if (onPin) {
    actionsEl.append(createPinButton(id, isPinned, onPin));
  }

  bubble.append(headerEl, textEl, actionsEl);
  card.append(avatar, bubble);
  return card;
}

// ─── Pinned section (lazy create) ───────────────────────────────
let _pinnedSection = null;
function getPinnedSection() {
  if (_pinnedSection) {
    _pinnedSection.classList.remove('empty');
    return _pinnedSection;
  }
  _pinnedSection = document.createElement('div');
  _pinnedSection.className = 'pinned-section';
  _pinnedSection.setAttribute('aria-label', 'ข้อความที่ปักหมุด');
  // แทรกหลัง feed-spacer-top (= แสดงบนสุดของ feed)
  const spacerTop = feed.querySelector('.feed-spacer-top');
  if (spacerTop && spacerTop.nextSibling) {
    feed.insertBefore(_pinnedSection, spacerTop.nextSibling);
  } else {
    feed.insertBefore(_pinnedSection, feed.firstChild);
  }
  return _pinnedSection;
}

function insertPinned(card, pinnedMs) {
  const sec = getPinnedSection();
  card.dataset.pinnedAt = String(pinnedMs);
  // sort by pinnedAt desc — pin ล่าสุดอยู่บนสุด
  for (const existing of sec.children) {
    if (Number(existing.dataset.pinnedAt || 0) < pinnedMs) {
      sec.insertBefore(card, existing);
      return;
    }
  }
  sec.appendChild(card);
}

// ─── Insert by time (เฉพาะ direct children ของ feed) ─────────────
// Fast path O(1): ข้อความใหม่มักมาหลังสุด
// Slow path O(n): fallback กรณีพิเศษที่ timestamp ไม่เรียงลำดับ
function insertByTime(card) {
  const ms = Number(card.dataset.ts);
  // :scope > — เฉพาะลูกตรง (ไม่รวมการ์ดใน .pinned-section)
  const cards = feed.querySelectorAll(':scope > .comment-card');
  const lastCard = cards[cards.length - 1];
  if (!lastCard || ms >= Number(lastCard.dataset.ts)) {
    feed.insertBefore(card, feed.lastElementChild);
    return;
  }
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
  { onReact, onPin, scroll = false } = {}
) {
  if (messageEls.has(id)) return;
  const isPinned = data.isPinned === true;
  const card = buildCard({
    id,
    name: data.name || '?',
    text: data.text || '',
    color: data.color,
    createdMs: tsToMillis(data.createdAt),
    isSelf: data.uid === state.uid,
    isPinned,
    reactions: data.reactionCounts || {},
    onReact,
    onPin,
  });
  messageEls.set(id, card);

  if (isPinned) {
    insertPinned(card, tsToMillis(data.pinnedAt));
  } else {
    insertByTime(card);
  }

  // MAX_DOM trim — ลบจาก normal section เท่านั้น (pinned ไม่นับ)
  const normalCount = feed.querySelectorAll(':scope > .comment-card').length;
  if (messageEls.size > MAX_DOM && normalCount > 0) {
    const oldest = feed.querySelector(':scope > .comment-card');
    if (oldest) {
      messageEls.delete(oldest.dataset.id);
      oldest.remove();
    }
  }
  if (scroll) maybeScrollOrNotify(data.uid === state.uid);
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

// ─── Update pin state — ย้ายการ์ดเมื่อ admin ปัก/ยกเลิก ────────────
export function updatePinState(card, isPinned, pinnedMs) {
  const wasPinned = card.classList.contains('pinned');

  // อัปเดต pin button visual
  const btn = card.querySelector('.pin-btn');
  if (btn) {
    btn.classList.toggle('active', isPinned);
    btn.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
    btn.setAttribute(
      'aria-label',
      isPinned ? 'ยกเลิกปักหมุดข้อความ' : 'ปักหมุดข้อความ'
    );
    btn.title = isPinned ? 'ยกเลิกปักหมุด' : 'ปักหมุดข้อความ';
  }

  // ย้ายตำแหน่งถ้าสถานะเปลี่ยน
  if (isPinned && !wasPinned) {
    card.classList.add('pinned');
    card.remove();
    insertPinned(card, pinnedMs);
  } else if (!isPinned && wasPinned) {
    card.classList.remove('pinned');
    delete card.dataset.pinnedAt;
    card.remove();
    insertByTime(card);
    // ซ่อน section ถ้าว่าง
    if (_pinnedSection && _pinnedSection.children.length === 0) {
      _pinnedSection.classList.add('empty');
    }
  } else if (isPinned && wasPinned) {
    // ถ้า pinnedAt เปลี่ยน — re-sort
    const currentMs = Number(card.dataset.pinnedAt || 0);
    if (currentMs !== pinnedMs) {
      card.remove();
      insertPinned(card, pinnedMs);
    }
  }
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
    b.setAttribute('aria-label', `${REACTION_EMOJI[type]} ${count} คน`);
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
