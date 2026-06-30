import { refreshMarketCatalogs, refreshSeasons, sendJson } from '../../server/handler.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const type = url.searchParams.get('type') || 'all';
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
    // Chunked refresh support
    const chunkParam = url.searchParams.get('chunk');
    const chunkIndex = chunkParam !== null ? parseInt(chunkParam, 10) : -1;

    const results = {};

    if (type === 'all' || type === 'market') {
      if (chunkIndex >= 0) {
        results.market = await refreshMarketCatalogs({ languages: ['LANGUAGE_EN'], force: true, chunkIndex });
      } else {
        results.market = await refreshMarketCatalogs({ force: true });
      }
    }

    if (type === 'all' || type === 'seasons') {
      results.seasons = await refreshSeasons({ force: true });
    }

    sendJson(response, 200, {
      ok: true,
      refreshedAt: new Date().toISOString(),
      type,
      chunk: chunkIndex,
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
