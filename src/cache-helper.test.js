import { test } from 'node:test';
import assert from 'node:assert';
import { getCacheableNow } from './cache-helper.js';

test('getCacheableNow rounds time correctly', () => {
    const originalDate = Date;

    // Mock Date to return a fixed time
    // 2023-10-27T10:00:15.000Z
    // We need to return a specific instance when new Date() is called
    const fixedTime = new Date('2023-10-27T10:00:15.000Z');

    global.Date = class extends Date {
        constructor(date) {
            if (date) return super(date);
            return fixedTime;
        }
    };

    try {
        // Test 30s interval
        // 10:00:15 -> 10:00:00
        const result30 = getCacheableNow(30);
        assert.strictEqual(result30, '2023-10-27 10:00:00');

        // Test 300s interval (5 min)
        // 10:00:15 -> 10:00:00
        const result300 = getCacheableNow(300);
        assert.strictEqual(result300, '2023-10-27 10:00:00');

    } finally {
        global.Date = originalDate;
    }
});

test('getCacheableNow handles different times', () => {
     const originalDate = Date;

    // Mock Date to return a fixed time
    // 2023-10-27T10:04:59.000Z
    const fixedTime = new Date('2023-10-27T10:04:59.000Z');

    global.Date = class extends Date {
        constructor(date) {
            if (date) return super(date);
            return fixedTime;
        }
    };

    try {
        // Test 300s interval
        // 10:04:59 -> 10:00:00
        const result300 = getCacheableNow(300);
        assert.strictEqual(result300, '2023-10-27 10:00:00');

    } finally {
        global.Date = originalDate;
    }
});

test('getCacheableNow handles boundary times', () => {
     const originalDate = Date;

    // Mock Date to return a fixed time
    // 2023-10-27T10:05:00.000Z
    const fixedTime = new Date('2023-10-27T10:05:00.000Z');

    global.Date = class extends Date {
        constructor(date) {
            if (date) return super(date);
            return fixedTime;
        }
    };

    try {
        // Test 300s interval
        // 10:05:00 -> 10:05:00
        const result300 = getCacheableNow(300);
        assert.strictEqual(result300, '2023-10-27 10:05:00');

    } finally {
        global.Date = originalDate;
    }
});
