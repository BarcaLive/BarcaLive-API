import { CONFIG } from './config.js';
import { getBulkTeamTranslations } from './translator.js';
import { fetchCached } from './cache-helper.js';

export async function handleMatches(isoCode, env, ctx) {
  const now = new Date();
  const nowString = now.toISOString().replace('T', ' ').substring(0, 19);

  // 1. Pobieramy dane z API
  // Use Cache: Live/Upcoming (limit=5) -> Short Cache (30s)
  // Past (limit=15) -> Medium Cache (5m)
  const [nextRes, prevRes] = await Promise.all([
    fetchCached(`${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[after]=${nowString}&limit=5&order[startTime]=asc`, { method: "GET" }, 120, ctx),
    fetchCached(`${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[before]=${nowString}&limit=15&order[startTime]=desc`, { method: "GET" }, 300, ctx)
  ]);

  const nextJson = await nextRes.json();
  const prevJson = await prevRes.json();
  const allMatchesRaw = [...(nextJson.data || []), ...(prevJson.data || [])];

  // OPTIMIZATION: Filter matches BEFORE translation to reduce subrequests
  // 1. Unique IDs (O(N) Map-based deduplication)
  const uniqueMatchesMap = new Map();
  for (const match of allMatchesRaw) {
    if (!uniqueMatchesMap.has(match.id)) {
      uniqueMatchesMap.set(match.id, match);
    }
  }
  const uniqueMatchesList = Array.from(uniqueMatchesMap.values());

  // 2. Classify Statuses (Raw) to find which ones we actually used
  const isLive = (m) => ['live', 'half_time', 'extra_time', 'penalties'].includes(m.status) || m.statusGroup === 'live';
  const isFinished = (m) => m.statusGroup === 'finished' || m.status === 'finished';
  const isScheduled = (m) => !isLive(m) && !isFinished(m);

  // 3. Select relevant matches (Single pass classification)
  const liveRaw = [];
  const scheduledRaw = [];
  const finishedRaw = [];

  for (const m of uniqueMatchesList) {
    if (isLive(m)) liveRaw.push(m);
    else if (isFinished(m)) finishedRaw.push(m);
    else scheduledRaw.push(m);
  }

  scheduledRaw.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  finishedRaw.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).splice(6); // Keep only up to 6 finished matches

  // LOGIC: One active slot
  let activeRaw = null;
  if (liveRaw.length > 0) activeRaw = liveRaw[0];
  else if (scheduledRaw.length > 0) activeRaw = scheduledRaw[0];

  // 4. Collect Names ONLY from relevant matches
  const relevantMatches = [...finishedRaw];
  if (activeRaw) relevantMatches.push(activeRaw);

  const relevantNames = new Set();
  relevantMatches.forEach(m => {
    if (m.homeParticipant?.displayName) relevantNames.add(m.homeParticipant.displayName);
    if (m.awayParticipant?.displayName) relevantNames.add(m.awayParticipant.displayName);
  });

  // 5. Bulk Translate (Reduced set)
  const translationsMap = await getBulkTeamTranslations(Array.from(relevantNames), env, ctx);

  const mapMatch = (m) => {
    let appStatus = 'SCHEDULED';
    if (isFinished(m)) appStatus = 'FINISHED';
    if (isLive(m)) appStatus = 'IN_PLAY';

    // Obliczanie prawdopodobieństwa z kursów
    const odds = (m.odds && m.odds[0]) ? m.odds[0] : {};
    const h = odds.homeOdds, d = odds.tieOdds, a = odds.awayOdds;
    let probs = { homeWin: 0, draw: 0, awayWin: 0 };
    if (h > 1 && d > 1 && a > 1) {
      const total = (1 / h) + (1 / d) + (1 / a);
      probs = {
        homeWin: Math.round(((1 / h) / total) * 100),
        draw: Math.round(((1 / d) / total) * 100),
        awayWin: Math.round(((1 / a) / total) * 100)
      };
    }

    // Tłumaczenie nazw
    const homeName = m.homeParticipant?.displayName;
    const awayName = m.awayParticipant?.displayName;

    const homeTrans = translationsMap[homeName] || { pl: homeName, en: homeName, es: homeName, de: homeName, fr: homeName };
    const awayTrans = translationsMap[awayName] || { pl: awayName, en: awayName, es: awayName, de: awayName, fr: awayName };

    return {
      id: m.id,
      startTime: m.startTime,
      status: m.status,
      appStatus: appStatus,
      competition: { displayName: m.competition?.displayName },
      odds: (probs.homeWin === 0 && probs.draw === 0) ? null : probs,
      home: {
        id: m.homeParticipant?.id,
        name: homeTrans,
        crest: `${CONFIG.SUPABASE_URL}/${m.homeParticipant?.id}.webp`
      },
      away: {
        id: m.awayParticipant?.id,
        name: awayTrans,
        crest: `${CONFIG.SUPABASE_URL}/${m.awayParticipant?.id}.webp`
      },
      score: { home: m.homeScore ?? 0, away: m.awayScore ?? 0 },
      tv: null,
      liveDetails: null
    };
  };

  // 6. Map results
  const finalLive = [];
  const finalUpcoming = [];

  if (activeRaw) {
    if (isLive(activeRaw)) finalLive.push(mapMatch(activeRaw));
    else finalUpcoming.push(mapMatch(activeRaw));
  }

  const finished = finishedRaw.map(mapMatch);

  // Wybieramy mecz do wzbogacenia o TV/LiveDetails
  const targetMatch = finalLive[0] || finalUpcoming[0] || null;

  if (targetMatch) {
    const promises = [];

    // 1. Fotmob TV Details (Always run for target match)
    const fotmobTask = async () => {
      try {
        // Cache Key for Parsed TV Data
        // We use a fake URL to store the *computed* result in Cloudflare Cache
        const parsedCacheUrl = `https://api.barcalive.online/internal/tv-parsed/${targetMatch.id}-${isoCode}`;
        const cache = caches.default;
        const parsedCacheKey = new Request(parsedCacheUrl);

        // 1. Check if we have valid PARSED data cached
        let cachedParsedResponse = await cache.match(parsedCacheKey);
        if (cachedParsedResponse) {
          const cachedTv = await cachedParsedResponse.json();
          targetMatch.tv = cachedTv;
          return; // Done!
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

          // O(1) Direct Access path (Optimization)
          try {
            const fallbackObj = data?.props?.pageProps?.fallback || {};
            const teamKey = Object.keys(fallbackObj).find(k => k.startsWith('team-'));
            const teamFixtures = teamKey ? fallbackObj[teamKey]?.fixtures?.allFixtures?.fixtures : null;
            if (Array.isArray(teamFixtures) && teamFixtures.length > 0) {
              teamFixtures.forEach(obj => {
                if (obj.id && obj.status?.utcTime && !obj.status.finished) {
                  fmMatches.push({ id: obj.id, time: new Date(obj.status.utcTime) });
                }
              });
            }
          } catch (e) {
            // Silently fallback
          }

          // Fallback to O(N) recursive search if direct access fails or yields nothing
          if (fmMatches.length === 0) {
            const searchFM = (obj) => {
              if (!obj || typeof obj !== 'object') return;
              if (obj.id && obj.status?.utcTime) {
                if (!obj.status.finished) fmMatches.push({ id: obj.id, time: new Date(obj.status.utcTime) });
              }
              for (const key in obj) searchFM(obj[key]);
            };
            searchFM(data);
          }

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

        targetMatch.tv = tvResult;

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

      } catch (e) {
        console.error("Fotmob sync error:", e);
        targetMatch.tv = { error: "Fotmob sync exception", details: e.message, stack: e.stack };
      }
    };
    promises.push(fotmobTask());

    // 2. Jeśli mecz trwa, pobierz dodatkowe detale z Meczyków - Short Cache (15s)
    if (targetMatch.appStatus === 'IN_PLAY') {
      const liveDetailsTask = async () => {
        try {
          const dRes = await fetchCached(`${CONFIG.MECZYKI_API}/matches/${targetMatch.id}`, { method: "GET" }, 15, ctx);
          const dJson = await dRes.json();
          targetMatch.liveDetails = dJson.data || null;
        } catch (e) { }
      };
      promises.push(liveDetailsTask());
    }

    // Run parallel
    await Promise.allSettled(promises);
  }

  return {
    matches: {
      live: finalLive,
      upcoming: finalUpcoming,
      finished: finished
    }
  };
}