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
