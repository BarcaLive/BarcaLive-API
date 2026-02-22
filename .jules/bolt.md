## 2024-05-22 - Recursive Search Bottleneck
**Learning:** Recursive search on large JSON objects (like Next.js hydration state) is a massive performance killer in JS (Node/Workers). A direct path access optimization yielded a 200x speedup (1500ms -> 7ms).
**Action:** Always inspect the structure of large third-party data blobs and prefer direct access over recursive traversal, using the latter only as a fallback.
