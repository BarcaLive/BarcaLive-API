import test from 'node:test';
import assert from 'node:assert';
import { handleUCL } from './ucl.js';

// Mock global caches
globalThis.caches = {
  default: {
    match: async () => null,
    put: async () => {}
  }
};

test('handleUCL returns error object when fetchCached fails (network error)', async (t) => {
  const mockFetch = t.mock.method(globalThis, 'fetch', () => {
    return Promise.reject(new Error('Network failure'));
  });

  const result = await handleUCL('PL', {}, {});

  assert.strictEqual(result.error, "Błąd parsowania tabeli UCL");
  assert.strictEqual(result.details, "Network failure");
});

test('handleUCL returns error object when json parsing fails', async (t) => {
  const mockFetch = t.mock.method(globalThis, 'fetch', () => {
    return Promise.resolve(new Response('invalid json', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  });

  // We need to override the json method because Response.json() would throw on invalid json
  // But here handleUCL calls res.json() which will throw if it's 'invalid json'

  const result = await handleUCL('PL', {}, {});

  assert.strictEqual(result.error, "Błąd parsowania tabeli UCL");
  // The error message from Response.json() on invalid data might vary by Node version,
  // but it should contain "Unexpected token" or similar.
  assert.match(result.details, /Unexpected token/);
});

test('handleUCL successful path', async (t) => {
  const mockFetch = t.mock.method(globalThis, 'fetch', (url) => {
    if (url.includes('meczyki.pl')) {
      return Promise.resolve(new Response(JSON.stringify({
        data: {
          standings: [
            {
              participant: {
                id: 123,
                displayName: "FC Barcelona",
                competition: { displayName: "Champions League" }
              },
              displayOrder: 1,
              totalMatches: 6,
              points: 18,
              won: 6,
              draw: 0,
              lost: 0,
              goals: 20,
              goalsAgainst: 2,
              goalsDifference: 18
            }
          ]
        }
      }), { status: 200 }));
    }

    if (url.includes('supabase.co')) {
      return Promise.resolve(new Response(JSON.stringify([
        {
          pl: "FC Barcelona",
          en: "FC Barcelona (EN)",
          es: "FC Barcelona (ES)",
          de: "FC Barcelona (DE)",
          fr: "FC Barcelona (FR)"
        }
      ]), { status: 200 }));
    }

    return Promise.reject(new Error('Unknown URL: ' + url));
  });

  const result = await handleUCL('PL', { API_KEY: 'test-key' }, {});

  assert.strictEqual(result.competition, "Champions League");
  assert.strictEqual(result.table.length, 1);
  assert.strictEqual(result.table[0].team.name.en, "FC Barcelona (EN)");
  assert.strictEqual(result.table[0].points, 18);
});
