
## 2024-05-28 - Cache Key Stability Optimization
**Learning:** Using `new Date().toISOString()` in cache keys creates a unique URL for every request, completely defeating the purpose of the Cloudflare Cache API (`fetchCached`) by causing constant cache misses.
**Action:** Always round down timestamps in cache keys to match the expected TTL (e.g., using a `getRoundedTimeString` helper) to ensure cache hits for the duration of the TTL.
