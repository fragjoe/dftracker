const TRACKER_API_BASE = '/tracker-api';

import {
  getAuctionItem,
  getAuctionItemPriceSeries,
  getAuctionItemPrices,
  getPlayer,
  getPlayerOperationHistoricalStashValue,
  getPlayerOperationStashValue,
  getPlayerOperationStats,
  listAuctionItems,
  listSeasons,
} from './client.js';

function getTrackerUrl(path) {
  const baseOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';
  return new URL(`${TRACKER_API_BASE}${path}`, baseOrigin).toString();
}

function canUseTrackerNetwork() {
  if (typeof fetch !== 'function') return false;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
    return false;
  }
  return true;
}

function canUseMockClientFallback() {
  return !canUseTrackerNetwork();
}

async function postTrackerData(path, payload) {
  if (!canUseTrackerNetwork()) {
    return null;
  }

  try {
    const response = await fetch(getTrackerUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    return null;
  }
}

function getRangeStartIso(range = '30d') {
  const now = Date.now();
  const offsetMs = range === '24h'
    ? 24 * 60 * 60 * 1000
    : range === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now - offsetMs).toISOString();
}

export function persistTrackedPlayerProfile(player) {
  if (!player?.id) return Promise.resolve(null);
  return postTrackerData('/players/sync-profile', { player })
    .catch(() => null);
}

export function persistTrackedPlayerStats({ player, seasonId = '', ranked = false, stats }) {
  if (!player?.id || !stats) return Promise.resolve(null);
  return postTrackerData('/players/sync-stats', {
    player,
    seasonId,
    ranked,
    stats,
  })
    .catch(() => null);
}

export function persistTrackedPlayerWealth({ player, stash }) {
  if (!player?.id || !stash) return Promise.resolve(null);
  return postTrackerData('/players/sync-wealth', {
    player,
    stash,
  })
    .catch(() => null);
}

export function persistTrackedPlayerWealthHistory({ player, history }) {
  if (!player?.id || !Array.isArray(history)) return Promise.resolve(null);
  return postTrackerData('/players/sync-wealth-history', {
    player,
    history,
  })
    .catch(() => null);
}

export async function fetchTrackedLeaderboard({ metric = 'rankedPoints', seasonId = '', ranked = null, limit = 50 } = {}) {
  if (!canUseTrackerNetwork()) {
    return {
      items: [],
      totalSize: 0,
      metric,
      seasonId,
      ranked,
      source: 'browser',
      stale: true,
    };
  }

  const params = new URLSearchParams({
    metric,
    limit: String(limit),
  });
  if (seasonId) params.set('seasonId', seasonId);
  if (typeof ranked === 'boolean') params.set('ranked', ranked ? 'true' : 'false');

  try {
    const response = await fetch(getTrackerUrl(`/leaderboard?${params.toString()}`));
    if (!response.ok) {
      throw new Error(`Leaderboard request failed (${response.status})`);
    }

    const payload = await response.json();
    return {
      ...payload,
      source: payload.source || 'server',
    };
  } catch (error) {
    return {
      items: [],
      totalSize: 0,
      metric,
      seasonId,
      ranked,
      source: 'browser',
      stale: true,
    };
  }
}

export async function fetchTrackedPlayer({ id = '', deltaForceId = '', name = '' } = {}) {
  try {
    if (canUseTrackerNetwork()) {
      const params = new URLSearchParams();
      if (id) params.set('id', id);
      if (deltaForceId) params.set('deltaForceId', deltaForceId);
      if (name) params.set('name', name);

      const response = await fetch(getTrackerUrl(`/player/resolve?${params.toString()}`));
      if (response.ok) {
        return response.json();
      }
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Player resolve request failed');
  }

  const payload = await getPlayer({ id, deltaForceId, name });
  return {
    player: payload?.player || payload || null,
    source: 'upstream',
    stale: false,
  };
}

export async function fetchTrackedPlayerStats({ playerId = '', seasonId = '', ranked = false } = {}) {
  try {
    if (canUseTrackerNetwork()) {
      const params = new URLSearchParams({
        playerId,
        seasonId,
        ranked: ranked ? 'true' : 'false',
      });

      const response = await fetch(getTrackerUrl(`/player/stats?${params.toString()}`));
      if (response.ok) {
        return response.json();
      }
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Player stats request failed');
  }

  return getPlayerOperationStats(playerId, { seasonId, ranked });
}

export async function fetchTrackedPlayerWealth({ playerId = '' } = {}) {
  try {
    if (canUseTrackerNetwork()) {
      const params = new URLSearchParams({ playerId });
      const response = await fetch(getTrackerUrl(`/player/wealth?${params.toString()}`));
      if (response.ok) {
        return response.json();
      }
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Player wealth request failed');
  }

  try {
    return await getPlayerOperationStashValue(playerId);
  } catch (error) {
    return getPlayerOperationStashValue(playerId);
  }
}

export async function fetchTrackedPlayerWealthHistory({ playerId = '', range = '30d' } = {}) {
  try {
    if (canUseTrackerNetwork()) {
      const params = new URLSearchParams({ playerId, range });
      const response = await fetch(getTrackerUrl(`/player/wealth-history?${params.toString()}`));
      if (response.ok) {
        return response.json();
      }
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Player wealth history request failed');
  }

  const payload = await getPlayerOperationHistoricalStashValue(playerId, {
    pageSize: 50,
    startTime: getRangeStartIso(range),
    endTime: new Date().toISOString(),
  });
  return {
    history: payload?.historicalStashValues || payload?.stashes || payload?.historicalStashValue || payload?.series || [],
    source: 'upstream',
    stale: false,
  };
}

export async function fetchTrackedSeasons({ pageSize = 50, pageToken = '', language = '' } = {}) {
  try {
    if (canUseTrackerNetwork()) {
      const params = new URLSearchParams({
        pageSize: String(pageSize),
        pageToken,
      });

      if (language) {
        params.set('language', language);
      }

      const response = await fetch(getTrackerUrl(`/seasons?${params.toString()}`));
      if (response.ok) {
        const payload = await response.json();
        return {
          seasons: payload.seasons || [],
          fetchedAt: payload.fetchedAt || '',
          source: payload.source || 'database',
          stale: Boolean(payload.stale),
        };
      }
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    return { seasons: [], fetchedAt: '', source: 'browser', stale: true };
  }

  const payload = await listSeasons({ pageSize, pageToken, language });
  return {
    seasons: payload.seasons || [],
    fetchedAt: '',
    source: 'upstream',
    stale: false,
  };
}

export async function fetchTrackedMarketItems({ filter = '', search = '', pageToken = '', pageSize = 10, language = '' } = {}) {
  try {
    if (!canUseTrackerNetwork()) {
      throw new Error('Tracker network unavailable');
    }
    const params = new URLSearchParams({
      filter,
      search,
      pageToken,
      pageSize: String(pageSize),
    });
    if (language) {
      params.set('language', language);
    }

    const response = await fetch(getTrackerUrl(`/market/items?${params.toString()}`));
    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Market items request failed');
  }

  return listAuctionItems({ filter, pageToken, pageSize, language });
}

export async function fetchTrackedMarketItem({ itemId = '', language = '' } = {}) {
  try {
    if (!canUseTrackerNetwork()) {
      throw new Error('Tracker network unavailable');
    }
    const params = new URLSearchParams({ itemId });
    if (language) {
      params.set('language', language);
    }

    const response = await fetch(getTrackerUrl(`/market/item?${params.toString()}`));
    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Market item request failed');
  }

  return getAuctionItem(itemId, language);
}

export async function fetchTrackedMarketItemSummary({ itemId = '', language = '' } = {}) {
  try {
    if (!canUseTrackerNetwork()) {
      throw new Error('Tracker network unavailable');
    }
    const params = new URLSearchParams({ itemId });
    if (language) {
      params.set('language', language);
    }

    const response = await fetch(getTrackerUrl(`/market/item-summary?${params.toString()}`));
    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Market item summary request failed');
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [latestPriceData, baselineData] = await Promise.all([
    getAuctionItemPrices(itemId, {
      pageSize: 1,
      orderBy: 'created_at desc',
      startTime: oneDayAgo.toISOString(),
      endTime: now.toISOString(),
      language,
    }),
    getAuctionItemPriceSeries(itemId, {
      startTime: sevenDaysAgo.toISOString(),
      endTime: now.toISOString(),
      interval: 'INTERVAL_DAY',
      language,
    }),
  ]);
  return {
    latestPrice: latestPriceData.prices?.[0] || {},
    price: Number(latestPriceData.prices?.[0]?.price || 0),
    marketBaseline7d: Number(baselineData.priceSeries?.[0]?.priceAverage || 0),
  };
}

export async function fetchTrackedMarketItemSeries({ itemId = '', days = 1, language = '' } = {}) {
  try {
    if (!canUseTrackerNetwork()) {
      throw new Error('Tracker network unavailable');
    }
    const params = new URLSearchParams({
      itemId,
      days: String(days),
    });
    if (language) {
      params.set('language', language);
    }

    const response = await fetch(getTrackerUrl(`/market/item-series?${params.toString()}`));
    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    // Fall through to direct client fallback for tests and offline local mocks.
  }

  if (!canUseMockClientFallback()) {
    throw new Error('Market item series request failed');
  }

  const now = new Date();
  const startTime = new Date(now.getTime() - (Number(days || 1) * 24 * 60 * 60 * 1000));
  return getAuctionItemPriceSeries(itemId, {
    startTime: startTime.toISOString(),
    endTime: now.toISOString(),
    interval: Number(days) <= 3 ? 'INTERVAL_HOUR' : 'INTERVAL_DAY',
    language,
  });
}
