import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const DEFAULT_DB_PATH = resolve(process.cwd(), '.data/dftracker.sqlite');
const dbPath = process.env.DFTRACKER_DB_PATH || DEFAULT_DB_PATH;
const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const storageMode = postgresUrl ? 'postgres' : 'sqlite';

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

async function annotateLeaderboardRankChanges(items, { metric = 'rankedPoints', seasonId = '', ranked = false } = {}) {
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
  await writeLeaderboardRankSnapshot(filterKey, currentWeekKey, currentRanks, savedAt);

  const keepWeekKeys = Array.from(new Set(
    [...snapshots.map((entry) => entry.weekKey), currentWeekKey].sort().slice(-8),
  ));
  await pruneLeaderboardRankSnapshots(filterKey, keepWeekKeys);

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

export async function getLeaderboard({ metric = 'rankedPoints', seasonId = '', ranked = false, limit = 50 } = {}) {
  await ensureReady();
  let rows;

  if (storageMode === 'postgres') {
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
    `;
  } else {
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
    `).all(String(seasonId || ''), ranked ? 1 : 0);
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
    })
    .sort((left, right) => right.metricValue - left.metricValue)
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));

  const annotated = await annotateLeaderboardRankChanges(items, { metric, seasonId, ranked });

  return {
    items: annotated.items,
    totalSize: rows.length,
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
