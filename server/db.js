import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const DEFAULT_DB_PATH = resolve(process.cwd(), '.data/dftracker.sqlite');
const dbPath = process.env.DFTRACKER_DB_PATH || DEFAULT_DB_PATH;
const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const storageMode = postgresUrl ? 'postgres' : 'sqlite';
const SEASON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MARKET_CATALOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MARKET_ITEM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MARKET_SUMMARY_TTL_MS = 60 * 60 * 1000;
const PLAYER_STATS_TTL_MS = 20 * 60 * 1000;
const PLAYER_WEALTH_TTL_MS = 20 * 60 * 1000;
const PLAYER_WEALTH_HISTORY_TTL_MS = 3 * 60 * 60 * 1000;

let sqliteDb = null;
let postgresClient = null;
let readyPromise = null;

function getNowIso() {
  return new Date().toISOString();
}

function getIsoWeekKey(dateInput = new Date()) {
  const sourceDate = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const utcDate = new Date(Date.UTC(
    sourceDate.getUTCFullYear(),
    sourceDate.getUTCMonth(),
    sourceDate.getUTCDate(),
  ));
  const weekday = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - weekday + 3);

  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);

  const weekNumber = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function buildLeaderboardFilterKey({ metric = 'rankedPoints', seasonId = '', ranked = false } = {}) {
  return `${String(metric || 'rankedPoints')}:${String(seasonId || 'all')}:${ranked ? 'ranked' : 'all'}`;
}

function buildMarketCatalogCacheKey({ filter = '', pageToken = '', pageSize = 10, language = '' } = {}) {
  return `${language}:${pageSize}:${pageToken}:${filter}`;
}

function decodeMarketOffsetToken(token = '') {
  const numeric = Number(token || 0);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }

  try {
    const decoded = Buffer.from(String(token), 'base64url').toString('utf8');
    const parsed = Number(decoded || 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch (error) {
    return 0;
  }
}

function encodeMarketOffsetToken(offset = 0) {
  const safeOffset = Math.max(0, Number(offset || 0));
  return Buffer.from(String(safeOffset), 'utf8').toString('base64url');
}

function getMarketSeriesTtlMs(days = 1) {
  return Number(days) <= 3 ? 30 * 60 * 1000 : 2 * 60 * 60 * 1000;
}

function normalizePlayer(player = {}) {
  if (!player?.id) {
    throw new Error('Player id is required');
  }

  return {
    id: String(player.id),
    deltaForceId: String(player.deltaForceId || ''),
    name: String(player.name || player.deltaForceId || player.id),
    levelOperations: Number.isFinite(Number(player.levelOperations))
      ? Number(player.levelOperations)
      : null,
    registeredAt: player.registeredAt ? String(player.registeredAt) : null,
  };
}

function parseJsonSafely(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch (error) {
    return fallback;
  }
}

function ensureSqliteReady() {
  if (sqliteDb) {
    return;
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      delta_force_id TEXT UNIQUE,
      name TEXT NOT NULL,
      level_operations INTEGER,
      registered_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_stats_snapshots (
      player_id TEXT NOT NULL,
      season_id TEXT NOT NULL DEFAULT '',
      ranked INTEGER NOT NULL DEFAULT 0,
      stats_json TEXT NOT NULL,
      stats_updated_at TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (player_id, season_id, ranked),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_wealth_snapshots (
      player_id TEXT PRIMARY KEY,
      stash_json TEXT NOT NULL,
      stash_updated_at TEXT,
      fetched_at TEXT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_wealth_history_snapshots (
      player_id TEXT PRIMARY KEY,
      history_json TEXT NOT NULL,
      latest_entry_at TEXT,
      points_count INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_players_delta_force_id
      ON players(delta_force_id);

    CREATE INDEX IF NOT EXISTS idx_player_stats_ranked_season
      ON player_stats_snapshots(season_id, ranked);

    CREATE TABLE IF NOT EXISTS leaderboard_rank_snapshots (
      filter_key TEXT NOT NULL,
      week_key TEXT NOT NULL,
      ranks_json TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      PRIMARY KEY (filter_key, week_key)
    );

    CREATE INDEX IF NOT EXISTS idx_leaderboard_rank_snapshots_filter_key
      ON leaderboard_rank_snapshots(filter_key);

    CREATE TABLE IF NOT EXISTS seasons_cache (
      id TEXT PRIMARY KEY,
      number INTEGER,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_seasons_cache_active_number
      ON seasons_cache(active, number);

    CREATE TABLE IF NOT EXISTS market_catalog_cache (
      cache_key TEXT PRIMARY KEY,
      filter TEXT NOT NULL,
      page_token TEXT NOT NULL,
      page_size INTEGER NOT NULL,
      language TEXT NOT NULL,
      items_json TEXT NOT NULL,
      next_page_token TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_item_cache (
      item_id TEXT NOT NULL,
      language TEXT NOT NULL,
      item_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (item_id, language)
    );

    CREATE TABLE IF NOT EXISTS market_item_summary_cache (
      item_id TEXT NOT NULL,
      language TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (item_id, language)
    );

    CREATE TABLE IF NOT EXISTS market_item_series_cache (
      item_id TEXT NOT NULL,
      language TEXT NOT NULL,
      days INTEGER NOT NULL,
      series_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (item_id, language, days)
    );
  `);
}

async function ensurePostgresReady() {
  if (postgresClient) {
    return;
  }

  postgresClient = postgres(postgresUrl, {
    prepare: false,
    max: 1,
  });

  await postgresClient`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      delta_force_id TEXT UNIQUE,
      name TEXT NOT NULL,
      level_operations INTEGER,
      registered_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS player_stats_snapshots (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season_id TEXT NOT NULL DEFAULT '',
      ranked BOOLEAN NOT NULL DEFAULT FALSE,
      stats_json JSONB NOT NULL,
      stats_updated_at TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (player_id, season_id, ranked)
    )
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS player_wealth_snapshots (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      stash_json JSONB NOT NULL,
      stash_updated_at TEXT,
      fetched_at TEXT NOT NULL
    )
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS player_wealth_history_snapshots (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      history_json JSONB NOT NULL,
      latest_entry_at TEXT,
      points_count INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    )
  `;

  await postgresClient`
    CREATE INDEX IF NOT EXISTS idx_players_delta_force_id
      ON players(delta_force_id)
  `;

  await postgresClient`
    CREATE INDEX IF NOT EXISTS idx_player_stats_ranked_season
      ON player_stats_snapshots(season_id, ranked)
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS leaderboard_rank_snapshots (
      filter_key TEXT NOT NULL,
      week_key TEXT NOT NULL,
      ranks_json JSONB NOT NULL,
      saved_at TEXT NOT NULL,
      PRIMARY KEY (filter_key, week_key)
    )
  `;

  await postgresClient`
    CREATE INDEX IF NOT EXISTS idx_leaderboard_rank_snapshots_filter_key
      ON leaderboard_rank_snapshots(filter_key)
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS seasons_cache (
      id TEXT PRIMARY KEY,
      number INTEGER,
      name TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      raw_json JSONB NOT NULL,
      fetched_at TEXT NOT NULL
    )
  `;

  await postgresClient`
    CREATE INDEX IF NOT EXISTS idx_seasons_cache_active_number
      ON seasons_cache(active, number)
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS market_catalog_cache (
      cache_key TEXT PRIMARY KEY,
      filter TEXT NOT NULL,
      page_token TEXT NOT NULL,
      page_size INTEGER NOT NULL,
      language TEXT NOT NULL,
      items_json JSONB NOT NULL,
      next_page_token TEXT,
      fetched_at TEXT NOT NULL
    )
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS market_item_cache (
      item_id TEXT NOT NULL,
      language TEXT NOT NULL,
      item_json JSONB NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (item_id, language)
    )
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS market_item_summary_cache (
      item_id TEXT NOT NULL,
      language TEXT NOT NULL,
      summary_json JSONB NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (item_id, language)
    )
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS market_item_series_cache (
      item_id TEXT NOT NULL,
      language TEXT NOT NULL,
      days INTEGER NOT NULL,
      series_json JSONB NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (item_id, language, days)
    )
  `;
}

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (storageMode === 'postgres') {
        await ensurePostgresReady();
      } else {
        ensureSqliteReady();
      }
    })();
  }

  await readyPromise;
}

async function upsertPlayerSqlite(player) {
  ensureSqliteReady();
  const normalized = normalizePlayer(player);
  const now = getNowIso();

  sqliteDb.exec('BEGIN');
  try {
    const existing = sqliteDb.prepare('SELECT first_seen_at FROM players WHERE id = ?').get(normalized.id);
    sqliteDb.prepare(`
      INSERT INTO players (
        id,
        delta_force_id,
        name,
        level_operations,
        registered_at,
        first_seen_at,
        last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        delta_force_id = excluded.delta_force_id,
        name = excluded.name,
        level_operations = excluded.level_operations,
        registered_at = excluded.registered_at,
        last_seen_at = excluded.last_seen_at
    `).run(
      normalized.id,
      normalized.deltaForceId,
      normalized.name,
      normalized.levelOperations,
      normalized.registeredAt,
      existing?.first_seen_at || now,
      now,
    );
    sqliteDb.exec('COMMIT');
  } catch (error) {
    sqliteDb.exec('ROLLBACK');
    throw error;
  }

  return normalized;
}

async function upsertPlayerPostgres(player) {
  await ensurePostgresReady();
  const normalized = normalizePlayer(player);
  const now = getNowIso();

  await postgresClient`
    INSERT INTO players (
      id,
      delta_force_id,
      name,
      level_operations,
      registered_at,
      first_seen_at,
      last_seen_at
    )
    VALUES (
      ${normalized.id},
      ${normalized.deltaForceId},
      ${normalized.name},
      ${normalized.levelOperations},
      ${normalized.registeredAt},
      COALESCE((SELECT first_seen_at FROM players WHERE id = ${normalized.id}), ${now}),
      ${now}
    )
    ON CONFLICT (id) DO UPDATE SET
      delta_force_id = EXCLUDED.delta_force_id,
      name = EXCLUDED.name,
      level_operations = EXCLUDED.level_operations,
      registered_at = EXCLUDED.registered_at,
      last_seen_at = EXCLUDED.last_seen_at
  `;

  return normalized;
}

export async function upsertPlayer(player) {
  await ensureReady();
  if (storageMode === 'postgres') {
    return upsertPlayerPostgres(player);
  }
  return upsertPlayerSqlite(player);
}

export async function findTrackedPlayer({ id = '', deltaForceId = '', name = '' } = {}) {
  await ensureReady();

  if (storageMode === 'postgres') {
    let rows = [];

    if (id) {
      rows = await postgresClient`
        SELECT id, delta_force_id, name, level_operations, registered_at
        FROM players
        WHERE id = ${String(id)}
        LIMIT 1
      `;
    } else if (deltaForceId) {
      rows = await postgresClient`
        SELECT id, delta_force_id, name, level_operations, registered_at
        FROM players
        WHERE delta_force_id = ${String(deltaForceId)}
        LIMIT 1
      `;
    } else if (name) {
      rows = await postgresClient`
        SELECT id, delta_force_id, name, level_operations, registered_at
        FROM players
        WHERE LOWER(name) = LOWER(${String(name)})
        ORDER BY last_seen_at DESC
        LIMIT 1
      `;
    }

    const row = rows[0];
    return row ? {
      id: row.id,
      deltaForceId: row.delta_force_id,
      name: row.name,
      levelOperations: row.level_operations,
      registeredAt: row.registered_at,
    } : null;
  }

  let row = null;
  if (id) {
    row = sqliteDb.prepare(`
      SELECT id, delta_force_id, name, level_operations, registered_at
      FROM players
      WHERE id = ?
      LIMIT 1
    `).get(String(id));
  } else if (deltaForceId) {
    row = sqliteDb.prepare(`
      SELECT id, delta_force_id, name, level_operations, registered_at
      FROM players
      WHERE delta_force_id = ?
      LIMIT 1
    `).get(String(deltaForceId));
  } else if (name) {
    row = sqliteDb.prepare(`
      SELECT id, delta_force_id, name, level_operations, registered_at
      FROM players
      WHERE LOWER(name) = LOWER(?)
      ORDER BY last_seen_at DESC
      LIMIT 1
    `).get(String(name));
  }

  return row ? {
    id: row.id,
    deltaForceId: row.delta_force_id,
    name: row.name,
    levelOperations: row.level_operations,
    registeredAt: row.registered_at,
  } : null;
}

export async function savePlayerStatsSnapshot({ player, seasonId = '', ranked = false, stats }) {
  await ensureReady();
  const normalizedPlayer = await upsertPlayer(player);
  const fetchedAt = getNowIso();

  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO player_stats_snapshots (
        player_id,
        season_id,
        ranked,
        stats_json,
        stats_updated_at,
        fetched_at
      )
      VALUES (
        ${normalizedPlayer.id},
        ${String(seasonId || '')},
        ${Boolean(ranked)},
        ${postgresClient.json(stats || {})},
        ${stats?.updatedAt ? String(stats.updatedAt) : null},
        ${fetchedAt}
      )
      ON CONFLICT (player_id, season_id, ranked) DO UPDATE SET
        stats_json = EXCLUDED.stats_json,
        stats_updated_at = EXCLUDED.stats_updated_at,
        fetched_at = EXCLUDED.fetched_at
    `;
  } else {
    sqliteDb.prepare(`
      INSERT INTO player_stats_snapshots (
        player_id,
        season_id,
        ranked,
        stats_json,
        stats_updated_at,
        fetched_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, season_id, ranked) DO UPDATE SET
        stats_json = excluded.stats_json,
        stats_updated_at = excluded.stats_updated_at,
        fetched_at = excluded.fetched_at
    `).run(
      normalizedPlayer.id,
      String(seasonId || ''),
      ranked ? 1 : 0,
      JSON.stringify(stats || {}),
      stats?.updatedAt ? String(stats.updatedAt) : null,
      fetchedAt,
    );
  }

  return {
    playerId: normalizedPlayer.id,
    seasonId: String(seasonId || ''),
    ranked: Boolean(ranked),
    fetchedAt,
  };
}

export async function savePlayerWealthSnapshot({ player, stash }) {
  await ensureReady();
  const normalizedPlayer = await upsertPlayer(player);
  const fetchedAt = getNowIso();
  const stashUpdatedAt = stash?.updatedAt ? String(stash.updatedAt) : stash?.createdAt ? String(stash.createdAt) : null;

  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO player_wealth_snapshots (
        player_id,
        stash_json,
        stash_updated_at,
        fetched_at
      )
      VALUES (
        ${normalizedPlayer.id},
        ${postgresClient.json(stash || {})},
        ${stashUpdatedAt},
        ${fetchedAt}
      )
      ON CONFLICT (player_id) DO UPDATE SET
        stash_json = EXCLUDED.stash_json,
        stash_updated_at = EXCLUDED.stash_updated_at,
        fetched_at = EXCLUDED.fetched_at
    `;
  } else {
    sqliteDb.prepare(`
      INSERT INTO player_wealth_snapshots (
        player_id,
        stash_json,
        stash_updated_at,
        fetched_at
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        stash_json = excluded.stash_json,
        stash_updated_at = excluded.stash_updated_at,
        fetched_at = excluded.fetched_at
    `).run(
      normalizedPlayer.id,
      JSON.stringify(stash || {}),
      stashUpdatedAt,
      fetchedAt,
    );
  }

  return {
    playerId: normalizedPlayer.id,
    fetchedAt,
  };
}

export async function savePlayerWealthHistorySnapshot({ player, history }) {
  await ensureReady();
  const normalizedPlayer = await upsertPlayer(player);
  const normalizedHistory = Array.isArray(history) ? history : [];
  const latestEntryAt = normalizedHistory.reduce((latest, entry) => {
    const candidate = entry?.updatedAt || entry?.createdAt || entry?.time || '';
    if (!candidate) return latest;
    if (!latest) return String(candidate);
    return new Date(candidate) > new Date(latest) ? String(candidate) : latest;
  }, '');
  const fetchedAt = getNowIso();

  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO player_wealth_history_snapshots (
        player_id,
        history_json,
        latest_entry_at,
        points_count,
        fetched_at
      )
      VALUES (
        ${normalizedPlayer.id},
        ${postgresClient.json(normalizedHistory)},
        ${latestEntryAt || null},
        ${normalizedHistory.length},
        ${fetchedAt}
      )
      ON CONFLICT (player_id) DO UPDATE SET
        history_json = EXCLUDED.history_json,
        latest_entry_at = EXCLUDED.latest_entry_at,
        points_count = EXCLUDED.points_count,
        fetched_at = EXCLUDED.fetched_at
    `;
  } else {
    sqliteDb.prepare(`
      INSERT INTO player_wealth_history_snapshots (
        player_id,
        history_json,
        latest_entry_at,
        points_count,
        fetched_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        history_json = excluded.history_json,
        latest_entry_at = excluded.latest_entry_at,
        points_count = excluded.points_count,
        fetched_at = excluded.fetched_at
    `).run(
      normalizedPlayer.id,
      JSON.stringify(normalizedHistory),
      latestEntryAt || null,
      normalizedHistory.length,
      fetchedAt,
    );
  }

  return {
    playerId: normalizedPlayer.id,
    pointsCount: normalizedHistory.length,
    fetchedAt,
  };
}

async function readLeaderboardRankSnapshots(filterKey) {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT week_key, ranks_json, saved_at
      FROM leaderboard_rank_snapshots
      WHERE filter_key = ${filterKey}
      ORDER BY week_key ASC
    `;

    return rows.map((row) => ({
      weekKey: row.week_key,
      ranks: row.ranks_json || {},
      savedAt: row.saved_at,
    }));
  }

  const rows = sqliteDb.prepare(`
    SELECT week_key, ranks_json, saved_at
    FROM leaderboard_rank_snapshots
    WHERE filter_key = ?
    ORDER BY week_key ASC
  `).all(filterKey);

  return rows.map((row) => ({
    weekKey: row.week_key,
    ranks: parseJsonSafely(row.ranks_json, {}),
    savedAt: row.saved_at,
  }));
}

async function writeLeaderboardRankSnapshot(filterKey, weekKey, ranks, savedAt) {
  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO leaderboard_rank_snapshots (
        filter_key,
        week_key,
        ranks_json,
        saved_at
      )
      VALUES (
        ${filterKey},
        ${weekKey},
        ${postgresClient.json(ranks || {})},
        ${savedAt}
      )
      ON CONFLICT (filter_key, week_key) DO UPDATE SET
        ranks_json = EXCLUDED.ranks_json,
        saved_at = EXCLUDED.saved_at
    `;
    return;
  }

  sqliteDb.prepare(`
    INSERT INTO leaderboard_rank_snapshots (
      filter_key,
      week_key,
      ranks_json,
      saved_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(filter_key, week_key) DO UPDATE SET
      ranks_json = excluded.ranks_json,
      saved_at = excluded.saved_at
  `).run(filterKey, weekKey, JSON.stringify(ranks || {}), savedAt);
}

async function pruneLeaderboardRankSnapshots(filterKey, keepWeekKeys) {
  if (!Array.isArray(keepWeekKeys) || !keepWeekKeys.length) {
    return;
  }

  if (storageMode === 'postgres') {
    await postgresClient`
      DELETE FROM leaderboard_rank_snapshots
      WHERE filter_key = ${filterKey}
        AND NOT (week_key = ANY(${postgresClient.array(keepWeekKeys)}))
    `;
    return;
  }

  const placeholders = keepWeekKeys.map(() => '?').join(', ');
  sqliteDb.prepare(`
    DELETE FROM leaderboard_rank_snapshots
    WHERE filter_key = ?
      AND week_key NOT IN (${placeholders})
  `).run(filterKey, ...keepWeekKeys);
}

async function annotateLeaderboardRankChanges(items, {
  metric = 'rankedPoints',
  seasonId = '',
  ranked = false,
  persistSnapshot = true,
} = {}) {
  const filterKey = buildLeaderboardFilterKey({ metric, seasonId, ranked });
  const snapshots = await readLeaderboardRankSnapshots(filterKey);
  const now = new Date();
  const currentWeekKey = getIsoWeekKey(now);
  const previousWeekKey = getIsoWeekKey(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const previousSnapshot = snapshots.find((entry) => entry.weekKey === previousWeekKey) || null;
  const currentRanks = {};

  const annotatedItems = items.map((entry, index) => {
    const rank = index + 1;
    const playerId = String(entry?.player?.id || '');
    if (playerId) {
      currentRanks[playerId] = rank;
    }

    const previousRank = Number(previousSnapshot?.ranks?.[playerId] || 0);
    let rankChange = { state: 'same', delta: 0 };

    if (!previousSnapshot) {
      rankChange = { state: 'same', delta: 0 };
    } else if (!previousRank) {
      rankChange = { state: 'new', delta: 0 };
    } else if (previousRank > rank) {
      rankChange = { state: 'up', delta: previousRank - rank };
    } else if (previousRank < rank) {
      rankChange = { state: 'down', delta: rank - previousRank };
    }

    return {
      ...entry,
      rank,
      rankChange,
    };
  });

  const savedAt = now.toISOString();
  if (persistSnapshot) {
    await writeLeaderboardRankSnapshot(filterKey, currentWeekKey, currentRanks, savedAt);

    const keepWeekKeys = Array.from(new Set(
      [...snapshots.map((entry) => entry.weekKey), currentWeekKey].sort().slice(-8),
    ));
    await pruneLeaderboardRankSnapshots(filterKey, keepWeekKeys);
  }

  return {
    items: annotatedItems,
    baseline: {
      filterKey,
      period: 'week',
      currentWeekKey,
      previousWeekKey,
      savedAt,
      hasPreviousSnapshot: Boolean(previousSnapshot),
    },
  };
}

async function readCachedSeasons() {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT id, number, name, active, raw_json, fetched_at
      FROM seasons_cache
      ORDER BY number DESC, name ASC
    `;

    return rows.map((row) => ({
      ...row.raw_json,
      id: row.id,
      number: Number(row.number || 0),
      name: row.name,
      active: Boolean(row.active),
      fetchedAt: row.fetched_at,
    }));
  }

  const rows = sqliteDb.prepare(`
    SELECT id, number, name, active, raw_json, fetched_at
    FROM seasons_cache
    ORDER BY number DESC, name ASC
  `).all();

  return rows.map((row) => ({
    ...parseJsonSafely(row.raw_json, {}),
    id: row.id,
    number: Number(row.number || 0),
    name: row.name,
    active: Boolean(row.active),
    fetchedAt: row.fetched_at,
  }));
}

export async function writeCachedSeasons(seasons = [], fetchedAt = getNowIso()) {
  if (storageMode === 'postgres') {
    await postgresClient.begin(async (tx) => {
      await tx`DELETE FROM seasons_cache`;
      for (const season of seasons) {
        await tx`
          INSERT INTO seasons_cache (
            id,
            number,
            name,
            active,
            raw_json,
            fetched_at
          )
          VALUES (
            ${String(season.id || '')},
            ${Number(season.number || 0)},
            ${String(season.name || '')},
            ${Boolean(season.active)},
            ${tx.json(season || {})},
            ${fetchedAt}
          )
        `;
      }
    });
    return;
  }

  sqliteDb.exec('BEGIN');
  try {
    sqliteDb.prepare('DELETE FROM seasons_cache').run();
    const statement = sqliteDb.prepare(`
      INSERT INTO seasons_cache (
        id,
        number,
        name,
        active,
        raw_json,
        fetched_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    seasons.forEach((season) => {
      statement.run(
        String(season.id || ''),
        Number(season.number || 0),
        String(season.name || ''),
        season.active ? 1 : 0,
        JSON.stringify(season || {}),
        fetchedAt,
      );
    });
    sqliteDb.exec('COMMIT');
  } catch (error) {
    sqliteDb.exec('ROLLBACK');
    throw error;
  }
}

export async function getCachedSeasonsSummary() {
  await ensureReady();
  const seasons = await readCachedSeasons();
  const fetchedAt = seasons[0]?.fetchedAt || '';
  const isFresh = fetchedAt
    ? (Date.now() - new Date(fetchedAt).getTime()) < SEASON_CACHE_TTL_MS
    : false;

  return {
    seasons,
    fetchedAt,
    isFresh,
  };
}

async function readMarketCatalogCache(params) {
  const cacheKey = buildMarketCatalogCacheKey(params);
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT items_json, next_page_token, fetched_at
      FROM market_catalog_cache
      WHERE cache_key = ${cacheKey}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      items: row.items_json?.items || [],
      nextPageToken: row.next_page_token || '',
      fetchedAt: row.fetched_at,
    };
  }

  const row = sqliteDb.prepare(`
    SELECT items_json, next_page_token, fetched_at
    FROM market_catalog_cache
    WHERE cache_key = ?
    LIMIT 1
  `).get(cacheKey);
  if (!row) return null;
  const parsed = parseJsonSafely(row.items_json, {});
  return {
    items: parsed.items || [],
    nextPageToken: row.next_page_token || '',
    fetchedAt: row.fetched_at,
  };
}

export async function writeMarketCatalogCache(params, payload = {}, fetchedAt = getNowIso()) {
  await ensureReady();
  const cacheKey = buildMarketCatalogCacheKey(params);
  const normalizedPayload = {
    items: Array.isArray(payload.items) ? payload.items : [],
  };

  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO market_catalog_cache (
        cache_key,
        filter,
        page_token,
        page_size,
        language,
        items_json,
        next_page_token,
        fetched_at
      )
      VALUES (
        ${cacheKey},
        ${String(params.filter || '')},
        ${String(params.pageToken || '')},
        ${Number(params.pageSize || 10)},
        ${String(params.language || '')},
        ${postgresClient.json(normalizedPayload)},
        ${String(payload.nextPageToken || '')},
        ${fetchedAt}
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        items_json = EXCLUDED.items_json,
        next_page_token = EXCLUDED.next_page_token,
        fetched_at = EXCLUDED.fetched_at
    `;
    return;
  }

  sqliteDb.prepare(`
    INSERT INTO market_catalog_cache (
      cache_key,
      filter,
      page_token,
      page_size,
      language,
      items_json,
      next_page_token,
      fetched_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      items_json = excluded.items_json,
      next_page_token = excluded.next_page_token,
      fetched_at = excluded.fetched_at
  `).run(
    cacheKey,
    String(params.filter || ''),
    String(params.pageToken || ''),
    Number(params.pageSize || 10),
    String(params.language || ''),
    JSON.stringify(normalizedPayload),
    String(payload.nextPageToken || ''),
    fetchedAt,
  );
}

async function readMarketItemCache(itemId, language = '') {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT item_json, fetched_at
      FROM market_item_cache
      WHERE item_id = ${String(itemId)}
        AND language = ${String(language || '')}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { item: row.item_json || {}, fetchedAt: row.fetched_at };
  }

  const row = sqliteDb.prepare(`
    SELECT item_json, fetched_at
    FROM market_item_cache
    WHERE item_id = ?
      AND language = ?
    LIMIT 1
  `).get(String(itemId), String(language || ''));
  if (!row) return null;
  return {
    item: parseJsonSafely(row.item_json, {}),
    fetchedAt: row.fetched_at,
  };
}

export async function writeMarketItemCache(itemId, language = '', item = {}, fetchedAt = getNowIso()) {
  await ensureReady();
  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO market_item_cache (
        item_id,
        language,
        item_json,
        fetched_at
      )
      VALUES (
        ${String(itemId)},
        ${String(language || '')},
        ${postgresClient.json(item || {})},
        ${fetchedAt}
      )
      ON CONFLICT (item_id, language) DO UPDATE SET
        item_json = EXCLUDED.item_json,
        fetched_at = EXCLUDED.fetched_at
    `;
    return;
  }

  sqliteDb.prepare(`
    INSERT INTO market_item_cache (
      item_id,
      language,
      item_json,
      fetched_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(item_id, language) DO UPDATE SET
      item_json = excluded.item_json,
      fetched_at = excluded.fetched_at
  `).run(String(itemId), String(language || ''), JSON.stringify(item || {}), fetchedAt);
}

async function readMarketItemSummaryCache(itemId, language = '') {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT summary_json, fetched_at
      FROM market_item_summary_cache
      WHERE item_id = ${String(itemId)}
        AND language = ${String(language || '')}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { summary: row.summary_json || {}, fetchedAt: row.fetched_at };
  }

  const row = sqliteDb.prepare(`
    SELECT summary_json, fetched_at
    FROM market_item_summary_cache
    WHERE item_id = ?
      AND language = ?
    LIMIT 1
  `).get(String(itemId), String(language || ''));
  if (!row) return null;
  return {
    summary: parseJsonSafely(row.summary_json, {}),
    fetchedAt: row.fetched_at,
  };
}

export async function writeMarketItemSummaryCache(itemId, language = '', summary = {}, fetchedAt = getNowIso()) {
  await ensureReady();
  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO market_item_summary_cache (
        item_id,
        language,
        summary_json,
        fetched_at
      )
      VALUES (
        ${String(itemId)},
        ${String(language || '')},
        ${postgresClient.json(summary || {})},
        ${fetchedAt}
      )
      ON CONFLICT (item_id, language) DO UPDATE SET
        summary_json = EXCLUDED.summary_json,
        fetched_at = EXCLUDED.fetched_at
    `;
    return;
  }

  sqliteDb.prepare(`
    INSERT INTO market_item_summary_cache (
      item_id,
      language,
      summary_json,
      fetched_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(item_id, language) DO UPDATE SET
      summary_json = excluded.summary_json,
      fetched_at = excluded.fetched_at
  `).run(String(itemId), String(language || ''), JSON.stringify(summary || {}), fetchedAt);
}

async function readMarketItemSeriesCache(itemId, language = '', days = 1) {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT series_json, fetched_at
      FROM market_item_series_cache
      WHERE item_id = ${String(itemId)}
        AND language = ${String(language || '')}
        AND days = ${Number(days || 1)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { payload: row.series_json || {}, fetchedAt: row.fetched_at };
  }

  const row = sqliteDb.prepare(`
    SELECT series_json, fetched_at
    FROM market_item_series_cache
    WHERE item_id = ?
      AND language = ?
      AND days = ?
    LIMIT 1
  `).get(String(itemId), String(language || ''), Number(days || 1));
  if (!row) return null;
  return {
    payload: parseJsonSafely(row.series_json, {}),
    fetchedAt: row.fetched_at,
  };
}

export async function writeMarketItemSeriesCache(itemId, language = '', days = 1, payload = {}, fetchedAt = getNowIso()) {
  await ensureReady();
  if (storageMode === 'postgres') {
    await postgresClient`
      INSERT INTO market_item_series_cache (
        item_id,
        language,
        days,
        series_json,
        fetched_at
      )
      VALUES (
        ${String(itemId)},
        ${String(language || '')},
        ${Number(days || 1)},
        ${postgresClient.json(payload || {})},
        ${fetchedAt}
      )
      ON CONFLICT (item_id, language, days) DO UPDATE SET
        series_json = EXCLUDED.series_json,
        fetched_at = EXCLUDED.fetched_at
    `;
    return;
  }

  sqliteDb.prepare(`
    INSERT INTO market_item_series_cache (
      item_id,
      language,
      days,
      series_json,
      fetched_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(item_id, language, days) DO UPDATE SET
      series_json = excluded.series_json,
      fetched_at = excluded.fetched_at
  `).run(String(itemId), String(language || ''), Number(days || 1), JSON.stringify(payload || {}), fetchedAt);
}

function isFreshTimestamp(fetchedAt, ttlMs) {
  if (!fetchedAt) return false;
  const timestamp = new Date(fetchedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return (Date.now() - timestamp) < ttlMs;
}

async function readPlayerStatsSnapshot(playerId, seasonId = '', ranked = false) {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT stats_json, stats_updated_at, fetched_at
      FROM player_stats_snapshots
      WHERE player_id = ${String(playerId)}
        AND season_id = ${String(seasonId || '')}
        AND ranked = ${Boolean(ranked)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      stats: row.stats_json || {},
      statsUpdatedAt: row.stats_updated_at,
      fetchedAt: row.fetched_at,
    };
  }

  const row = sqliteDb.prepare(`
    SELECT stats_json, stats_updated_at, fetched_at
    FROM player_stats_snapshots
    WHERE player_id = ?
      AND season_id = ?
      AND ranked = ?
    LIMIT 1
  `).get(String(playerId), String(seasonId || ''), ranked ? 1 : 0);

  if (!row) return null;
  return {
    stats: parseJsonSafely(row.stats_json, {}),
    statsUpdatedAt: row.stats_updated_at,
    fetchedAt: row.fetched_at,
  };
}

async function readPlayerWealthSnapshot(playerId) {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT stash_json, stash_updated_at, fetched_at
      FROM player_wealth_snapshots
      WHERE player_id = ${String(playerId)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      stash: row.stash_json || {},
      stashUpdatedAt: row.stash_updated_at,
      fetchedAt: row.fetched_at,
    };
  }

  const row = sqliteDb.prepare(`
    SELECT stash_json, stash_updated_at, fetched_at
    FROM player_wealth_snapshots
    WHERE player_id = ?
    LIMIT 1
  `).get(String(playerId));

  if (!row) return null;
  return {
    stash: parseJsonSafely(row.stash_json, {}),
    stashUpdatedAt: row.stash_updated_at,
    fetchedAt: row.fetched_at,
  };
}

async function readPlayerWealthHistorySnapshot(playerId) {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT history_json, latest_entry_at, points_count, fetched_at
      FROM player_wealth_history_snapshots
      WHERE player_id = ${String(playerId)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      history: row.history_json || [],
      latestEntryAt: row.latest_entry_at,
      pointsCount: row.points_count,
      fetchedAt: row.fetched_at,
    };
  }

  const row = sqliteDb.prepare(`
    SELECT history_json, latest_entry_at, points_count, fetched_at
    FROM player_wealth_history_snapshots
    WHERE player_id = ?
    LIMIT 1
  `).get(String(playerId));

  if (!row) return null;
  return {
    history: parseJsonSafely(row.history_json, []),
    latestEntryAt: row.latest_entry_at,
    pointsCount: row.points_count,
    fetchedAt: row.fetched_at,
  };
}

export async function getCachedPlayerStatsSummary({ playerId = '', seasonId = '', ranked = false } = {}) {
  await ensureReady();
  const cached = playerId ? await readPlayerStatsSnapshot(playerId, seasonId, ranked) : null;
  return {
    ...(cached || { stats: null, statsUpdatedAt: '', fetchedAt: '' }),
    isFresh: isFreshTimestamp(cached?.fetchedAt, PLAYER_STATS_TTL_MS),
    ttlMs: PLAYER_STATS_TTL_MS,
  };
}

export async function getCachedPlayerWealthSummary(playerId = '') {
  await ensureReady();
  const cached = playerId ? await readPlayerWealthSnapshot(playerId) : null;
  return {
    ...(cached || { stash: null, stashUpdatedAt: '', fetchedAt: '' }),
    isFresh: isFreshTimestamp(cached?.fetchedAt, PLAYER_WEALTH_TTL_MS),
    ttlMs: PLAYER_WEALTH_TTL_MS,
  };
}

export async function getCachedPlayerWealthHistorySummary(playerId = '') {
  await ensureReady();
  const cached = playerId ? await readPlayerWealthHistorySnapshot(playerId) : null;
  return {
    ...(cached || { history: null, latestEntryAt: '', pointsCount: 0, fetchedAt: '' }),
    isFresh: isFreshTimestamp(cached?.fetchedAt, PLAYER_WEALTH_HISTORY_TTL_MS),
    ttlMs: PLAYER_WEALTH_HISTORY_TTL_MS,
  };
}

export async function getCachedMarketCatalogSummary(params = {}) {
  await ensureReady();
  const cached = await readMarketCatalogCache(params);
  return {
    ...(cached || { items: [], nextPageToken: '', fetchedAt: '' }),
    isFresh: isFreshTimestamp(cached?.fetchedAt, MARKET_CATALOG_TTL_MS),
  };
}

export async function getCachedMarketItemSummary(itemId, language = '') {
  await ensureReady();
  const cached = await readMarketItemCache(itemId, language);
  return {
    ...(cached || { item: null, fetchedAt: '' }),
    isFresh: isFreshTimestamp(cached?.fetchedAt, MARKET_ITEM_TTL_MS),
  };
}

export async function getCachedMarketPriceSummary(itemId, language = '') {
  await ensureReady();
  const cached = await readMarketItemSummaryCache(itemId, language);
  return {
    ...(cached || { summary: null, fetchedAt: '' }),
    isFresh: isFreshTimestamp(cached?.fetchedAt, MARKET_SUMMARY_TTL_MS),
  };
}

export async function getCachedMarketSeriesSummary(itemId, language = '', days = 1) {
  await ensureReady();
  const cached = await readMarketItemSeriesCache(itemId, language, days);
  return {
    ...(cached || { payload: null, fetchedAt: '' }),
    isFresh: isFreshTimestamp(cached?.fetchedAt, getMarketSeriesTtlMs(days)),
  };
}

async function readAllMarketItems(language = '') {
  if (storageMode === 'postgres') {
    const rows = await postgresClient`
      SELECT item_json, fetched_at
      FROM market_item_cache
      WHERE language = ${String(language || '')}
      ORDER BY item_id ASC
    `;

    return rows.map((row) => ({
      item: row.item_json || {},
      fetchedAt: row.fetched_at,
    }));
  }

  const rows = sqliteDb.prepare(`
    SELECT item_json, fetched_at
    FROM market_item_cache
    WHERE language = ?
    ORDER BY item_id ASC
  `).all(String(language || ''));

  return rows.map((row) => ({
    item: parseJsonSafely(row.item_json, {}),
    fetchedAt: row.fetched_at,
  }));
}

export async function replaceMarketCatalog(language = '', items = [], fetchedAt = getNowIso()) {
  await ensureReady();
  const normalizedLanguage = String(language || '');
  const normalizedItems = Array.isArray(items) ? items.filter((item) => item?.id) : [];

  if (storageMode === 'postgres') {
    await postgresClient.begin(async (tx) => {
      await tx`
        DELETE FROM market_item_cache
        WHERE language = ${normalizedLanguage}
      `;

      for (const item of normalizedItems) {
        await tx`
          INSERT INTO market_item_cache (
            item_id,
            language,
            item_json,
            fetched_at
          )
          VALUES (
            ${String(item.id)},
            ${normalizedLanguage},
            ${tx.json(item || {})},
            ${fetchedAt}
          )
        `;
      }
    });
    return;
  }

  sqliteDb.exec('BEGIN');
  try {
    sqliteDb.prepare(`
      DELETE FROM market_item_cache
      WHERE language = ?
    `).run(normalizedLanguage);

    const statement = sqliteDb.prepare(`
      INSERT INTO market_item_cache (
        item_id,
        language,
        item_json,
        fetched_at
      )
      VALUES (?, ?, ?, ?)
    `);

    normalizedItems.forEach((item) => {
      statement.run(
        String(item.id),
        normalizedLanguage,
        JSON.stringify(item || {}),
        fetchedAt,
      );
    });

    sqliteDb.exec('COMMIT');
  } catch (error) {
    sqliteDb.exec('ROLLBACK');
    throw error;
  }
}

export async function getMarketCatalogSummary({ language = '', search = '', pageSize = 10, pageToken = '' } = {}) {
  await ensureReady();
  const rows = await readAllMarketItems(language);
  const fetchedAt = rows[0]?.fetchedAt || '';
  const isFresh = isFreshTimestamp(fetchedAt, MARKET_CATALOG_TTL_MS);
  const query = String(search || '').trim().toLowerCase();

  const filtered = rows
    .map((row) => row.item)
    .filter(Boolean)
    .filter((item) => {
      if (!query) return true;
      const haystacks = [
        item.name,
        item.langEn,
        item.langZhHans,
        item.displayName,
        item.description,
        item.categoryName,
        item.category,
        item.type,
        item.id,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return haystacks.some((value) => value.includes(query));
    })
    .sort((left, right) => {
      const leftName = String(left.name || left.langEn || left.displayName || left.id || '').toLowerCase();
      const rightName = String(right.name || right.langEn || right.displayName || right.id || '').toLowerCase();
      return leftName.localeCompare(rightName);
    });

  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 10, 50));
  const offset = decodeMarketOffsetToken(pageToken);
  const items = filtered.slice(offset, offset + safePageSize);
  const nextOffset = offset + safePageSize;
  const nextPageToken = nextOffset < filtered.length ? encodeMarketOffsetToken(nextOffset) : '';

  return {
    items,
    nextPageToken,
    fetchedAt,
    isFresh,
    totalSize: filtered.length,
  };
}

export async function getLeaderboard({ metric = 'rankedPoints', seasonId = '', ranked = false, limit = 50 } = {}) {
  await ensureReady();
  let rows;
  let totalSize;
  const safeMetric = String(metric || 'rankedPoints');
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

  if (storageMode === 'postgres') {
    const countRows = await postgresClient`
      SELECT COUNT(*)::int AS total
      FROM player_stats_snapshots
      WHERE season_id = ${String(seasonId || '')}
        AND ranked = ${Boolean(ranked)}
    `;
    totalSize = Number(countRows[0]?.total || 0);

    rows = await postgresClient`
      SELECT
        p.id,
        p.delta_force_id,
        p.name,
        p.level_operations,
        p.registered_at,
        s.season_id,
        s.ranked,
        s.stats_json,
        s.stats_updated_at,
        s.fetched_at
      FROM player_stats_snapshots s
      INNER JOIN players p
        ON p.id = s.player_id
      WHERE s.season_id = ${String(seasonId || '')}
        AND s.ranked = ${Boolean(ranked)}
      ORDER BY COALESCE((s.stats_json ->> ${safeMetric})::double precision, 0) DESC, p.last_seen_at DESC
      LIMIT ${safeLimit}
    `;
  } else {
    totalSize = Number(sqliteDb.prepare(`
      SELECT COUNT(*) AS total
      FROM player_stats_snapshots
      WHERE season_id = ?
        AND ranked = ?
    `).get(String(seasonId || ''), ranked ? 1 : 0)?.total || 0);

    rows = sqliteDb.prepare(`
      SELECT
        p.id,
        p.delta_force_id,
        p.name,
        p.level_operations,
        p.registered_at,
        s.season_id,
        s.ranked,
        s.stats_json,
        s.stats_updated_at,
        s.fetched_at
      FROM player_stats_snapshots s
      INNER JOIN players p
        ON p.id = s.player_id
      WHERE s.season_id = ?
        AND s.ranked = ?
      ORDER BY COALESCE(CAST(json_extract(s.stats_json, ?) AS REAL), 0) DESC, p.last_seen_at DESC
      LIMIT ?
    `).all(String(seasonId || ''), ranked ? 1 : 0, `$.${safeMetric}`, safeLimit);
  }

  const items = rows
    .map((row) => {
      const stats = storageMode === 'postgres'
        ? (row.stats_json || {})
        : parseJsonSafely(row.stats_json, {});

      return {
        player: {
          id: row.id,
          deltaForceId: row.delta_force_id,
          name: row.name,
          levelOperations: row.level_operations,
          registeredAt: row.registered_at,
        },
        metric,
        metricValue: Number(stats?.[metric] || 0),
        seasonId: row.season_id,
        ranked: Boolean(row.ranked),
        statsUpdatedAt: row.stats_updated_at,
        fetchedAt: row.fetched_at,
        stats,
      };
    });

  const annotated = await annotateLeaderboardRankChanges(items, {
    metric,
    seasonId,
    ranked,
    persistSnapshot: false,
  });

  return {
    items: annotated.items,
    totalSize,
    metric,
    seasonId: String(seasonId || ''),
    ranked: Boolean(ranked),
    baseline: annotated.baseline,
  };
}

export async function refreshLeaderboardBaseline({
  metric = 'rankedPoints',
  seasonId = '',
  ranked = false,
  limit = 200,
} = {}) {
  await ensureReady();
  let rows;
  let totalSize;
  const safeMetric = String(metric || 'rankedPoints');
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));

  if (storageMode === 'postgres') {
    const countRows = await postgresClient`
      SELECT COUNT(*)::int AS total
      FROM player_stats_snapshots
      WHERE season_id = ${String(seasonId || '')}
        AND ranked = ${Boolean(ranked)}
    `;
    totalSize = Number(countRows[0]?.total || 0);

    rows = await postgresClient`
      SELECT
        p.id,
        p.delta_force_id,
        p.name,
        p.level_operations,
        p.registered_at,
        s.season_id,
        s.ranked,
        s.stats_json,
        s.stats_updated_at,
        s.fetched_at
      FROM player_stats_snapshots s
      INNER JOIN players p
        ON p.id = s.player_id
      WHERE s.season_id = ${String(seasonId || '')}
        AND s.ranked = ${Boolean(ranked)}
      ORDER BY COALESCE((s.stats_json ->> ${safeMetric})::double precision, 0) DESC, p.last_seen_at DESC
      LIMIT ${safeLimit}
    `;
  } else {
    totalSize = Number(sqliteDb.prepare(`
      SELECT COUNT(*) AS total
      FROM player_stats_snapshots
      WHERE season_id = ?
        AND ranked = ?
    `).get(String(seasonId || ''), ranked ? 1 : 0)?.total || 0);

    rows = sqliteDb.prepare(`
      SELECT
        p.id,
        p.delta_force_id,
        p.name,
        p.level_operations,
        p.registered_at,
        s.season_id,
        s.ranked,
        s.stats_json,
        s.stats_updated_at,
        s.fetched_at
      FROM player_stats_snapshots s
      INNER JOIN players p
        ON p.id = s.player_id
      WHERE s.season_id = ?
        AND s.ranked = ?
      ORDER BY COALESCE(CAST(json_extract(s.stats_json, ?) AS REAL), 0) DESC, p.last_seen_at DESC
      LIMIT ?
    `).all(String(seasonId || ''), ranked ? 1 : 0, `$.${safeMetric}`, safeLimit);
  }

  const items = rows
    .map((row) => {
      const stats = storageMode === 'postgres'
        ? (row.stats_json || {})
        : parseJsonSafely(row.stats_json, {});

      return {
        player: {
          id: row.id,
          deltaForceId: row.delta_force_id,
          name: row.name,
          levelOperations: row.level_operations,
          registeredAt: row.registered_at,
        },
        metric,
        metricValue: Number(stats?.[metric] || 0),
        seasonId: row.season_id,
        ranked: Boolean(row.ranked),
        statsUpdatedAt: row.stats_updated_at,
        fetchedAt: row.fetched_at,
        stats,
      };
    });

  const annotated = await annotateLeaderboardRankChanges(items, {
    metric,
    seasonId,
    ranked,
    persistSnapshot: true,
  });

  return {
    ok: true,
    totalSize,
    metric,
    seasonId: String(seasonId || ''),
    ranked: Boolean(ranked),
    baseline: annotated.baseline,
  };
}

export async function getTrackerSummary() {
  await ensureReady();
  const totalPlayers = storageMode === 'postgres'
    ? Number((await postgresClient`SELECT COUNT(*)::int AS total_players FROM players`)[0]?.total_players || 0)
    : Number(sqliteDb.prepare('SELECT COUNT(*) AS total_players FROM players').get()?.total_players || 0);

  return {
    storageMode,
    dbPath: storageMode === 'sqlite' ? dbPath : null,
    totalPlayers,
  };
}
