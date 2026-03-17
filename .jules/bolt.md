
## 2024-05-28 - [Cloudflare Cache Invalidation via Query Params]
**Learning:** Using `new Date().toISOString()` to append a `now` query parameter to API URLs causes the URL to change every second. When using Cloudflare's Cache API (`caches.default`) via `fetchCached`, the full URL is used as the cache key. Therefore, appending a dynamic timestamp effectively busts the cache on almost every request, causing 100% cache misses for what should be cached responses, overloading the external API.
**Action:** When fetching data with a TTL, round the timestamp down to the nearest multiple of the TTL (e.g., `getRoundedTimeString(TTL)`) so the URL remains stable for the duration of the cache period, allowing cache hits while still updating periodically.
