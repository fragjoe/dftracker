import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackerStoreMocks = vi.hoisted(() => ({
  fetchTrackedLeaderboard: vi.fn(),
  fetchTrackedMarketItem: vi.fn(),
  fetchTrackedMarketItems: vi.fn(),
  fetchTrackedMarketItemSeries: vi.fn(),
  fetchTrackedMarketItemSummary: vi.fn(),
}));

const preferencesStoreMocks = vi.hoisted(() => ({
  CLIENT_PREFERENCE_KEYS: {
    lastPlayerQuery: 'lastPlayerQuery',
  },
  setClientPreference: vi.fn(),
}));

vi.mock('../src/api/tracker-store.js', () => ({
  ...trackerStoreMocks,
}));

vi.mock('../src/api/preferences-store.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ...preferencesStoreMocks,
    getClientPreference: (key, fallback = null) => {
      if (key === 'app_language') {
        return localStorage.getItem('app_language') || fallback;
      }
      return fallback;
    },
  };
});

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await Promise.resolve();
  await Promise.resolve();
}

describe('secure HTML rendering', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.setItem('app_language', 'en');
    trackerStoreMocks.fetchTrackedLeaderboard.mockReset();
    trackerStoreMocks.fetchTrackedMarketItem.mockReset();
    trackerStoreMocks.fetchTrackedMarketItems.mockReset();
    trackerStoreMocks.fetchTrackedMarketItemSeries.mockReset();
    trackerStoreMocks.fetchTrackedMarketItemSummary.mockReset();
    preferencesStoreMocks.setClientPreference.mockReset();
    document.body.innerHTML = '<div id="page-container"></div>';
  });

  it('escapes player names in leaderboard rows', async () => {
    trackerStoreMocks.fetchTrackedLeaderboard.mockResolvedValue({
      items: [
        {
          rank: 1,
          metricValue: 999,
          player: {
            id: 'player-1',
            deltaForceId: '123456',
            name: '<img src=x onerror="window.__leaderboardXss = true">',
            levelOperations: 50,
          },
        },
      ],
    });

    const { renderLeaderboardPage } = await import('../src/pages/leaderboard.js');
    await renderLeaderboardPage(document.getElementById('page-container'));
    await flushUi();

    const container = document.getElementById('page-container');
    expect(container.querySelector('.leaderboard-cell-player-name').innerHTML).toContain('&lt;img');
    expect(container.querySelector('.leaderboard-cell-player-name img')).toBeNull();
    expect(window.__leaderboardXss).toBeUndefined();
  });

  it('escapes market load error messages', async () => {
    trackerStoreMocks.fetchTrackedMarketItems.mockRejectedValue(
      new Error('<img src=x onerror="window.__marketXss = true">'),
    );

    const { renderMarketPage } = await import('../src/pages/market.js');
    renderMarketPage(document.getElementById('page-container'));
    await flushUi();

    const container = document.getElementById('page-container');
    expect(container.querySelector('#market-results').innerHTML).toContain('&lt;img');
    expect(container.querySelector('#market-results img')).toBeNull();
    expect(window.__marketXss).toBeUndefined();
  });
});
