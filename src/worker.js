import { handleLaLiga } from './laliga.js';
import { handleUCL } from './ucl.js';
import { handleMatches } from './match.js';
import { handleNextMatches } from './next-match.js';
import { handlePrevMatches } from './prev-match.js';


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const data = url.searchParams.get('data');
    const iso = url.searchParams.get('iso');

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };

    const available = "match, next, prev, laliga, ucl";

    // 1. Sprawdzenie braku parametru 'data'
    if (!data) {
      return new Response(JSON.stringify({
        error: `Missing 'data' parameter. Available: ${available}`
      }), { status: 400, headers });
    }

    try {
      let responseData;

      switch (data) {
        case 'match':
          // Dla 'match' ISO jest obowiązkowe
          if (!iso) {
            return new Response(JSON.stringify({ error: "Missing 'iso' parameter." }), { status: 400, headers });
          }
          if (!/^[a-zA-Z]{2}$/.test(iso)) {
            return new Response(JSON.stringify({ error: "Unavailable 'iso' value. Try again with another." }), { status: 400, headers });
          }
          responseData = await handleMatches(iso, env, ctx);
          break;

        case 'next':
          // ISO przekazujemy jakie jest (może być null)
          responseData = await handleNextMatches(iso, env, ctx);
          break;

        case 'prev':
          responseData = await handlePrevMatches(iso, env, ctx);
          break;

        case 'laliga':
          responseData = await handleLaLiga(iso, env, ctx);
          break;



        case 'ucl':
          responseData = await handleUCL(iso, env, ctx);
          break;

        // 2. Obsługa błędnego parametru 'data'
        default:
          return new Response(JSON.stringify({
            error: `Wrong 'data' parameter. Available: ${available}`
          }), { status: 400, headers });
      }

      // Add Browser Cache Control
      // Short cache for client (e.g. 60s) to feel "instant" on navigation back/forward
      headers['Cache-Control'] = 'public, max-age=60, s-maxage=60';

      return new Response(JSON.stringify(responseData), { headers });

    } catch (e) {
      return new Response(JSON.stringify({ error: "Server Error", details: e.message }), { status: 500, headers });
    }
  }
};