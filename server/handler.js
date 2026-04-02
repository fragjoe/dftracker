import {
  getCachedSeasonsSummary,
  getLeaderboard,
  getTrackerSummary,
  savePlayerStatsSnapshot,
  savePlayerWealthHistorySnapshot,
  savePlayerWealthSnapshot,
  upsertPlayer,
  writeCachedSeasons,
} from './db.js';

const DELTAFORCE_API_BASE = 'https://api.deltaforceapi.com';
const CONNECT_HEADERS = {
  'Connect-Protocol-Version': '1',
  'Content-Type': 'application/json',
};
const SEASON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

export function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') {
    return Promise.resolve(request.body);
  }

  return new Promise((resolve, reject) => {
    let rawBody = '';

    request.on('data', (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });
}

export function parseBooleanParam(value, defaultValue = false) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return defaultValue;
  }

  return value === 'true' || value === '1' || value === true;
}

function normalizeTrackerPath(pathname = '') {
  if (pathname.startsWith('/api/tracker-api/')) {
    return pathname.replace(/^\/api/, '');
  }
  if (pathname === '/api/tracker-api') {
    return '/tracker-api';
  }
  return pathname;
}

async function fetchUpstreamSeasons({ pageSize = 50, pageToken = '', language = 'LANGUAGE_EN' } = {}) {
  const response = await fetch(`${DELTAFORCE_API_BASE}/deltaforceapi.gateway.v1.ApiService/ListSeasons`, {
    method: 'POST',
    headers: CONNECT_HEADERS,
    body: JSON.stringify({ language, pageSize, pageToken }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function handleTrackerRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const rewrittenPath = url.searchParams.get('path');
  const pathname = normalizeTrackerPath(
    rewrittenPath ? `/tracker-api/${String(rewrittenPath).replace(/^\/+/, '')}` : url.pathname,
  );

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.method === 'GET' && pathname === '/tracker-api/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'dftracker-storage',
        ...(await getTrackerSummary()),
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/tracker-api/leaderboard') {
      const payload = await getLeaderboard({
        metric: url.searchParams.get('metric') || 'rankedPoints',
        seasonId: url.searchParams.get('seasonId') || '',
        ranked: parseBooleanParam(url.searchParams.get('ranked')),
        limit: Number(url.searchParams.get('limit') || 50),
      });
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && pathname === '/tracker-api/seasons') {
      const language = url.searchParams.get('language') || 'LANGUAGE_EN';
      const cached = await getCachedSeasonsSummary();
      const shouldRefresh = !cached.seasons.length || !cached.isFresh;

      if (!shouldRefresh) {
        sendJson(response, 200, {
          seasons: cached.seasons,
          fetchedAt: cached.fetchedAt,
          source: 'database',
          stale: false,
        });
        return;
      }

      try {
        const upstream = await fetchUpstreamSeasons({
          pageSize: Number(url.searchParams.get('pageSize') || 50),
          pageToken: url.searchParams.get('pageToken') || '',
          language,
        });

        const fetchedAt = new Date().toISOString();
        const seasons = Array.isArray(upstream?.seasons) ? upstream.seasons : [];
        await writeCachedSeasons(seasons, fetchedAt);

        sendJson(response, 200, {
          seasons,
          fetchedAt,
          source: 'upstream',
          stale: false,
        });
        return;
      } catch (error) {
        if (cached.seasons.length) {
          sendJson(response, 200, {
            seasons: cached.seasons,
            fetchedAt: cached.fetchedAt,
            source: 'database',
            stale: true,
          });
          return;
        }

        throw error;
      }
    }

    if (request.method === 'POST' && pathname === '/tracker-api/players/sync-profile') {
      const body = await readJsonBody(request);
      const player = await upsertPlayer(body.player);
      sendJson(response, 200, { ok: true, player });
      return;
    }

    if (request.method === 'POST' && pathname === '/tracker-api/players/sync-stats') {
      const body = await readJsonBody(request);
      const result = await savePlayerStatsSnapshot(body);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === 'POST' && pathname === '/tracker-api/players/sync-wealth') {
      const body = await readJsonBody(request);
      const result = await savePlayerWealthSnapshot(body);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === 'POST' && pathname === '/tracker-api/players/sync-wealth-history') {
      const body = await readJsonBody(request);
      const result = await savePlayerWealthHistorySnapshot(body);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: 'Not Found',
      path: pathname,
    });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error.message || 'Unknown error',
    });
  }
}
