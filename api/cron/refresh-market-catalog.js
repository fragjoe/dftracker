import { refreshMarketCatalogs, sendJson } from '../../server/handler.js';

function readBearerToken(request) {
  const header = request.headers?.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const expectedToken = process.env.CRON_SECRET || process.env.INTERNAL_CRON_TOKEN || '';
  if (!expectedToken) {
    sendJson(response, 503, { ok: false, error: 'Cron token is not configured' });
    return;
  }

  const providedToken = readBearerToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    sendJson(response, 401, { ok: false, error: 'Unauthorized' });
    return;
  }

  const baseUrl = request.headers?.host
    ? `https://${request.headers.host}`
    : 'https://dftracker.vercel.app';
  const url = new URL(request.url || '/api/cron/refresh-market-catalog', baseUrl);
  const force = url.searchParams.get('force') === 'true';

  try {
    const result = await refreshMarketCatalogs({ force });
    sendJson(response, 200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to refresh market catalog',
    });
  }
}
