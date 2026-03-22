
## 2026-03-22 - Cloudflare Fetch Cache and Time-Dependent Query Strings
**Learning:** Using `caches.default.match()` with an exact `new Date().toISOString()` in the query string (e.g., `?startTime[after]=2026-03-22 13:20:31`) causes the cache key to change every second. This completely defeats the purpose of the Cloudflare Cache API, resulting in a 100% cache miss rate for these requests.
**Action:** When creating cache keys for time-dependent API requests, always round down the timestamp to match the cache's TTL window (e.g., `getRoundedTimeString(300)`). This ensures the generated URL remains identical for the duration of the TTL, allowing Cloudflare to serve cached responses efficiently.
