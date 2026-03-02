import { CONFIG } from './config.js';
import { getBulkTeamTranslations } from './translator.js';
import { fetchCached } from './cache-helper.js';

export async function handlePrevMatches(iso = 'PL', env, ctx) {
  const d = new Date();

  // OPTIMIZATION: Round timestamp down to nearest 5m to stabilize cache keys.
  // This matches our 5-minute cache TTL.
  d.setMilliseconds(0);
  d.setSeconds(0);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);

  const now = d.toISOString().replace('T', ' ').substring(0, 19);
  const url = `${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[before]=${now}&limit=15&order[startTime]=desc&iso=${iso}`;

  try {
    const res = await fetchCached(url, { method: "GET" }, 300, ctx); // 5 min cache
    const data = await res.json();
    const rawMatches = data.data || [];

    // 1. Collect names
    const allNames = new Set();
    rawMatches.forEach(m => {
      if (m.homeParticipant?.displayName) allNames.add(m.homeParticipant.displayName);
      if (m.awayParticipant?.displayName) allNames.add(m.awayParticipant.displayName);
    });

    // 2. Bulk Translate
    const translationsMap = await getBulkTeamTranslations(Array.from(allNames), env, ctx);

    // 3. Map
    const matches = rawMatches.map(m => {
      const homeName = m.homeParticipant?.displayName;
      const awayName = m.awayParticipant?.displayName;

      const homeTrans = translationsMap[homeName] || { pl: homeName, en: homeName, es: homeName, de: homeName, fr: homeName };
      const awayTrans = translationsMap[awayName] || { pl: awayName, en: awayName, es: awayName, de: awayName, fr: awayName };

      return {
        id: m.id,
        startTime: m.startTime,
        competition: m.competition?.displayName,
        home: {
          name: homeTrans,
          crest: `${CONFIG.SUPABASE_URL}/${m.homeParticipant.id}.webp`
        },
        away: {
          name: awayTrans,
          crest: `${CONFIG.SUPABASE_URL}/${m.awayParticipant.id}.webp`
        },
        score: {
          home: m.homeScore ?? 0,
          away: m.awayScore ?? 0
        },
        status: "FINISHED"
      };
    });

    return { type: "prev", matches };
  } catch (e) {
    return { error: "Błąd pobierania archiwalnych meczów", details: e.message };
  }
}