# BarcaLive API

A high-performance API providing real-time match data, schedules, and TV listings for FC Barcelona.

## Base URL

```
https://api.barcalive.online
```

## Endpoints

The API uses a single query parameter `data` to return different types of information.

### 1. Match Data

Get live scores, scheduled matches, and finished games.

- **URL:** `/?data=match&iso=PL`
- **Parameters:**
  - `data=match` (Required)
  - `iso` (Required): Two-letter ISO country code (e.g., `PL`, `ES`, `GB`). Used for TV listings and localization.

#### Response Example
```json
{
  "matches": {
    "live": [],
    "upcoming": [
      {
        "id": "12345",
        "startTime": "2024-05-20T19:00:00.000Z",
        "status": "not_started",
        "appStatus": "SCHEDULED",
        "competition": { "displayName": "La Liga" },
        "home": { "name": { "en": "FC Barcelona" }, "crest": "..." },
        "away": { "name": { "en": "Real Madrid" }, "crest": "..." },
        "tv": {
          "stations": ["Canal+ Sport", "Eleven Sports"],
          "country": "PL"
        }
      }
    ],
    "finished": []
  }
}
```

### 2. Next Match

Get details about the next scheduled match.

- **URL:** `/?data=next`
- **Parameters:**
  - `data=next` (Required)
  - `iso` (Optional)

### 3. Previous Match

Get details about the last finished match.

- **URL:** `/?data=prev`
- **Parameters:**
  - `data=prev` (Required)
  - `iso` (Optional)

### 4. Standings (La Liga)

Get current La Liga table.

- **URL:** `/?data=laliga`
- **Parameters:**
  - `data=laliga` (Required)

### 5. Standings (Champions League)

Get current Champions League group/league stage table.

- **URL:** `/?data=ucl`
- **Parameters:**
  - `data=ucl` (Required)

## Error Handling

If an error occurs, the API returns a JSON object with an `error` field and a corresponding HTTP status code (usually 400 or 500).

```json
{
  "error": "Missing 'data' parameter. Available: match, next, prev, laliga, ucl"
}
```

## Deployment

To deploy this worker to Cloudflare:

```bash

## Troubleshooting Deployment

### "Missing entry-point" Error (Cloudflare Pages / Git Integration)
If you see an error like `[ERROR] Missing entry-point to Worker script`, it means Cloudflare is trying to build from the root of your repository, but the Worker code is in a subdirectory.

**To fix this:**
1. Go to your Cloudflare Dashboard.
2. Navigate to **Workers & Pages** > Select your project > **Settings** > **Build & Deploy**.
3. Under **Build configuration**, click **Edit**.
4. set **Root Directory** to the folder name where this `wrangler.jsonc` file is located (e.g., `BarcaLive API`).
5. Save and Retry deployment.

