// ─── UI helpers: toast, scroll, char counter ────────────────────
import { feed, commentInput, charCount } from './dom.js';
import { MAX_LEN } from './config.js';

// toast เบา ๆ แทน alert() ที่บล็อกทั้งหน้า (M4)
export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function scrollToBottom() {
  requestAnimationFrame(() =>
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' })
  );
}

export function updateCharCount() {
  const remaining = MAX_LEN - commentInput.value.length;
  charCount.textContent = remaining;
  charCount.className =
    'char-count' + (remaining <= 0 ? ' error' : remaining <= 30 ? ' warn' : '');
}

// ─── Scroll-to-Bottom FAB ──────────────────────────────────────
// ปุ่มลอย: โผล่เมื่อ user scroll ขึ้นไป + แสดงจำนวนข้อความที่พลาด
let _fab = null;
let _badge = null;
let _unread = 0;
const NEAR_BOTTOM_PX = 100;

function isNearBottom() {
  return feed.scrollHeight - feed.scrollTop - feed.clientHeight <= NEAR_BOTTOM_PX;
}

function setUnread(n) {
  _unread = n;
  if (!_badge) return;
  if (n > 0) {
    _badge.textContent = n > 99 ? '99+' : String(n);
    _badge.hidden = false;
  } else {
    _badge.hidden = true;
  }
}

function updateFabVisibility() {
  if (!_fab) return;
  if (isNearBottom()) {
    _fab.classList.remove('visible');
    if (_unread > 0) setUnread(0);
  } else if (_unread > 0) {
    _fab.classList.add('visible');
  }
}

export function initFeedScrollMonitor() {
  if (_fab) return;

  _fab = document.createElement('button');
  _fab.type = 'button';
  _fab.className = 'scroll-fab';
  _fab.setAttribute('aria-label', 'เลื่อนไปข้อความล่าสุด');

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('width', '20');
  arrow.setAttribute('height', '20');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML =
    '<path fill="currentColor" d="M12 16.5l-7-7 1.4-1.4L12 13.7l5.6-5.6L19 9.5z"/>';

  _badge = document.createElement('span');
  _badge.className = 'fab-badge';
  _badge.hidden = true;

  _fab.append(arrow, _badge);
  _fab.addEventListener('click', () => {
    scrollToBottom();
    setUnread(0);
    _fab.classList.remove('visible');
  });

  document.body.appendChild(_fab);
  feed.addEventListener('scroll', updateFabVisibility, { passive: true });
}

// ตัดสินใจว่า scroll หรือ notify FAB
// - isSelf หรืออยู่ใกล้ล่าง → scroll ลงเลย
// - user scroll ขึ้นไปอ่าน → ไม่รบกวน, นับ unread + แสดง FAB
export function maybeScrollOrNotify(isSelf) {
  if (isSelf || isNearBottom()) {
    scrollToBottom();
    setUnread(0);
    if (_fab) _fab.classList.remove('visible');
    return;
  }
  setUnread(_unread + 1);
  if (_fab) _fab.classList.add('visible');
}
