CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_market_item_cache_search_trgm
  ON market_item_cache USING gin(search_text gin_trgm_ops);
