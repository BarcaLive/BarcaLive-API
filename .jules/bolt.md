## 2024-05-20 - High-precision timestamp anti-pattern in cache keys
**Learning:** Using high-precision timestamps (e.g., exact second `new Date().toISOString()`) in API query parameters dynamically busts the cache on every request, effectively defeating URL-based caching mechanisms (like `caches.default`) since the key is constantly changing.
**Action:** Always round dynamic timestamp query variables down to the nearest multiple of the desired cache TTL (e.g., `Math.floor(ms / (ttl * 1000)) * (ttl * 1000)`) to ensure the cache key remains stable for the duration of the cache window.
