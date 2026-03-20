
## 2024-05-28 - Cache Parameter Stabilization
**Learning:** In Cloudflare Workers, passing a highly dynamic parameter like a second-precision timestamp (`new Date().toISOString()`) into a URL that is meant to be cached completely defeats the purpose of caching. The `caches.default.match()` uses the exact URL string as the cache key, so a new request every second results in a cache miss, spamming the underlying API.
**Action:** When creating cache keys for time-based API endpoints (e.g., getting matches after "now"), always round the "now" timestamp down to the nearest multiple of the desired TTL. This creates a stable URL string (cache key) that stays identical for the duration of the cache window.
