const TRACKER_API_BASE = '/tracker-api';
const TRACKER_STORAGE_KEY = 'dftracker_tracker_store_v1';

async function postTrackerData(path, payload) {
  if (typeof fetch !== 'function') {
    return null;
  }

  try {
    const response = await fetch(`${TRACKER_API_BASE}${path}`, {
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

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readLocalTrackerStore() {
  if (!canUseLocalStorage()) {
    return {
      players: {},
      statsSnapshots: {},
      wealthSnapshots: {},
      wealthHistorySnapshots: {},
    };
  }

  try {
    return {
      players: {},
      statsSnapshots: {},
      wealthSnapshots: {},
      wealthHistorySnapshots: {},
      ...JSON.parse(localStorage.getItem(TRACKER_STORAGE_KEY) || '{}'),
    };
  } catch (error) {
    return {
      players: {},
      statsSnapshots: {},
      wealthSnapshots: {},
      wealthHistorySnapshots: {},
    };
  }
}

function writeLocalTrackerStore(store) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(store));
}

function normalizePlayer(player = {}) {
  if (!player?.id) return null;
  const now = new Date().toISOString();
  return {
    id: String(player.id),
    deltaForceId: String(player.deltaForceId || ''),
    name: String(player.name || player.deltaForceId || player.id),
    levelOperations: Number.isFinite(Number(player.levelOperations))
      ? Number(player.levelOperations)
      : null,
    registeredAt: player.registeredAt ? String(player.registeredAt) : '',
    firstSeenAt: player.firstSeenAt || now,
    lastSeenAt: now,
  };
}

function upsertLocalPlayer(player) {
  const normalized = normalizePlayer(player);
  if (!normalized) return null;

  const store = readLocalTrackerStore();
  const existing = store.players[normalized.id];
  store.players[normalized.id] = {
    ...existing,
    ...normalized,
    firstSeenAt: existing?.firstSeenAt || normalized.firstSeenAt,
    lastSeenAt: normalized.lastSeenAt,
  };
  writeLocalTrackerStore(store);
  return store.players[normalized.id];
}

function buildStatsKey(playerId, seasonId = '', ranked = false) {
  return `${playerId}:${seasonId || ''}:${ranked ? '1' : '0'}`;
}

function fallbackPersistProfile(player) {
  const storedPlayer = upsertLocalPlayer(player);
  return Promise.resolve(storedPlayer ? { ok: true, player: storedPlayer } : null);
}

function fallbackPersistStats({ player, seasonId = '', ranked = false, stats }) {
  const storedPlayer = upsertLocalPlayer(player);
  if (!storedPlayer || !stats) return Promise.resolve(null);

  const store = readLocalTrackerStore();
  const fetchedAt = new Date().toISOString();
  store.statsSnapshots[buildStatsKey(storedPlayer.id, seasonId, ranked)] = {
    playerId: storedPlayer.id,
    seasonId: String(seasonId || ''),
    ranked: Boolean(ranked),
    stats,
    statsUpdatedAt: stats.updatedAt || '',
    fetchedAt,
  };
  writeLocalTrackerStore(store);
  return Promise.resolve({ ok: true, playerId: storedPlayer.id, fetchedAt });
}

function fallbackPersistWealth({ player, stash }) {
  const storedPlayer = upsertLocalPlayer(player);
  if (!storedPlayer || !stash) return Promise.resolve(null);

  const store = readLocalTrackerStore();
  const fetchedAt = new Date().toISOString();
  store.wealthSnapshots[storedPlayer.id] = {
    playerId: storedPlayer.id,
    stash,
    stashUpdatedAt: stash.updatedAt || stash.createdAt || '',
    fetchedAt,
  };
  writeLocalTrackerStore(store);
  return Promise.resolve({ ok: true, playerId: storedPlayer.id, fetchedAt });
}

function fallbackPersistWealthHistory({ player, history }) {
  const storedPlayer = upsertLocalPlayer(player);
  if (!storedPlayer || !Array.isArray(history)) return Promise.resolve(null);

  const latestEntryAt = history.reduce((latest, entry) => {
    const candidate = entry?.updatedAt || entry?.createdAt || entry?.time || '';
    if (!candidate) return latest;
    if (!latest) return String(candidate);
    return new Date(candidate) > new Date(latest) ? String(candidate) : latest;
  }, '');

  const store = readLocalTrackerStore();
  const fetchedAt = new Date().toISOString();
  store.wealthHistorySnapshots[storedPlayer.id] = {
    playerId: storedPlayer.id,
    history,
    latestEntryAt,
    pointsCount: history.length,
    fetchedAt,
  };
  writeLocalTrackerStore(store);
  return Promise.resolve({ ok: true, playerId: storedPlayer.id, fetchedAt });
}

function fallbackFetchLeaderboard({ metric = 'rankedPoints', seasonId = '', ranked = false, limit = 50 } = {}) {
  const store = readLocalTrackerStore();
  const players = store.players || {};
  const items = Object.values(store.statsSnapshots || {})
    .filter((entry) => String(entry.seasonId || '') === String(seasonId || ''))
    .filter((entry) => Boolean(entry.ranked) === Boolean(ranked))
    .map((entry) => {
      const player = players[entry.playerId] || {};
      const stats = entry.stats || {};
      return {
        player: {
          id: player.id || entry.playerId,
          deltaForceId: player.deltaForceId || '',
          name: player.name || player.deltaForceId || entry.playerId,
          levelOperations: player.levelOperations ?? null,
          registeredAt: player.registeredAt || '',
        },
        metric,
        metricValue: Number(stats?.[metric] || 0),
        seasonId: entry.seasonId || '',
        ranked: Boolean(entry.ranked),
        statsUpdatedAt: entry.statsUpdatedAt || '',
        fetchedAt: entry.fetchedAt || '',
        stats,
      };
    })
    .sort((left, right) => right.metricValue - left.metricValue)
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));

  return Promise.resolve({
    items,
    totalSize: Object.values(store.statsSnapshots || {})
      .filter((entry) => String(entry.seasonId || '') === String(seasonId || ''))
      .filter((entry) => Boolean(entry.ranked) === Boolean(ranked))
      .length,
    metric,
    seasonId,
    ranked,
    source: 'browser',
  });
}

export function persistTrackedPlayerProfile(player) {
  if (!player?.id) return Promise.resolve(null);
  return postTrackerData('/players/sync-profile', { player })
    .then((result) => result || fallbackPersistProfile(player))
    .catch(() => fallbackPersistProfile(player));
}

export function persistTrackedPlayerStats({ player, seasonId = '', ranked = false, stats }) {
  if (!player?.id || !stats) return Promise.resolve(null);
  return postTrackerData('/players/sync-stats', {
    player,
    seasonId,
    ranked,
    stats,
  })
    .then((result) => result || fallbackPersistStats({ player, seasonId, ranked, stats }))
    .catch(() => fallbackPersistStats({ player, seasonId, ranked, stats }));
}

export function persistTrackedPlayerWealth({ player, stash }) {
  if (!player?.id || !stash) return Promise.resolve(null);
  return postTrackerData('/players/sync-wealth', {
    player,
    stash,
  })
    .then((result) => result || fallbackPersistWealth({ player, stash }))
    .catch(() => fallbackPersistWealth({ player, stash }));
}

export function persistTrackedPlayerWealthHistory({ player, history }) {
  if (!player?.id || !Array.isArray(history)) return Promise.resolve(null);
  return postTrackerData('/players/sync-wealth-history', {
    player,
    history,
  })
    .then((result) => result || fallbackPersistWealthHistory({ player, history }))
    .catch(() => fallbackPersistWealthHistory({ player, history }));
}

export async function fetchTrackedLeaderboard({ metric = 'rankedPoints', seasonId = '', ranked = false, limit = 50 } = {}) {
  if (typeof fetch !== 'function') {
    return fallbackFetchLeaderboard({ metric, seasonId, ranked, limit });
  }

  const params = new URLSearchParams({
    metric,
    seasonId,
    ranked: ranked ? 'true' : 'false',
    limit: String(limit),
  });

  try {
    const response = await fetch(`${TRACKER_API_BASE}/leaderboard?${params.toString()}`);
    if (!response.ok) {
      return await fallbackFetchLeaderboard({ metric, seasonId, ranked, limit });
    }

    return await response.json();
  } catch (error) {
    return await fallbackFetchLeaderboard({ metric, seasonId, ranked, limit });
  }
}
