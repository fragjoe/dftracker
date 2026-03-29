import {
  getLeaderboard,
  getTrackerSummary,
  savePlayerStatsSnapshot,
  savePlayerWealthHistorySnapshot,
  savePlayerWealthSnapshot,
  upsertPlayer,
} from './db.js';

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
  return pathname;
}

export async function handleTrackerRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = normalizeTrackerPath(url.pathname);

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
