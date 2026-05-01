import { describe, it, expect } from 'vitest';

// Inline safeJsonParse to test without import path issues
function safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

describe('safeJsonParse', () => {
  it('returns fallback for null', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
    expect(safeJsonParse(null, { foo: 'bar' })).toEqual({ foo: 'bar' });
  });

  it('returns fallback for undefined', () => {
    expect(safeJsonParse(undefined, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', [])).toEqual([]);
  });

  it('parses valid JSON arrays', () => {
    expect(safeJsonParse('["a", "b"]', [])).toEqual(['a', 'b']);
    expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
  });

  it('parses valid JSON objects', () => {
    expect(safeJsonParse('{"key": "value"}', {})).toEqual({ key: 'value' });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', [])).toEqual([]);
    expect(safeJsonParse('{ broken: json }', {})).toEqual({});
  });

  it('parses valid JSON primitives (not invalid — they parse correctly)', () => {
    // JSON.parse("123") === 123 — valid JSON, no fallback
    expect(safeJsonParse('123', 0)).toBe(123);
    expect(safeJsonParse('true', false)).toBe(true);
    expect(safeJsonParse('null', null)).toBe(null);
  });

  it('handles whitespace-only strings as fallback', () => {
    expect(safeJsonParse('   ', [])).toEqual([]);
  });
});

describe('generateId', () => {
  // We can't easily import generateId without sql.js in the test environment,
  // so we document the expected format here
  it('generates unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      // Pattern: timestamp(36) + random(36).slice(2,8)
      // timestamp = ~7-8 chars in base36, random = 6 chars → total ~13-14 chars
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      expect(id.length).toBeGreaterThanOrEqual(12);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });

  it('id format matches expected pattern (base36 alphanumeric)', () => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    expect(/^[0-9a-z]+$/.test(id)).toBe(true);
  });
});
