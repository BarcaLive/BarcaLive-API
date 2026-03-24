import { CONFIG } from './config.js';
import { fetchCached } from './cache-helper.js';

// Cache TTLs (in seconds)
const SUPABASE_TTL = 86400; // 24 hours
const WIKI_TTL = 86400;     // 24 hours

// OPTIMIZATION: In-memory cache for translations to avoid redundant network calls
// This persists across requests within the same worker instance.
const localTranslationCache = new Map();

/**
 * Optimized Bulk Translation Fetcher.
 */
export async function getBulkTeamTranslations(names, env, ctx) {
    if (!names || names.length === 0) return {};

    // 1. Deduplicate inputs
    const uniqueNames = [...new Set(names.filter(n => n))];
    const resultMap = {};
    const missingInLocal = [];

    // Check local cache first
    for (const name of uniqueNames) {
        if (localTranslationCache.has(name)) {
            resultMap[name] = localTranslationCache.get(name);
        } else {
            missingInLocal.push(name);
        }
    }

    // If all found in local cache, return immediately
    if (missingInLocal.length === 0) {
        return resultMap;
    }

    // 2. Batch Fetch from Supabase (Only for missing)
    const chunkSize = 50; // Use larger chunks to reduce subrequests (Supabase handles larger URLs fine)
    const chunks = [];
    for (let i = 0; i < missingInLocal.length; i += chunkSize) {
        chunks.push(missingInLocal.slice(i, i + chunkSize));
    }

    const supabaseResults = await Promise.all(
        chunks.map(chunk => fetchFromSupabaseBulk(chunk, env, ctx))
    );

    // Flatten results and populate map & local cache
    for (const batch of supabaseResults) {
        if (batch) {
            for (const item of batch) {
                // Trust Supabase data if found. Even if all are same, it might be valid.
                const transl = {
                    pl: item.pl, en: item.en, es: item.es, de: item.de, fr: item.fr
                };
                resultMap[item.pl] = transl;
                localTranslationCache.set(item.pl, transl);
            }
        }
    }

    // 3. Identify Missing or Suspicious
    // We only care about names that were missing locally AND returned no result from Supabase
    const stillMissingNames = missingInLocal.filter(name => !resultMap[name]);

    // LIMIT SUBREQUESTS!
    // Cloudflare has a limit of 50 subrequests.
    // Reduced to 1 to strongly ensure we save budget for Fotmob/Meczyki fetches.
    const MAX_WIKI_FETCHES = 1;
    const namesToFetch = stillMissingNames.slice(0, MAX_WIKI_FETCHES);
    const namesToSkip = stillMissingNames.slice(MAX_WIKI_FETCHES);

    // Fill skipped with fallback immediately & cache locally
    namesToSkip.forEach(name => {
        const fallback = { pl: name, en: name, es: name, de: name, fr: name };
        resultMap[name] = fallback;
        localTranslationCache.set(name, fallback);
    });

    // 4. Fetch Missing from Wikidata (Parallel - Limited)
    const wikiPromises = namesToFetch.map(async (name) => {
        let transl = await fetchFromWikidata(name, ctx);
        if (transl) {
            // STRICT REQUIREMENT: Use the original requested name as 'pl'
            // This ensures we don't "translate Polish to Polish" and guarantees cache hits for this name.
            transl.pl = name;

            resultMap[name] = transl;
            localTranslationCache.set(name, transl);

            // Save to Supabase (Fire and forget - NO CACHE for POST)
            if (env.API_KEY) {
                const saveTask = saveToSupabase(transl, env);
                if (ctx && ctx.waitUntil) ctx.waitUntil(saveTask);
                else await saveTask;
            }
        } else {
            const fallback = { pl: name, en: name, es: name, de: name, fr: name };
            resultMap[name] = fallback;
            localTranslationCache.set(name, fallback);
        }
    });

    await Promise.all(wikiPromises);

    return resultMap;
}

export async function getTeamTranslations(originalName, env, ctx) {
    const map = await getBulkTeamTranslations([originalName], env, ctx);
    return map[originalName];
}


// --- Supabase Helpers ---

async function fetchFromSupabaseBulk(names, env, ctx) {
    if (!env.API_KEY || names.length === 0) return null;

    // Filter: pl=in.("Name1","Name2")
    const filterVal = `(${names.map(n => `"${n.replace(/"/g, '')}"`).join(',')})`;
    const url = `https://bwmkvehxzcdzdxiqdqin.supabase.co/rest/v1/team_names?pl=in.${encodeURIComponent(filterVal)}&select=*`;

    try {
        // USE CACHED FETCH FOR GET
        // Note: URL changes with names combination, so cache key is specific to the batch.
        // This is good for exact same request (e.g. same page load).
        const res = await fetchCached(url, {
            method: "GET",
            headers: {
                "apikey": env.API_KEY,
                "Authorization": `Bearer ${env.API_KEY}`
            }
        }, SUPABASE_TTL, ctx);

        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error("Supabase bulk fetch error:", e);
        return null;
    }
}

async function fetchFromSupabase(name, env) {
    const res = await fetchFromSupabaseBulk([name], env);
    return res ? res[0] : null;
}

async function saveToSupabase(data, env) {
    if (!env.API_KEY) return;

    const url = `https://bwmkvehxzcdzdxiqdqin.supabase.co/rest/v1/team_names`;

    try {
        // POST is never cached by fetchCached (safe)
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "apikey": env.API_KEY,
                "Authorization": `Bearer ${env.API_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            body: JSON.stringify({
                pl: data.pl,
                en: data.en,
                es: data.es,
                de: data.de,
                fr: data.fr
            })
        });
    } catch (e) {
        console.error(`Supabase save error:`, e);
    }
}

// --- Wikidata Helpers ---
function cleanName(name) {
    if (!name) return "";
    return name
        .replace(/(Fútbol|Futbol) Club /gi, 'FC ')
        .replace(/ Club de Fútbol/gi, ' CF')
        .replace(/Real Club Deportivo /gi, 'RCD ')
        .replace(/Real Club /gi, 'RC ')
        .replace(/Unión Deportiva /gi, 'UD ')
        .replace(/Agrupación Deportiva /gi, 'AD ')
        .replace(/ Football Club/gi, ' FC')
        .replace(/ Association Football Club/gi, ' AFC')
        .replace(/Sport-Club /gi, 'SC ')
        .replace(/Sportverein /gi, 'SV ')
        .replace(/Ballspielverein /gi, 'BV ')
        .replace(/Associazione Calcio /gi, 'AC ')
        .replace(/Società Sportiva /gi, 'SS ')
        .replace(/Olympique de /gi, 'O. ')
        .trim();
}

async function fetchFromWikidata(clubName, ctx) {
    try {
        // 1. Search
        const searchUrl = new URL("https://www.wikidata.org/w/api.php");
        searchUrl.searchParams.append("action", "wbsearchentities");
        searchUrl.searchParams.append("search", clubName);
        searchUrl.searchParams.append("language", "pl");
        searchUrl.searchParams.append("format", "json");
        searchUrl.searchParams.append("limit", "1");

        // CACHED FETCH
        const searchRes = await fetchCached(searchUrl.toString(), {
            headers: { "User-Agent": "BarcaLiveAPI/1.0 (https://api.barcalive.online)" }
        }, WIKI_TTL, ctx);

        const searchJson = await searchRes.json();

        if (!searchJson.search || searchJson.search.length === 0) {
            return null;
        }

        const id = searchJson.search[0].id;

        // 2. Details
        const detailsUrl = new URL("https://www.wikidata.org/w/api.php");
        detailsUrl.searchParams.append("action", "wbgetentities");
        detailsUrl.searchParams.append("ids", id);
        detailsUrl.searchParams.append("props", "labels");
        detailsUrl.searchParams.append("languages", "pl|en|es|de|fr");
        detailsUrl.searchParams.append("format", "json");

        // CACHED FETCH
        const detailsRes = await fetchCached(detailsUrl.toString(), {
            headers: { "User-Agent": "BarcaLiveAPI/1.0 (https://api.barcalive.online)" }
        }, WIKI_TTL, ctx);

        const detailsJson = await detailsRes.json();

        const entities = detailsJson.entities;
        if (!entities || !entities[id]) {
            return null;
        }

        const labels = entities[id].labels || {};
        const getLabel = (lang) => labels[lang]?.value;
        const baseName = getLabel('en') || clubName;

        const raw = {
            en: getLabel('en') || baseName,
            pl: getLabel('pl') || clubName,
            es: getLabel('es') || baseName,
            de: getLabel('de') || baseName,
            fr: getLabel('fr') || baseName
        };

        return {
            en: cleanName(raw.en),
            pl: cleanName(raw.pl),
            es: cleanName(raw.es),
            de: cleanName(raw.de),
            fr: cleanName(raw.fr)
        };

    } catch (e) {
        console.error("Wikidata fetch error:", e);
        return null;
    }
}
