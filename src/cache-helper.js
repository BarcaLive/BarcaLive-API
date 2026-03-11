/**
 * Helper to fetch with Cloudflare Cache API.
 * Uses `caches.default`.
 * 
 * @param {string|Request} requestUrl URL to fetch
 * @param {object} options fetch options
 * @param {number} ttlSeconds Cache TTL in seconds
 * @returns {Promise<Response>}
 */
export async function fetchCached(requestUrl, options, ttlSeconds = 60, ctx = null) {
    // Only cache GET requests
    const method = options?.method || 'GET';
    if (method.toUpperCase() !== 'GET') {
        return fetch(requestUrl, options);
    }

    const cache = caches.default;
    const urlStr = typeof requestUrl === 'string' ? requestUrl : requestUrl.url;

    // We use the URL as the cache key. 
    // Note: Cloudflare Cache API requires a Request object or URL string.

    // 1. Check Cache
    // We create a dummy Request for the cache key.
    const cacheKey = new Request(urlStr, options);

    let response = await cache.match(cacheKey);

    if (response) {
        // console.log(`[CACHE HIT] ${urlStr}`);
        return response;
    }

    // console.log(`[CACHE MISS] ${urlStr}`);

    // 2. Fetch Network
    response = await fetch(requestUrl, options);

    // 3. Cache the response (if successful)
    // We must recreate the response to modify headers to allow caching
    if (response.status === 200) {
        const body = await response.clone().arrayBuffer(); // Clone body

        // Headers construction
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);

        const responseToCache = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });

        // Put in cache (waitUntil is handled by the worker event)
        // By using ctx.waitUntil, we don't block the response to the user.
        try {
            const putPromise = cache.put(cacheKey, responseToCache.clone());
            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(putPromise);
            } else {
                // If no ctx, we have to await it to ensure it finishes (or fire-and-forget but dangerous on Workers)
                // However, for speed, fire-and-forget might be acceptable if we accept some cache misses.
                // But consistently, we should try to pass ctx.
                // For now, if no ctx, we await to be safe, as before.
                await putPromise;
            }
        } catch (e) {
            console.error("Cache put error:", e);
        }

        return responseToCache;
    }

    return response;
}

/**
 * Returns an ISO date string rounded down to the nearest multiple of `ttlSeconds`.
 * Used to ensure cache stability by aligning timestamps across requests.
 * @param {number} ttlSeconds - The rounding window in seconds (e.g., 60).
 * @param {Date} [now] - Optional Date object for testing.
 * @returns {string} - Rounded ISO string (YYYY-MM-DD HH:mm:ss).
 */
export function getCacheableNow(ttlSeconds = 60, now = new Date()) {
    const ms = now.getTime();
    // Round down to the nearest multiple of ttlSeconds * 1000
    const roundedMs = Math.floor(ms / (ttlSeconds * 1000)) * (ttlSeconds * 1000);
    return new Date(roundedMs).toISOString().replace('T', ' ').substring(0, 19);
}
