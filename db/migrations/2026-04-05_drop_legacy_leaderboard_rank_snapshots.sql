-- Cleanup migration for legacy leaderboard rank snapshots.
-- Safe to run after code version a7fbf58 or newer, where this table is no longer used.

DROP TABLE IF EXISTS leaderboard_rank_snapshots;
