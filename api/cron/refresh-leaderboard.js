const METRICS = [
  'rankedPoints',
  'kdRatio',
  'extractionRate',
  'totalKills',
  'matchesPlayed',
  'playTime',
  'extractedAssets',
];

async function postRefresh(baseUrl, token, payload) {
  const response = await fetch(`${baseUrl}/tracker-api/leaderboard/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Cron-Token': token,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`refresh failed (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { ok: true, raw: text };
  }
}

function getBaseUrl(request) {
  const host = request.headers?.host || '';
  if (host) {
    const proto = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    return `${proto}://${host}`;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://127.0.0.1:3001';
}

function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET || '';
  const internalToken = process.env.INTERNAL_CRON_TOKEN || '';
  const authHeader = String(request.headers?.authorization || '');
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch ? bearerMatch[1].trim() : '';
  const headerToken = String(request.headers?.['x-internal-cron-token'] || '').trim();

  if (cronSecret && (bearerToken === cronSecret || headerToken === cronSecret)) {
    return true;
  }

  if (internalToken && (bearerToken === internalToken || headerToken === internalToken)) {
    return true;
  }

  return !cronSecret && !internalToken;
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.statusCode = 405;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  if (!isAuthorized(request)) {
    response.statusCode = 401;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    return;
  }

  const token = process.env.INTERNAL_CRON_TOKEN || process.env.CRON_SECRET || '';
  if (!token) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      ok: false,
      error: 'Missing INTERNAL_CRON_TOKEN or CRON_SECRET',
    }));
    return;
  }

  const baseUrl = getBaseUrl(request);

  try {
    const seasonsResponse = await fetch(`${baseUrl}/tracker-api/seasons?pageSize=50&language=LANGUAGE_EN`);
    const seasonsPayload = await seasonsResponse.json();
    const seasons = Array.isArray(seasonsPayload?.seasons) ? seasonsPayload.seasons : [];
    const activeSeason = seasons.find((season) => season?.active) || seasons[0] || null;
    const seasonId = activeSeason?.id || '';

    const jobs = [];
    for (const metric of METRICS) {
      jobs.push({ metric, seasonId, ranked: true, limit: 200 });
      jobs.push({ metric, seasonId, ranked: false, limit: 200 });
    }

    const results = [];
    for (const job of jobs) {
      const result = await postRefresh(baseUrl, token, job);
      results.push({
        metric: job.metric,
        seasonId: job.seasonId,
        ranked: job.ranked,
        baseline: result?.baseline || null,
      });
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      ok: true,
      seasonId,
      refreshed: results.length,
      results,
      ranAt: new Date().toISOString(),
    }));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      ok: false,
      error: error?.message || 'Unexpected error',
    }));
  }
}
