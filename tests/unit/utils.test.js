import { describe, it, expect } from 'vitest';
import {
  avatarColor,
  initialOf,
  safeColor,
  tsToMillis,
  formatTime,
  REACTION_EMOJI,
} from '../../src/utils.js';
import { AVATAR_COLORS } from '../../src/config.js';

describe('avatarColor', () => {
  it('is deterministic for the same name', () => {
    expect(avatarColor('Alice')).toBe(avatarColor('Alice'));
  });
  it('always returns a color from the palette', () => {
    for (const name of ['', 'a', 'สมชาย', '😀x', 'LongName123']) {
      expect(AVATAR_COLORS).toContain(avatarColor(name));
    }
  });
});

describe('initialOf', () => {
  it('uppercases the first character', () => {
    expect(initialOf('alice')).toBe('A');
    expect(initialOf('  bob')).toBe('B');
  });
  it('falls back to ? for empty input', () => {
    expect(initialOf('')).toBe('?');
    expect(initialOf('   ')).toBe('?');
  });
});

describe('safeColor (XSS / injection guard)', () => {
  it('accepts valid 6-digit hex', () => {
    expect(safeColor('#FF6B6B')).toBe('#FF6B6B');
    expect(safeColor('#abc123')).toBe('#abc123');
  });
  it('rejects anything else and falls back', () => {
    expect(safeColor('red')).toBe('#74B9FF');
    expect(safeColor('#fff')).toBe('#74B9FF');
    expect(safeColor('#000;background:url(x)')).toBe('#74B9FF');
    expect(safeColor('url(javascript:alert(1))')).toBe('#74B9FF');
    expect(safeColor(null)).toBe('#74B9FF');
    expect(safeColor(123)).toBe('#74B9FF');
  });
});

describe('tsToMillis', () => {
  it('uses toMillis when available', () => {
    expect(tsToMillis({ toMillis: () => 42 })).toBe(42);
  });
  it('falls back to a number for pending/invalid timestamps', () => {
    expect(typeof tsToMillis(null)).toBe('number');
    expect(typeof tsToMillis(undefined)).toBe('number');
  });
});

describe('formatTime', () => {
  it('returns a non-empty string', () => {
    expect(typeof formatTime(Date.now())).toBe('string');
    expect(formatTime(Date.now()).length).toBeGreaterThan(0);
  });
});

describe('REACTION_EMOJI', () => {
  it('maps the three reaction types', () => {
    expect(REACTION_EMOJI).toEqual({ like: '👍', love: '❤️', clap: '👏' });
  });
});
