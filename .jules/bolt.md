## 2024-05-20 - [Fix Broken Caching Due to Dynamic Timestamps]
**Learning:** Cloudflare `caches.default` matches strictly on the URL. Passing `new Date().toISOString()` into the fetch URL generated a unique URL every second, completely bypassing the cache and causing 100% cache misses despite having a defined TTL.
**Action:** Introduced `getCacheableNow(intervalSeconds)` to round down the current timestamp to the nearest interval (e.g., 30s or 300s). This ensures the URL remains stable for the duration of the cache TTL, allowing cache hits to occur.
