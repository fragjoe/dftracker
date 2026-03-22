import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const sqlitePath = process.env.DFTRACKER_DB_PATH || resolve(process.cwd(), '.data/dftracker.sqlite');
const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

function printUsage() {
  console.log(`
Usage:
  DATABASE_URL="postgres://..." npm run migrate:postgres

Optional env:
  DFTRACKER_DB_PATH=/custom/path/dftracker.sqlite
  `);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

if (!postgresUrl) {
  console.error('DATABASE_URL atau POSTGRES_URL wajib diisi untuk migrasi.');
  printUsage();
  process.exit(1);
}

if (!existsSync(sqlitePath)) {
  console.error(`File SQLite tidak ditemukan: ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath);
const sql = postgres(postgresUrl, {
  prepare: false,
  max: 1,
});

async function ensurePostgresSchema() {
  await sql`
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

  await sql`
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

  await sql`
    CREATE TABLE IF NOT EXISTS player_wealth_snapshots (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      stash_json JSONB NOT NULL,
      stash_updated_at TEXT,
      fetched_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS player_wealth_history_snapshots (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      history_json JSONB NOT NULL,
      latest_entry_at TEXT,
      points_count INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_players_delta_force_id
      ON players(delta_force_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_player_stats_ranked_season
      ON player_stats_snapshots(season_id, ranked)
  `;
}

function readSqliteRows() {
  return {
    players: sqlite.prepare(`
      SELECT
        id,
        delta_force_id,
        name,
        level_operations,
        registered_at,
        first_seen_at,
        last_seen_at
      FROM players
    `).all(),
    stats: sqlite.prepare(`
      SELECT
        player_id,
        season_id,
        ranked,
        stats_json,
        stats_updated_at,
        fetched_at
      FROM player_stats_snapshots
    `).all(),
    wealth: sqlite.prepare(`
      SELECT
        player_id,
        stash_json,
        stash_updated_at,
        fetched_at
      FROM player_wealth_snapshots
    `).all(),
    wealthHistory: sqlite.prepare(`
      SELECT
        player_id,
        history_json,
        latest_entry_at,
        points_count,
        fetched_at
      FROM player_wealth_history_snapshots
    `).all(),
  };
}

async function migrate() {
  await ensurePostgresSchema();
  const data = readSqliteRows();

  await sql.begin(async (tx) => {
    for (const row of data.players) {
      await tx`
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
          ${row.id},
          ${row.delta_force_id},
          ${row.name},
          ${row.level_operations},
          ${row.registered_at},
          ${row.first_seen_at},
          ${row.last_seen_at}
        )
        ON CONFLICT (id) DO UPDATE SET
          delta_force_id = EXCLUDED.delta_force_id,
          name = EXCLUDED.name,
          level_operations = EXCLUDED.level_operations,
          registered_at = EXCLUDED.registered_at,
          first_seen_at = EXCLUDED.first_seen_at,
          last_seen_at = EXCLUDED.last_seen_at
      `;
    }

    for (const row of data.stats) {
      await tx`
        INSERT INTO player_stats_snapshots (
          player_id,
          season_id,
          ranked,
          stats_json,
          stats_updated_at,
          fetched_at
        )
        VALUES (
          ${row.player_id},
          ${row.season_id},
          ${Boolean(row.ranked)},
          ${tx.json(JSON.parse(row.stats_json || '{}'))},
          ${row.stats_updated_at},
          ${row.fetched_at}
        )
        ON CONFLICT (player_id, season_id, ranked) DO UPDATE SET
          stats_json = EXCLUDED.stats_json,
          stats_updated_at = EXCLUDED.stats_updated_at,
          fetched_at = EXCLUDED.fetched_at
      `;
    }

    for (const row of data.wealth) {
      await tx`
        INSERT INTO player_wealth_snapshots (
          player_id,
          stash_json,
          stash_updated_at,
          fetched_at
        )
        VALUES (
          ${row.player_id},
          ${tx.json(JSON.parse(row.stash_json || '{}'))},
          ${row.stash_updated_at},
          ${row.fetched_at}
        )
        ON CONFLICT (player_id) DO UPDATE SET
          stash_json = EXCLUDED.stash_json,
          stash_updated_at = EXCLUDED.stash_updated_at,
          fetched_at = EXCLUDED.fetched_at
      `;
    }

    for (const row of data.wealthHistory) {
      await tx`
        INSERT INTO player_wealth_history_snapshots (
          player_id,
          history_json,
          latest_entry_at,
          points_count,
          fetched_at
        )
        VALUES (
          ${row.player_id},
          ${tx.json(JSON.parse(row.history_json || '[]'))},
          ${row.latest_entry_at},
          ${row.points_count},
          ${row.fetched_at}
        )
        ON CONFLICT (player_id) DO UPDATE SET
          history_json = EXCLUDED.history_json,
          latest_entry_at = EXCLUDED.latest_entry_at,
          points_count = EXCLUDED.points_count,
          fetched_at = EXCLUDED.fetched_at
      `;
    }
  });

  console.log('Migrasi selesai.');
  console.log(`SQLite source : ${sqlitePath}`);
  console.log(`Players       : ${data.players.length}`);
  console.log(`Stats         : ${data.stats.length}`);
  console.log(`Wealth        : ${data.wealth.length}`);
  console.log(`WealthHistory : ${data.wealthHistory.length}`);
}

migrate()
  .catch((error) => {
    console.error('Migrasi gagal:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await sql.end({ timeout: 5 });
  });
