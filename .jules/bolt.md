
## 2024-05-20 - [Fotmob JSON Parsing Optimization]
**Learning:** Parsing and searching through very large JSON objects (e.g., Fotmob's `__NEXT_DATA__` JSON which is ~1MB) using a recursive search significantly blocks the main thread (taking ~10ms).
**Action:** When extracting data from known, consistent large JSON structures, prioritize direct property access paths (e.g., `props.pageProps.fallback['team-8634'].fixtures.allFixtures.fixtures`) with try-catch blocks over full recursive traversal. This reduces CPU time from ~10ms down to ~0.05ms, reducing latency and freeing the event loop. Always keep the robust recursive logic as a fallback to handle unexpected structural changes.
