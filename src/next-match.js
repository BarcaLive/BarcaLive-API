import { CONFIG } from './config.js';
import { getBulkTeamTranslations } from './translator.js';
import { fetchCached, getRoundedTimeString } from './cache-helper.js';

export async function handleNextMatches(iso = 'PL', env, ctx) {
  const now = getRoundedTimeString(300);
  const url = `${CONFIG.MECZYKI_API}/matches?itemId=${CONFIG.ITEM_ID}&startTime[after]=${now}&limit=15&order[startTime]=asc&iso=${iso}`;

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
        status: "SCHEDULED"
      };
    });

    return { type: "next", matches };
  } catch (e) {
    return { error: "Błąd pobierania nadchodzących meczów", details: e.message };
  }
}