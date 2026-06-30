import { refreshMarketCatalogs, refreshSeasons, sendJson } from '../../server/handler.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const type = url.searchParams.get('type') || 'all';
  const force = url.searchParams.get('force') === 'true';
  const secret = url.searchParams.get('secret') || '';

  // Simple protection - change this secret to something unique
  // Remove this endpoint after use
  const VALID_SECRET = 'dftracker-refresh';
  if (!secret || secret !== VALID_SECRET) {
    sendJson(response, 403, {
      ok: false,
      error: 'Invalid or missing secret parameter',
      hint: 'Use ?secret=dftracker-refresh'
    });
    return;
  }

  try {
    const results = {};

    if (type === 'all' || type === 'market') {
      results.market = await refreshMarketCatalogs({ force: true });
    }

    if (type === 'all' || type === 'seasons') {
      results.seasons = await refreshSeasons({ force: true });
    }

    sendJson(response, 200, {
      ok: true,
      refreshedAt: new Date().toISOString(),
      type,
      force,
      results,
      note: 'Remove this endpoint after use for security'
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to refresh',
    });
  }
}
