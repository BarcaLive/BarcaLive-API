import { CONFIG } from './config.js';
import { getBulkTeamTranslations } from './translator.js';
import { fetchCached } from './cache-helper.js';

export async function handleUCL(isoCode, env, ctx) {
  // URL z Twojego n8n (competition id: 10)
  const url = "https://api.meczyki.pl/api/v2/soccer/competitions/10/standings/2025";

  try {
    const res = await fetchCached(url, { method: "GET" }, 300, ctx); // 5 min cache
    const responseData = await res.json();

    // Dane w strukturze API są w: data.standings
    const rawStandings = responseData.data?.standings || [];

    // 1. Collect names
    const allNames = rawStandings.map(item => item.participant.displayName);

    // 2. Bulk Translate
    const translationsMap = await getBulkTeamTranslations(allNames, env, ctx);

    // 3. Map results
    const table = rawStandings.map(item => {
      const originalName = item.participant.displayName;
      const translations = translationsMap[originalName] || {
        pl: originalName, en: originalName, es: originalName, de: originalName, fr: originalName
      };

      return {
        position: item.displayOrder,
        team: {
          id: item.participant.id,
          name: translations,
          crest: `${CONFIG.SUPABASE_URL}/${item.participant.id}.webp`
        },
        matches: item.totalMatches,
        points: item.points,
        wins: item.won,
        draws: item.draw,
        losses: item.lost,
        goalsFor: item.goals,
        goalsAgainst: item.goalsAgainst,
        goalsDiff: item.goalsDifference
      };
    });

    return {
      competition: rawStandings[0]?.participant?.competition?.displayName || "Champions League",
      table: table
    };
  } catch (e) {
    return { error: "Błąd parsowania tabeli UCL", details: e.message };
  }
}