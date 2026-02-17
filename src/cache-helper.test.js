import { test } from 'node:test';
import assert from 'node:assert';
import { getCacheableNow } from './cache-helper.js';

test('getCacheableNow rounds time to nearest 30s interval', () => {
    const interval = 30;
    const result = getCacheableNow(interval);

    // The format is "YYYY-MM-DD HH:mm:ss" (UTC)
    // We append 'Z' to ensure it's treated as UTC when parsing
    const date = new Date(result.replace(' ', 'T') + 'Z');
    const time = date.getTime() / 1000;

    assert.strictEqual(time % interval, 0, `Time ${time} should be divisible by ${interval}`);
});

test('getCacheableNow works with 300s interval', () => {
    const interval = 300;
    const result = getCacheableNow(interval);

    const date = new Date(result.replace(' ', 'T') + 'Z');
    const time = date.getTime() / 1000;

    assert.strictEqual(time % interval, 0, `Time ${time} should be divisible by ${interval}`);
});
