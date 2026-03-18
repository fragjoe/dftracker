import http from 'node:http';
import { getLeaderboard, getTrackerSummary, savePlayerStatsSnapshot, savePlayerWealthHistorySnapshot, savePlayerWealthSnapshot, upsertPlayer } from './db.js';

const PORT = Number(process.env.DFTRACKER_API_PORT || 3001);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
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

function parseBooleanParam(value, defaultValue = false) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return defaultValue;
  }

  return value === 'true' || value === '1' || value === true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.method === 'GET' && url.pathname === '/tracker-api/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'dftracker-storage',
        ...getTrackerSummary(),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/tracker-api/leaderboard') {
      const payload = getLeaderboard({
        metric: url.searchParams.get('metric') || 'rankedPoints',
        seasonId: url.searchParams.get('seasonId') || '',
        ranked: parseBooleanParam(url.searchParams.get('ranked')),
        limit: Number(url.searchParams.get('limit') || 50),
      });
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/tracker-api/players/sync-profile') {
      const body = await readJsonBody(request);
      const player = upsertPlayer(body.player);
      sendJson(response, 200, { ok: true, player });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/tracker-api/players/sync-stats') {
      const body = await readJsonBody(request);
      const result = savePlayerStatsSnapshot(body);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/tracker-api/players/sync-wealth') {
      const body = await readJsonBody(request);
      const result = savePlayerWealthSnapshot(body);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/tracker-api/players/sync-wealth-history') {
      const body = await readJsonBody(request);
      const result = savePlayerWealthHistorySnapshot(body);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: 'Not Found',
      path: url.pathname,
    });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error.message || 'Unknown error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`DFtracker storage API listening on http://localhost:${PORT}`);
});
