import {
  getCachedSeasonsSummary,
  getCachedPlayerStatsSummary,
  getCachedPlayerWealthHistorySummary,
  getCachedPlayerWealthSummary,
  getMarketCatalogSummary,
  getCachedMarketItemSummary,
  getCachedMarketPriceSummary,
  getCachedMarketSeriesSummary,
  findTrackedPlayer,
  getLeaderboard,
  refreshLeaderboardBaseline,
  getTrackerSummary,
  savePlayerStatsSnapshot,
  savePlayerWealthHistorySnapshot,
  savePlayerWealthSnapshot,
  upsertPlayer,
  replaceMarketCatalog,
  writeMarketItemCache,
  writeMarketItemSeriesCache,
  writeMarketItemSummaryCache,
  writeCachedSeasons,
} from './db.js';

const DELTAFORCE_API_BASE = 'https://api.deltaforceapi.com';
const CONNECT_HEADERS = {
  'Connect-Protocol-Version': '1',
  'Content-Type': 'application/json',
};
const PLAYER_STATS_TTL_MS = 20 * 60 * 1000;
const PLAYER_WEALTH_TTL_MS = 20 * 60 * 1000;
const PLAYER_WEALTH_HISTORY_TTL_MS = 3 * 60 * 60 * 1000;
const inflightRefreshes = new Map();

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Cron-Token',
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

function readAuthBearerToken(request) {
  const header = request.headers?.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function readInternalCronToken(request) {
  const headerToken = request.headers?.['x-internal-cron-token'];
  const bearerToken = readAuthBearerToken(request);
  return String(headerToken || bearerToken || '').trim();
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

async function postUpstream(path, body = {}) {
  const response = await fetch(`${DELTAFORCE_API_BASE}${path}`, {
    method: 'POST',
    headers: CONNECT_HEADERS,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}

function getSingleFlightKey(scope, parts = []) {
  return `${scope}:${parts.map((part) => String(part || '')).join(':')}`;
}

async function runSingleFlight(scope, parts, factory) {
  const key = getSingleFlightKey(scope, parts);
  const existing = inflightRefreshes.get(key);
  if (existing) {
    return existing;
  }

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (inflightRefreshes.get(key) === promise) {
        inflightRefreshes.delete(key);
      }
    });

  inflightRefreshes.set(key, promise);
  return promise;
}

function filterHistoryByRange(history = [], range = '30d') {
  const safeHistory = Array.isArray(history) ? history : [];
  const now = Date.now();
  const cutoffMs = range === '24h'
    ? now - (24 * 60 * 60 * 1000)
    : range === '7d'
      ? now - (7 * 24 * 60 * 60 * 1000)
      : now - (30 * 24 * 60 * 60 * 1000);

  return safeHistory.filter((entry) => {
    const rawTime = entry?.time || entry?.createdAt || entry?.updatedAt || entry?.timestamp || '';
    const entryTime = new Date(rawTime).getTime();
    return Number.isFinite(entryTime) && entryTime >= cutoffMs;
  });
}

async function fetchUpstreamPlayer(query = {}) {
  const response = await postUpstream('/deltaforceapi.gateway.v1.ApiService/GetPlayer', query);
  const player = response?.player || response;
  if (!player?.id) {
    throw new Error('Player not found');
  }
  await upsertPlayer(player);
  return player;
}

async function getTrackedPlayer(query = {}) {
  const local = await findTrackedPlayer(query);
  if (local) {
    return {
      player: local,
      source: 'database',
      stale: false,
    };
  }

  const singleFlightParts = [query.id, query.deltaForceId, query.name];
  const player = await runSingleFlight('player-resolve', singleFlightParts, () => fetchUpstreamPlayer(query));
  return {
    player,
    source: 'upstream',
    stale: false,
  };
}

async function getTrackedPlayerStats({ player, seasonId = '', ranked = false } = {}) {
  const cached = await getCachedPlayerStatsSummary({ playerId: player.id, seasonId, ranked });
  if (cached.isFresh && cached.stats) {
    return {
      stats: cached.stats,
      fetchedAt: cached.fetchedAt,
      updatedAt: cached.statsUpdatedAt || cached.stats?.updatedAt || '',
      source: 'database',
      stale: false,
    };
  }

  try {
    const response = await runSingleFlight('player-stats', [player.id, seasonId, ranked], async () => {
      const upstream = await postUpstream('/deltaforceapi.gateway.v1.ApiService/GetPlayerOperationStats', {
        playerId: player.id,
        ...(seasonId ? { seasonId } : {}),
        ...(ranked ? { ranked: true } : {}),
      });
      if (upstream?.stats) {
        await savePlayerStatsSnapshot({
          player,
          seasonId,
          ranked,
          stats: upstream.stats,
        });
      }
      return upstream;
    });

    if (response?.stats) {
      return {
        stats: response.stats,
        fetchedAt: new Date().toISOString(),
        updatedAt: response.stats.updatedAt || '',
        source: 'upstream',
        stale: false,
      };
    }

    throw new Error('No stats found');
  } catch (error) {
    if (cached.stats) {
      return {
        stats: cached.stats,
        fetchedAt: cached.fetchedAt,
        updatedAt: cached.statsUpdatedAt || cached.stats?.updatedAt || '',
        source: 'database',
        stale: true,
      };
    }
    throw error;
  }
}

async function getTrackedPlayerWealth({ player } = {}) {
  const cached = await getCachedPlayerWealthSummary(player.id);
  if (cached.isFresh && cached.stash) {
    return {
      stash: cached.stash,
      fetchedAt: cached.fetchedAt,
      updatedAt: cached.stashUpdatedAt || cached.stash?.updatedAt || cached.stash?.createdAt || '',
      source: 'database',
      stale: false,
    };
  }

  try {
    const response = await runSingleFlight('player-wealth', [player.id], async () => {
      const upstream = await postUpstream('/deltaforceapi.gateway.v1.ApiService/GetPlayerOperationStashValue', {
        playerId: player.id,
      });
      if (upstream?.stash) {
        await savePlayerWealthSnapshot({
          player,
          stash: upstream.stash,
        });
      }
      return upstream;
    });

    if (response?.stash) {
      return {
        stash: response.stash,
        fetchedAt: new Date().toISOString(),
        updatedAt: response.stash.updatedAt || response.stash.createdAt || '',
        source: 'upstream',
        stale: false,
      };
    }

    throw new Error('No wealth data found');
  } catch (error) {
    if (cached.stash) {
      return {
        stash: cached.stash,
        fetchedAt: cached.fetchedAt,
        updatedAt: cached.stashUpdatedAt || cached.stash?.updatedAt || cached.stash?.createdAt || '',
        source: 'database',
        stale: true,
      };
    }
    throw error;
  }
}

async function getTrackedPlayerWealthHistory({ player, range = '30d' } = {}) {
  const cached = await getCachedPlayerWealthHistorySummary(player.id);
  if (cached.isFresh && Array.isArray(cached.history) && cached.history.length) {
    return {
      history: filterHistoryByRange(cached.history, range),
      fetchedAt: cached.fetchedAt,
      updatedAt: cached.latestEntryAt || '',
      source: 'database',
      stale: false,
    };
  }

  try {
    const response = await runSingleFlight('player-wealth-history', [player.id], async () => {
      const now = new Date();
      const startTime = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const upstream = await postUpstream('/deltaforceapi.gateway.v1.ApiService/GetPlayerOperationHistoricalStashValue', {
        playerId: player.id,
        pageSize: 200,
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
      });
      const history = upstream?.historicalStashValues || upstream?.stashes || upstream?.historicalStashValue || upstream?.series || [];
      if (Array.isArray(history) && history.length) {
        await savePlayerWealthHistorySnapshot({
          player,
          history,
        });
      }
      return history;
    });

    if (Array.isArray(response)) {
      return {
        history: filterHistoryByRange(response, range),
        fetchedAt: new Date().toISOString(),
        updatedAt: response[response.length - 1]?.updatedAt || response[response.length - 1]?.createdAt || response[response.length - 1]?.time || '',
        source: 'upstream',
        stale: false,
      };
    }

    throw new Error('No wealth history found');
  } catch (error) {
    if (Array.isArray(cached.history) && cached.history.length) {
      return {
        history: filterHistoryByRange(cached.history, range),
        fetchedAt: cached.fetchedAt,
        updatedAt: cached.latestEntryAt || '',
        source: 'database',
        stale: true,
      };
    }
    throw error;
  }
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

    if (request.method === 'GET' && pathname === '/tracker-api/player/resolve') {
      const payload = await getTrackedPlayer({
        id: url.searchParams.get('id') || '',
        deltaForceId: url.searchParams.get('deltaForceId') || '',
        name: url.searchParams.get('name') || '',
      });
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && pathname === '/tracker-api/player/stats') {
      const player = await getTrackedPlayer({
        id: url.searchParams.get('playerId') || url.searchParams.get('id') || '',
      });
      const payload = await getTrackedPlayerStats({
        player: player.player,
        seasonId: url.searchParams.get('seasonId') || '',
        ranked: parseBooleanParam(url.searchParams.get('ranked')),
      });
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && pathname === '/tracker-api/player/wealth') {
      const player = await getTrackedPlayer({
        id: url.searchParams.get('playerId') || url.searchParams.get('id') || '',
      });
      const payload = await getTrackedPlayerWealth({
        player: player.player,
      });
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && pathname === '/tracker-api/player/wealth-history') {
      const player = await getTrackedPlayer({
        id: url.searchParams.get('playerId') || url.searchParams.get('id') || '',
      });
      const payload = await getTrackedPlayerWealthHistory({
        player: player.player,
        range: url.searchParams.get('range') || '30d',
      });
      sendJson(response, 200, payload);
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

    if (request.method === 'POST' && pathname === '/tracker-api/leaderboard/refresh') {
      const requiredToken = process.env.INTERNAL_CRON_TOKEN || '';
      if (requiredToken) {
        const requestToken = readInternalCronToken(request);
        if (!requestToken || requestToken !== requiredToken) {
          sendJson(response, 401, {
            ok: false,
            error: 'Unauthorized',
          });
          return;
        }
      }

      const body = await readJsonBody(request);
      const payload = await refreshLeaderboardBaseline({
        metric: body.metric || url.searchParams.get('metric') || 'rankedPoints',
        seasonId: body.seasonId || url.searchParams.get('seasonId') || '',
        ranked: parseBooleanParam(
          typeof body.ranked === 'undefined' ? url.searchParams.get('ranked') : body.ranked,
        ),
        limit: Number(body.limit || url.searchParams.get('limit') || 200),
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

    if (request.method === 'GET' && pathname === '/tracker-api/market/items') {
      const language = url.searchParams.get('language') || 'LANGUAGE_EN';
      const search = url.searchParams.get('search') || '';
      const pageToken = url.searchParams.get('pageToken') || '';
      const pageSize = Number(url.searchParams.get('pageSize') || 10);
      let catalog = await getMarketCatalogSummary({ language, search, pageToken, pageSize });

      if (!catalog.isFresh || !catalog.items.length) {
        try {
          await runSingleFlight('market-catalog', [language], async () => {
            let nextPageToken = '';
            const allItems = [];

            do {
              const upstream = await postUpstream('/deltaforceapi.gateway.v1.ApiService/ListAuctionItems', {
                filter: '',
                pageToken: nextPageToken,
                pageSize: 100,
                language,
              });
              const pageItems = upstream.items || upstream.auctionItems || [];
              allItems.push(...pageItems);
              nextPageToken = upstream.nextPageToken || '';
            } while (nextPageToken);

            const fetchedAt = new Date().toISOString();
            await replaceMarketCatalog(language, allItems, fetchedAt);
          });

          catalog = await getMarketCatalogSummary({ language, search, pageToken, pageSize });
          sendJson(response, 200, {
            items: catalog.items,
            nextPageToken: catalog.nextPageToken,
            totalSize: catalog.totalSize,
            fetchedAt: catalog.fetchedAt,
            source: 'upstream',
            stale: false,
          });
          return;
        } catch (error) {
          if (catalog.items.length || catalog.fetchedAt) {
            sendJson(response, 200, {
              items: catalog.items,
              nextPageToken: catalog.nextPageToken,
              totalSize: catalog.totalSize,
              fetchedAt: catalog.fetchedAt,
              source: 'database',
              stale: true,
            });
            return;
          }
          throw error;
        }
      }

      sendJson(response, 200, {
        items: catalog.items,
        nextPageToken: catalog.nextPageToken,
        totalSize: catalog.totalSize,
        fetchedAt: catalog.fetchedAt,
        source: 'database',
        stale: false,
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/tracker-api/market/item') {
      const itemId = url.searchParams.get('itemId') || '';
      const language = url.searchParams.get('language') || 'LANGUAGE_EN';
      const cached = await getCachedMarketItemSummary(itemId, language);

      if (cached.isFresh && cached.item) {
        sendJson(response, 200, {
          item: cached.item,
          fetchedAt: cached.fetchedAt,
          source: 'database',
          stale: false,
        });
        return;
      }

      try {
        const upstream = await runSingleFlight('market-item', [itemId, language], () => (
          postUpstream('/deltaforceapi.gateway.v1.ApiService/GetAuctionItem', { id: itemId, language })
        ));
        const item = upstream.item || upstream;
        const fetchedAt = new Date().toISOString();
        await writeMarketItemCache(itemId, language, item, fetchedAt);
        sendJson(response, 200, {
          item,
          fetchedAt,
          source: 'upstream',
          stale: false,
        });
        return;
      } catch (error) {
        if (cached.item) {
          sendJson(response, 200, {
            item: cached.item,
            fetchedAt: cached.fetchedAt,
            source: 'database',
            stale: true,
          });
          return;
        }
        throw error;
      }
    }

    if (request.method === 'GET' && pathname === '/tracker-api/market/item-summary') {
      const itemId = url.searchParams.get('itemId') || '';
      const language = url.searchParams.get('language') || 'LANGUAGE_EN';
      const cached = await getCachedMarketPriceSummary(itemId, language);

      if (cached.isFresh && cached.summary) {
        sendJson(response, 200, {
          ...cached.summary,
          fetchedAt: cached.fetchedAt,
          source: 'database',
          stale: false,
        });
        return;
      }

      try {
        const [latestPriceData, baselineData] = await runSingleFlight('market-item-summary', [itemId, language], async () => {
          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return Promise.all([
            postUpstream('/deltaforceapi.gateway.v1.ApiService/GetAuctionItemPrices', {
              auctionItemId: itemId,
              pageSize: 1,
              orderBy: 'created_at desc',
              startTime: oneDayAgo.toISOString(),
              endTime: now.toISOString(),
              language,
            }),
            postUpstream('/deltaforceapi.gateway.v1.ApiService/GetAuctionItemPriceSeries', {
              auctionItemId: itemId,
              startTime: sevenDaysAgo.toISOString(),
              endTime: now.toISOString(),
              interval: 'INTERVAL_DAY',
              language,
            }),
          ]);
        });

        const latestPrice = latestPriceData.prices?.[0] || latestPriceData.auctionItemPrices?.[0] || latestPriceData.items?.[0] || {};
        const baselineSeries = baselineData.priceSeries || baselineData.series || baselineData.prices || [];
        const values = baselineSeries
          .map((entry) => Number(entry.priceAverage || entry.priceAvg || entry.average || entry.avg || 0))
          .filter((value) => value > 0)
          .sort((a, b) => a - b);
        const middleIndex = Math.floor(values.length / 2);
        const marketBaseline7d = values.length === 0
          ? 0
          : (values.length % 2 === 0 ? (values[middleIndex - 1] + values[middleIndex]) / 2 : values[middleIndex]);
        const summary = {
          latestPrice,
          price: Number(latestPrice.price || 0),
          marketBaseline7d: Number(marketBaseline7d || 0),
        };
        const fetchedAt = new Date().toISOString();
        await writeMarketItemSummaryCache(itemId, language, summary, fetchedAt);
        sendJson(response, 200, {
          ...summary,
          fetchedAt,
          source: 'upstream',
          stale: false,
        });
        return;
      } catch (error) {
        if (cached.summary) {
          sendJson(response, 200, {
            ...cached.summary,
            fetchedAt: cached.fetchedAt,
            source: 'database',
            stale: true,
          });
          return;
        }
        throw error;
      }
    }

    if (request.method === 'GET' && pathname === '/tracker-api/market/item-series') {
      const itemId = url.searchParams.get('itemId') || '';
      const language = url.searchParams.get('language') || 'LANGUAGE_EN';
      const days = Number(url.searchParams.get('days') || 1);
      const cached = await getCachedMarketSeriesSummary(itemId, language, days);

      if (cached.isFresh && cached.payload) {
        sendJson(response, 200, {
          ...cached.payload,
          fetchedAt: cached.fetchedAt,
          source: 'database',
          stale: false,
        });
        return;
      }

      try {
        const upstream = await runSingleFlight('market-item-series', [itemId, language, days], async () => {
          const now = new Date();
          const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          const interval = days <= 3 ? 'INTERVAL_HOUR' : 'INTERVAL_DAY';
          return postUpstream('/deltaforceapi.gateway.v1.ApiService/GetAuctionItemPriceSeries', {
            auctionItemId: itemId,
            startTime: startTime.toISOString(),
            endTime: now.toISOString(),
            interval,
            language,
          });
        });
        const payload = {
          priceSeries: upstream.priceSeries || upstream.series || upstream.prices || [],
        };
        const fetchedAt = new Date().toISOString();
        await writeMarketItemSeriesCache(itemId, language, days, payload, fetchedAt);
        sendJson(response, 200, {
          ...payload,
          fetchedAt,
          source: 'upstream',
          stale: false,
        });
        return;
      } catch (error) {
        if (cached.payload) {
          sendJson(response, 200, {
            ...cached.payload,
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
