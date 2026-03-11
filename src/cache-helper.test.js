import { test } from 'node:test';
import assert from 'node:assert';
import { getCacheableNow } from './cache-helper.js';

test('getCacheableNow rounds down to nearest 30 seconds', () => {
  const now = new Date('2024-05-20T12:00:15.000Z');
  // 15 is < 30, so round down to 00
  const expected = '2024-05-20 12:00:00';
  const actual = getCacheableNow(30, now);
  assert.strictEqual(actual, expected);
});

test('getCacheableNow rounds down to nearest 30 seconds (case 2)', () => {
  const now = new Date('2024-05-20T12:00:45.000Z');
  // 45 is >= 30, so round down to 30
  const expected = '2024-05-20 12:00:30';
  const actual = getCacheableNow(30, now);
  assert.strictEqual(actual, expected);
});

test('getCacheableNow rounds down to nearest 60 seconds', () => {
  const now = new Date('2024-05-20T12:00:59.000Z');
  // 59 is < 60, so round down to 00
  const expected = '2024-05-20 12:00:00';
  const actual = getCacheableNow(60, now);
  assert.strictEqual(actual, expected);
});

test('getCacheableNow rounds down to nearest 300 seconds (5 min)', () => {
  const now = new Date('2024-05-20T12:04:59.000Z');
  // 04:59 is < 05:00, so round down to 00:00
  const expected = '2024-05-20 12:00:00';
  const actual = getCacheableNow(300, now);
  assert.strictEqual(actual, expected);
});

test('getCacheableNow rounds down to nearest 300 seconds (5 min) - next window', () => {
  const now = new Date('2024-05-20T12:05:01.000Z');
  // 05:01 is >= 05:00, so round down to 05:00
  const expected = '2024-05-20 12:05:00';
  const actual = getCacheableNow(300, now);
  assert.strictEqual(actual, expected);
});
