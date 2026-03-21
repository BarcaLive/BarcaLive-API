
## 2024-05-28 - Cache invalidation via dynamic query parameters
**Learning:** Cloudflare Cache API uses the full Request URL as the cache key by default. When dynamically generating timestamps for API requests (e.g., `startTime[after]=new Date().toISOString()`), the URL changes every second. This entirely bypasses the cache, resulting in redundant external API calls on every request, despite having a 5-minute cache TTL configured via `fetchCached`.
**Action:** Always round dynamic parameters (like timestamps) down to the nearest multiple of the desired cache TTL (e.g., `Math.floor(now / ttl) * ttl`). This ensures stable cache keys within the TTL window while still fetching fresh data when the TTL expires.
