
## 2025-03-04 - [Optimize match deduplication from O(N^2) to O(N)]
**Learning:** The deduplication logic in `src/match.js` previously created a `Set` of IDs, converted it to an array, and then iterated over it, calling `.find()` on the original array for each ID. This resulted in an O(N^2) complexity, leading to measurable performance degradation when handling larger match lists.
**Action:** Replace nested loops that use `.find()` or `.filter()` with an O(N) Map-based deduplication approach to improve performance significantly, avoiding redundant iteration.
