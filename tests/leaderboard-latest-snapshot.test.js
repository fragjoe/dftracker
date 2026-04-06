import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadDbModuleWithTempSqlite() {
  const tempDir = mkdtempSync(join(tmpdir(), 'dftracker-leaderboard-'));
  process.env.DFTRACKER_DB_PATH = join(tempDir, 'test.sqlite');
  process.env.DATABASE_URL = '';
  process.env.POSTGRES_URL = '';
  vi.resetModules();
  return import('../server/db.js');
}

describe('leaderboard latest snapshot selection', () => {
  beforeEach(() => {
    delete process.env.DFTRACKER_DB_PATH;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    vi.resetModules();
  });

  it('uses the newest snapshot per player before sorting by metric', async () => {
    const { getLeaderboard, savePlayerStatsSnapshot, writeCachedSeasons } = await loadDbModuleWithTempSqlite();

    const player = {
      id: 'player-1',
      deltaForceId: '81060706959165920074',
      name: 'FRAGJOE',
      levelOperations: 60,
      registeredAt: '2024-12-27T06:00:16.000Z',
    };

    await writeCachedSeasons([
      { id: 'season-newer', number: 8, name: 'Morphosis', active: true },
      { id: 'season-older', number: 7, name: 'Ahsarah', active: false },
    ]);

    await savePlayerStatsSnapshot({
      player,
      seasonId: 'season-older',
      ranked: false,
      stats: {
        rankedPoints: 8122,
        updatedAt: '2026-04-05T10:56:00.000Z',
      },
    });

    await savePlayerStatsSnapshot({
      player,
      seasonId: 'season-newer',
      ranked: false,
      stats: {
        rankedPoints: 8114,
        updatedAt: '2026-04-06T10:56:00.000Z',
      },
    });

    const leaderboard = await getLeaderboard({
      metric: 'rankedPoints',
      limit: 10,
    });

    expect(leaderboard.items).toHaveLength(1);
    expect(leaderboard.items[0].metricValue).toBe(8114);
    expect(leaderboard.items[0].seasonId).toBe('season-newer');
    expect(leaderboard.items[0].statsUpdatedAt).toBe('2026-04-06T10:56:00.000Z');
  });

  it('defaults leaderboard queries to the active season', async () => {
    const { getLeaderboard, savePlayerStatsSnapshot, writeCachedSeasons } = await loadDbModuleWithTempSqlite();

    const player = {
      id: 'player-2',
      deltaForceId: '182252294571383956722',
      name: 'MOKONDO',
      levelOperations: 60,
      registeredAt: '2024-12-26T17:29:25.000Z',
    };

    await writeCachedSeasons([
      { id: 'season-active', number: 8, name: 'Morphosis', active: true },
      { id: 'season-old', number: 7, name: 'Ahsarah', active: false },
    ]);

    await savePlayerStatsSnapshot({
      player,
      seasonId: '',
      ranked: false,
      stats: {
        rankedPoints: 14986,
        updatedAt: '2026-04-05T10:56:00.000Z',
      },
    });

    await savePlayerStatsSnapshot({
      player,
      seasonId: 'season-active',
      ranked: false,
      stats: {
        rankedPoints: 14960,
        updatedAt: '2026-04-06T10:56:00.000Z',
      },
    });

    const leaderboard = await getLeaderboard({
      metric: 'rankedPoints',
      limit: 10,
    });

    expect(leaderboard.seasonId).toBe('season-active');
    expect(leaderboard.items).toHaveLength(1);
    expect(leaderboard.items[0].metricValue).toBe(14960);
    expect(leaderboard.items[0].seasonId).toBe('season-active');
  });
});
