-- Add hybrid columns for leaderboard and market catalog performance.
-- Safe to run multiple times on Postgres/Supabase.

BEGIN;

ALTER TABLE player_stats_snapshots
  ADD COLUMN IF NOT EXISTS ranked_points DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kd_ratio DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extraction_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_kills INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matches_played INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS play_time INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extracted_assets BIGINT NOT NULL DEFAULT 0;

UPDATE player_stats_snapshots
SET
  ranked_points = COALESCE((stats_json ->> 'rankedPoints')::double precision, 0),
  kd_ratio = COALESCE((stats_json ->> 'kdRatio')::double precision, 0),
  extraction_rate = COALESCE((stats_json ->> 'extractionRate')::double precision, 0),
  total_kills = COALESCE((stats_json ->> 'totalKills')::integer, 0),
  matches_played = COALESCE((stats_json ->> 'matchesPlayed')::integer, 0),
  play_time = COALESCE((stats_json ->> 'playTime')::integer, 0),
  extracted_assets = COALESCE((stats_json ->> 'extractedAssets')::bigint, 0)
WHERE TRUE;

ALTER TABLE market_item_cache
  ADD COLUMN IF NOT EXISTS name_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_name_text TEXT NOT NULL DEFAULT '';

UPDATE market_item_cache
SET
  name_text = COALESCE(item_json ->> 'name', ''),
  search_text = LOWER(CONCAT_WS(' ',
    COALESCE(item_json ->> 'name', ''),
    COALESCE(item_json ->> 'langEn', ''),
    COALESCE(item_json ->> 'langZhHans', ''),
    COALESCE(item_json ->> 'displayName', ''),
    COALESCE(item_json ->> 'description', ''),
    COALESCE(item_json ->> 'categoryName', ''),
    COALESCE(item_json ->> 'category', ''),
    COALESCE(item_json ->> 'type', ''),
    COALESCE(item_json ->> 'id', '')
  )),
  sort_name_text = LOWER(COALESCE(
    NULLIF(item_json ->> 'name', ''),
    NULLIF(item_json ->> 'langEn', ''),
    NULLIF(item_json ->> 'displayName', ''),
    NULLIF(item_json ->> 'langZhHans', ''),
    item_json ->> 'id',
    ''
  ))
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_market_item_cache_language_sort_name
  ON market_item_cache(language, sort_name_text, item_id);

COMMIT;
