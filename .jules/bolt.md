# Bolt's Journal

## 2024-02-23 - Optimizing Large JSON Parsing in Workers
**Learning:** Parsing large JSON objects (1.2MB+) recursively in Cloudflare Workers can add significant latency (5ms+). Next.js hydration states (`__NEXT_DATA__`) often have predictable structures (`props.pageProps`) that allow for O(1) direct access instead of O(N) traversal.
**Action:** Always inspect large JSON blobs for predictable paths before resorting to recursive search. Use direct access with a recursive fallback for robustness.
