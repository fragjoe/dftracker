import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getPlayer: vi.fn(),
  getPlayerOperationHistoricalStashValue: vi.fn(),
  getPlayerOperationStashValue: vi.fn(),
  getPlayerOperationStats: vi.fn(),
  listSeasons: vi.fn(),
}));

vi.mock('../src/api/client.js', () => apiMocks);
vi.mock('chart.js', () => {
  class MockChart {
    static register = vi.fn();
    destroy = vi.fn();
  }

  return {
    Chart: MockChart,
    registerables: [],
  };
});

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await Promise.resolve();
  await Promise.resolve();
}

function buildPlayerStats(overrides = {}) {
  return {
    updatedAt: '2026-03-16T12:00:00.000Z',
    kdRatio: 2.25,
    extractionRate: 0.42,
    totalKills: 120,
    totalDeaths: 54,
    matchesPlayed: 33,
    bulletDischargedHitRatio: 0.31,
    knockedHeadshotRatio: 0.18,
    revives: 6,
    matchesExtracted: 14,
    matchesLost: 10,
    matchesQuit: 1,
    playTime: 32000,
    rankedPoints: 1234,
    pickups: 75,
    bulletsDischarged: 1234,
    bulletsDischargedHit: 456,
    bulletsDischargedMissed: 778,
    knockedCount: 140,
    knockedHeadshotCount: 28,
    bulletsDischargedPerKnock: 8.8,
    bulletsDischargedHitPerKnock: 3.2,
    extractedAssets: 1500000,
    extractedTeammateAssets: 250000,
    extractedMandlebricks: 4,
    kdRatioEasy: 1.1,
    totalKillsEasy: 20,
    totalDeathsEasy: 18,
    kdRatioMedium: 2.2,
    totalKillsMedium: 70,
    totalDeathsMedium: 31,
    kdRatioHard: 3.5,
    totalKillsHard: 30,
    totalDeathsHard: 5,
    scoreCombat: 90,
    scoreSurvival: 95,
    scoreSupport: 72,
    scoreSearch: 75,
    scoreWealth: 100,
    ...overrides,
  };
}

describe('player smoke flows', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.setItem('app_language', 'en');
    document.body.innerHTML = '<div id="page-container"></div>';
    apiMocks.getPlayer.mockReset();
    apiMocks.getPlayerOperationHistoricalStashValue.mockReset();
    apiMocks.getPlayerOperationStashValue.mockReset();
    apiMocks.getPlayerOperationStats.mockReset();
    apiMocks.listSeasons.mockReset();
  });

  it('hides recent searches while searching and renders stats after a valid player search', async () => {
    localStorage.setItem('recent_searches_list', JSON.stringify([
      {
        id: 'recent-player-1',
        deltaForceId: '12345678901234567890',
        name: 'RecentOne',
        queryValue: 'RecentOne',
      },
    ]));

    apiMocks.listSeasons.mockResolvedValue({
      seasons: [
        { id: 'season-8', number: 8, name: 'Morphosis', active: true },
      ],
    });
    apiMocks.getPlayer.mockResolvedValue({
      player: {
        id: 'player-1',
        deltaForceId: '81060706959165920074',
        name: 'Varchelist',
        levelOperations: 47,
        registeredAt: '2026-03-14T05:41:53Z',
      },
    });
    apiMocks.getPlayerOperationStats.mockResolvedValue({
      stats: buildPlayerStats(),
    });

    const { renderPlayerPage } = await import('../src/pages/player.js');
    const container = document.getElementById('page-container');
    await renderPlayerPage(container);

    expect(container.textContent).toContain('Recent Searches');

    const searchInput = container.querySelector('#player-search');
    searchInput.value = 'Varchelist';
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(container.querySelector('#player-search-results').textContent).not.toContain('Recent Searches');

    await flushUi();

    expect(container.querySelector('#player-search-shell').classList.contains('hidden')).toBe(true);
    expect(container.querySelector('#stats-wrapper').textContent).toContain('K/D Ratio');
    expect(container.querySelector('#stats-wrapper').textContent).toContain('Match Info');
  });

  it('falls back to All Time when the active season has no stats', async () => {
    apiMocks.listSeasons.mockResolvedValue({
      seasons: [
        { id: 'season-8', number: 8, name: 'Morphosis', active: true },
        { id: 'season-7', number: 7, name: 'Ahsarah', active: false },
      ],
    });
    apiMocks.getPlayer.mockResolvedValue({
      player: {
        id: 'player-2',
        deltaForceId: '36957529911336299744',
        name: 'ZETADON',
        levelOperations: 31,
        registeredAt: '2026-03-15T02:00:00Z',
      },
    });
    apiMocks.getPlayerOperationStats.mockImplementation(async (_playerId, { seasonId = '' } = {}) => {
      if (seasonId === 'season-8' || seasonId === 'season-7') {
        throw new Error('404 not_found');
      }

      return {
        stats: buildPlayerStats({ totalKills: 222 }),
      };
    });

    const { renderPlayerPage } = await import('../src/pages/player.js');
    const container = document.getElementById('page-container');
    await renderPlayerPage(container);

    const searchInput = container.querySelector('#player-search');
    searchInput.value = 'ZETADON';
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await flushUi();

    expect(container.querySelector('#season-filter').value).toBe('');
    expect(container.querySelector('#stats-context-note').textContent).toContain('Showing All Time automatically');
    expect(container.querySelector('#stats-wrapper').textContent).toContain('222');
  });

  it('falls back to All Time when the active season returns a localized not-found message', async () => {
    localStorage.setItem('app_language', 'id');

    apiMocks.listSeasons.mockResolvedValue({
      seasons: [
        { id: 'season-8', number: 8, name: 'Morphosis', active: true },
      ],
    });
    apiMocks.getPlayer.mockResolvedValue({
      player: {
        id: 'player-3',
        deltaForceId: '81060706959165920074',
        name: 'Varchelist',
        levelOperations: 47,
        registeredAt: '2026-03-14T05:41:53Z',
      },
    });
    apiMocks.getPlayerOperationStats.mockImplementation(async (_playerId, { seasonId = '' } = {}) => {
      if (seasonId === 'season-8') {
        throw new Error('Data tidak ditemukan. Silakan periksa kembali ID atau filter pencarian Anda.');
      }

      return {
        stats: buildPlayerStats({ totalKills: 333 }),
      };
    });

    const { renderPlayerPage } = await import('../src/pages/player.js');
    const container = document.getElementById('page-container');
    await renderPlayerPage(container);

    const searchInput = container.querySelector('#player-search');
    searchInput.value = 'Varchelist';
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await flushUi();

    expect(container.querySelector('#season-filter').value).toBe('');
    expect(container.querySelector('#stats-context-note').textContent).toContain('Menampilkan Seluruh Waktu secara otomatis');
    expect(container.querySelector('#stats-wrapper').textContent).toContain('333');
  });

  it('retries wealth loading when the API returns a localized network error first', async () => {
    localStorage.setItem('app_language', 'id');
    localStorage.setItem('active_player_profile', JSON.stringify({
      id: 'player-wealth',
      deltaForceId: '81060706959165920074',
      name: 'Varchelist',
      levelOperations: 47,
      registeredAt: '2026-03-14T05:41:53Z',
    }));

    apiMocks.getPlayerOperationStashValue
      .mockRejectedValueOnce(new Error('Gagal terhubung ke layanan. Periksa koneksi internet Anda atau coba lagi nanti.'))
      .mockResolvedValueOnce({
        stash: {
          updatedAt: '2026-03-16T14:13:37.878976Z',
          assetsLiquid: 400000,
          assetsFixed: 1200000,
          assetsCollection: 800000,
          assetsNet: 2400000,
        },
      });
    apiMocks.getPlayerOperationHistoricalStashValue.mockResolvedValue({
      historicalStashValues: [
        { time: '2026-03-15T10:00:00Z', assetsNet: 2000000 },
        { time: '2026-03-16T10:00:00Z', assetsNet: 2400000 },
      ],
    });

    const { renderWealthPage } = await import('../src/pages/player.js');
    const container = document.getElementById('page-container');
    await renderWealthPage(container);

    await flushUi();

    expect(apiMocks.getPlayerOperationStashValue).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Net Worth');
  });
});
