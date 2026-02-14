## 2026-02-14 - Cache Key Canonicalization for Bulk Fetches
**Learning:** In bulk fetch operations (like `getBulkTeamTranslations`), sorting the input list of keys before generating the request URL ensures deterministic cache keys. Without this, different orderings (e.g., from updated standings) result in cache misses for the same data set.
**Action:** Always sort input arrays before using them to construct cache keys or URLs for bulk operations.
