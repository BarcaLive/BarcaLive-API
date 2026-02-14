import { CONFIG } from './config.js';
import { getBulkTeamTranslations } from './translator.js';
import { fetchCached } from './cache-helper.js';

export async function handleLaLiga(isoCode, env, ctx) {
  const url = "https://api.meczyki.pl/api/v2/soccer/competitions/7/standings/2025";

  try {
    const res = await fetchCached(url, { method: "GET" }, 300, ctx); // 5 min cache
    const responseData = await res.json();

    // W Twoim JSON dane są w: data.standings
    const rawStandings = responseData.data?.standings || [];

    // 1. Collect all names
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
        position: item.displayOrder, // Pozycja w tabeli
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
      // Wyciągamy nazwę rozgrywek z pierwszego elementu, jeśli istnieje
      competition: rawStandings[0]?.participant?.competition?.displayName || "La Liga",
      table: table
    };
  } catch (e) {
    return { error: "Błąd parsowania tabeli", details: e.message };
  }
}