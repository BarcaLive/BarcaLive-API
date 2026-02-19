import { CONFIG } from './config.js';
import { getBulkTeamTranslations } from './translator.js';
import { fetchCached } from './cache-helper.js';
import { getTvDetails, getLiveDetails } from './match-details.js';

export async function handleMatches(isoCode, env, ctx) {
  const now = new Date();
  const nowString = now.toISOString().replace('T', ' ').substring(0, 19);

  // 1. Pobieramy dane z API
  // Use Cache: Live/Upcoming (limit=5) -> Short Cache (30s)
  // Past (limit=15) -> Medium Cache (5m)
  const [nextRes, prevRes] = await Promise.all([
    fetchCached(`${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[after]=${nowString}&limit=5&order[startTime]=asc`, { method: "GET" }, 30, ctx),
    fetchCached(`${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[before]=${nowString}&limit=15&order[startTime]=desc`, { method: "GET" }, 300, ctx)
  ]);

  const nextJson = await nextRes.json();
  const prevJson = await prevRes.json();
  const allMatchesRaw = [...(nextJson.data || []), ...(prevJson.data || [])];

  // OPTIMIZATION: Filter matches BEFORE translation to reduce subrequests
  // 1. Unique IDs
  const uniqueIds = Array.from(new Set(allMatchesRaw.map(m => m.id)));
  const uniqueMatchesList = [];
  for (const id of uniqueIds) {
    const match = allMatchesRaw.find(m => m.id === id);
    if (match) uniqueMatchesList.push(match);
  }

  // 2. Classify Statuses (Raw) to find which ones we actually used
  const isLive = (m) => ['live', 'half_time', 'extra_time', 'penalties'].includes(m.status) || m.statusGroup === 'live';
  const isFinished = (m) => m.statusGroup === 'finished' || m.status === 'finished';
  const isScheduled = (m) => !isLive(m) && !isFinished(m);

  // 3. Select relevant matches
  const liveRaw = uniqueMatchesList.filter(isLive);
  const scheduledRaw = uniqueMatchesList.filter(isScheduled).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const finishedRaw = uniqueMatchesList.filter(isFinished).sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 6);

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

  // 5. PARALLEL FETCHING: Translations + Details
  // We start fetching details for the active match immediately, parallel to translations.

  const translationsPromise = getBulkTeamTranslations(Array.from(relevantNames), env, ctx);

  let tvPromise = Promise.resolve(null);
  let liveDetailsPromise = Promise.resolve(null);

  if (activeRaw) {
    // Always fetch TV for active match
    tvPromise = getTvDetails(activeRaw.id, isoCode, ctx);

    // If match is live, fetch extra details
    if (isLive(activeRaw)) {
      liveDetailsPromise = getLiveDetails(activeRaw.id, ctx);
    }
  }

  // Await all parallel tasks
  const [translationsMap, tvResult, liveDetails] = await Promise.all([
    translationsPromise,
    tvPromise,
    liveDetailsPromise
  ]);

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

  // Attach details to the target match (if exists)
  const targetMatch = finalLive[0] || finalUpcoming[0] || null;

  if (targetMatch) {
    if (tvResult) {
      targetMatch.tv = tvResult;
    }
    if (liveDetails) {
      targetMatch.liveDetails = liveDetails;
    }
  }

  return {
    matches: {
      live: finalLive,
      upcoming: finalUpcoming,
      finished: finished
    }
  };
}
