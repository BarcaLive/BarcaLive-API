## 2024-05-20 - Fix dynamic timestamp cache busting
**Learning:** Generating the current timestamp with `new Date().toISOString()` and appending it to an external API call URL inside a caching wrapper causes the cache key (the URL) to change every second, meaning the cache will never hit.
**Action:** Always round dynamic parameters used in URLs (such as timestamps) down to the nearest multiple of the `ttlSeconds` before passing them to the caching layer to ensure stable cache keys and proper caching.
