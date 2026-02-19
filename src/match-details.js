import { CONFIG } from './config.js';
import { fetchCached } from './cache-helper.js';

export async function getTvDetails(matchId, isoCode, ctx) {
    try {
        // Cache Key for Parsed TV Data
        // We use a fake URL to store the *computed* result in Cloudflare Cache
        const parsedCacheUrl = `https://api.barcalive.online/internal/tv-parsed/${matchId}-${isoCode}`;
        const cache = caches.default;
        const parsedCacheKey = new Request(parsedCacheUrl);

        // 1. Check if we have valid PARSED data cached
        let cachedParsedResponse = await cache.match(parsedCacheKey);
        if (cachedParsedResponse) {
            return await cachedParsedResponse.json();
        }

        // 2. If not, proceed with complex fetching & parsing
        // Pobieranie poprawnego ID z Fotmob do transmisji TV
        const fotmobTeamUrl = "https://www.fotmob.com/pl/teams/8634/fixtures/barcelona";
        // Fotmob HTML - 5 min cache
        const fRes = await fetchCached(fotmobTeamUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36" }
        }, 300, ctx);
        const html = await fRes.text();
        const matchDataStr = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);

        let tvResult = null;

        if (matchDataStr) {
            const data = JSON.parse(matchDataStr[1]);
            let fmMatches = [];
            const searchFM = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                if (obj.id && obj.status?.utcTime) {
                    if (!obj.status.finished) fmMatches.push({ id: obj.id, time: new Date(obj.status.utcTime) });
                }
                for (const key in obj) searchFM(obj[key]);
            };
            searchFM(data);
            fmMatches.sort((a, b) => a.time - b.time);

            if (fmMatches.length > 0) {
                // Fotmob TV Details - 5 min cache
                const tvRes = await fetchCached(`https://www.fotmob.com/api/data/tvlisting?matchId=${fmMatches[0].id}&countryCode=${isoCode}`, {
                    headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.fotmob.com/" }
                }, 300, ctx);
                const tvJson = await tvRes.json();
                if (tvJson?.name) {
                    tvResult = {
                        stations: tvJson.name.split('/').map(s => s.trim()).filter(s => s !== ""),
                        country: isoCode
                    };
                } else {
                    tvResult = { error: "TV JSON has no name", json: tvJson };
                }
            } else {
                tvResult = { error: "No matches found in Fotmob data", count: fmMatches.length };
            }
        } else {
            tvResult = { error: "__NEXT_DATA__ not found in HTML", html_preview: html.substring(0, 100) };
        }

        // 3. Cache the PARSED result (if valid)
        if (tvResult && !tvResult.error) {
            const responseToCache = new Response(JSON.stringify(tvResult), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=300, s-maxage=300' // 5 min cache for parsed data
                }
            });

            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(cache.put(parsedCacheKey, responseToCache));
            } else {
                // Fire and forget or await if critical (writing cache is non-critical for response)
                cache.put(parsedCacheKey, responseToCache).catch(console.error);
            }
        }

        return tvResult;

    } catch (e) {
        console.error("Fotmob sync error:", e);
        return { error: "Fotmob sync exception", details: e.message, stack: e.stack };
    }
}

export async function getLiveDetails(matchId, ctx) {
    try {
        const dRes = await fetchCached(`${CONFIG.MECZYKI_API}/matches/${matchId}`, { method: "GET" }, 15, ctx);
        const dJson = await dRes.json();
        return dJson.data || null;
    } catch (e) {
        return null;
    }
}
