-- Align existing Postgres/Supabase schema with the current DFtracker runtime schema.
-- Recommended after code version a7fbf58 or newer.

BEGIN;

DROP TABLE IF EXISTS market_catalog_cache;

DROP INDEX IF EXISTS idx_players_delta_force_id;

ALTER TABLE players
  ALTER COLUMN registered_at TYPE TIMESTAMPTZ USING NULLIF(registered_at, '')::timestamptz,
  ALTER COLUMN first_seen_at TYPE TIMESTAMPTZ USING first_seen_at::timestamptz,
  ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ USING last_seen_at::timestamptz;

ALTER TABLE player_stats_snapshots
  ALTER COLUMN stats_updated_at TYPE TIMESTAMPTZ USING NULLIF(stats_updated_at, '')::timestamptz,
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::timestamptz;

ALTER TABLE player_wealth_snapshots
  ALTER COLUMN stash_updated_at TYPE TIMESTAMPTZ USING NULLIF(stash_updated_at, '')::timestamptz,
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::timestamptz;

ALTER TABLE player_wealth_history_snapshots
  ALTER COLUMN latest_entry_at TYPE TIMESTAMPTZ USING NULLIF(latest_entry_at, '')::timestamptz,
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::timestamptz;

ALTER TABLE seasons_cache
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::timestamptz;

ALTER TABLE market_item_cache
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::timestamptz;

ALTER TABLE market_item_summary_cache
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::timestamptz;

ALTER TABLE market_item_series_cache
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::timestamptz;

ALTER TABLE client_preferences
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz;

COMMIT;
