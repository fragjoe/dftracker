import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getPlayer: vi.fn(),
  getPlayerOperationHistoricalStashValue: vi.fn(),
  getPlayerOperationStashValue: vi.fn(),
  getPlayerOperationStats: vi.fn(),
  listSeasons: vi.fn(),
  getAuctionItem: vi.fn(),
  getAuctionItemPriceSeries: vi.fn(),
  getAuctionItemPrices: vi.fn(),
  listAuctionItems: vi.fn(),
}));

vi.mock('../src/api/client.js', () => ({
  LANGUAGE_EN: 'LANGUAGE_EN',
  LANGUAGE_ZH_HANS: 'LANGUAGE_ZH_HANS',
  ...apiMocks,
}));
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
    kdRatio: 1.75,
    extractionRate: 0.37,
    totalKills: 80,
    totalDeaths: 46,
    matchesPlayed: 22,
    bulletDischargedHitRatio: 0.28,
    knockedHeadshotRatio: 0.12,
    revives: 4,
    matchesExtracted: 9,
    matchesLost: 7,
    matchesQuit: 0,
    playTime: 21000,
    rankedPoints: 880,
    pickups: 41,
    bulletsDischarged: 900,
    bulletsDischargedHit: 250,
    bulletsDischargedMissed: 650,
    knockedCount: 90,
    knockedHeadshotCount: 18,
    bulletsDischargedPerKnock: 10,
    bulletsDischargedHitPerKnock: 2.8,
    extractedAssets: 750000,
    extractedTeammateAssets: 100000,
    extractedMandlebricks: 2,
    kdRatioEasy: 1.1,
    totalKillsEasy: 10,
    totalDeathsEasy: 9,
    kdRatioMedium: 1.8,
    totalKillsMedium: 50,
    totalDeathsMedium: 28,
    kdRatioHard: 2.3,
    totalKillsHard: 20,
    totalDeathsHard: 9,
    scoreCombat: 82,
    scoreSurvival: 77,
    scoreSupport: 66,
    scoreSearch: 70,
    scoreWealth: 88,
    ...overrides,
  };
}

function mountShell() {
  document.body.innerHTML = `
    <div id="app">
      <header id="header" class="header">
        <div class="container header-content">
          <div class="brand">
            <div class="brand-group">
              <a href="/" class="brand-link"><span class="brand-text">DF<span class="brand-highlight">TRACKER</span></span></a>
              <a href="https://www.youtube.com/@FRAGJOE" target="_blank" rel="noopener noreferrer" class="brand-tagline">by FragjoeYT</a>
            </div>
            <div class="api-status">
              <span class="status-dot"></span>
              <span class="status-text" id="api-status-text">Online</span>
            </div>
          </div>
          <nav class="nav" id="nav">
            <a href="/player" class="nav-item active" data-page="player"><span class="nav-label" id="nav-player-label">Stats</span></a>
            <a href="/wealth" class="nav-item" data-page="wealth"><span class="nav-label" id="nav-wealth-label">Wealth</span></a>
            <a href="/market" class="nav-item" data-page="market"><span class="nav-label" id="nav-market-label">Market</span></a>
            <div class="language-dropdown" id="language-dropdown">
              <button type="button" class="language-trigger" id="language-trigger" aria-haspopup="true" aria-expanded="false">
                <span id="language-trigger-flag" class="lang-flag flag-en" aria-hidden="true"></span>
                <span id="language-trigger-text">EN</span>
                <span class="language-trigger-chevron" aria-hidden="true"></span>
              </button>
              <div class="language-menu hidden" id="language-menu" role="menu" aria-labelledby="language-trigger"></div>
            </div>
          </nav>
          <div id="header-active-player" class="header-active-player hidden" aria-live="polite"></div>
        </div>
      </header>
      <main id="main-content" class="main-content">
        <div class="container">
          <div id="page-container" class="page-container"></div>
        </div>
      </main>
      <footer class="footer">
        <div class="container footer-content">
          <div class="footer-links">
            <a href="/privacy" class="footer-link" id="footer-privacy-link">Privacy Policy</a>
            <a href="/terms" class="footer-link" id="footer-terms-link">Terms of Service</a>
            <a href="/support" class="footer-link" id="footer-support-link">Support Project</a>
          </div>
          <a href="/version" class="footer-version">v1.3.0</a>
        </div>
      </footer>
    </div>
  `;
}

describe('shared player flows', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.setItem('app_language', 'en');
    apiMocks.getPlayer.mockReset();
    apiMocks.getPlayerOperationHistoricalStashValue.mockReset();
    apiMocks.getPlayerOperationStashValue.mockReset();
    apiMocks.getPlayerOperationStats.mockReset();
    apiMocks.listSeasons.mockReset();
    apiMocks.getAuctionItem.mockReset();
    apiMocks.getAuctionItemPriceSeries.mockReset();
    apiMocks.getAuctionItemPrices.mockReset();
    apiMocks.listAuctionItems.mockReset();
    mountShell();
  });

  it('keeps the active player context when moving from Stats to Wealth', async () => {
    apiMocks.listSeasons.mockResolvedValue({
      seasons: [
        { id: 'season-8', number: 8, name: 'Morphosis', active: true },
      ],
    });
    apiMocks.getPlayer.mockResolvedValue({
      player: {
        id: 'player-wealth',
        deltaForceId: '81060706959165920074',
        name: 'Varchelist',
        levelOperations: 47,
        registeredAt: '2026-03-14T05:41:53Z',
      },
    });
    apiMocks.getPlayerOperationStats.mockResolvedValue({
      stats: buildPlayerStats(),
    });
    apiMocks.getPlayerOperationStashValue.mockResolvedValue({
      stash: {
        updatedAt: '2026-03-16T14:13:37.878976Z',
        total: 2200000,
        liquidAssets: 400000,
        fixedAssets: 1200000,
        collectionAssets: 600000,
      },
    });
    apiMocks.getPlayerOperationHistoricalStashValue.mockResolvedValue({
      historicalStashValues: [
        { time: '2026-03-15T10:00:00Z', total: 1900000 },
        { time: '2026-03-16T10:00:00Z', total: 2200000 },
      ],
    });

    await import('../src/main.js');
    window.dispatchEvent(new Event('DOMContentLoaded'));
    await flushUi();

    const searchInput = document.querySelector('#player-search');
    searchInput.value = 'Varchelist';
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushUi();

    expect(document.querySelector('#header-active-player').textContent).toContain('Varchelist');

    document.querySelector('[data-page="wealth"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUi();

    expect(window.location.pathname).toBe('/wealth');
    expect(document.querySelector('#page-container').textContent).toContain('Wealth');
    expect(document.querySelector('#page-container').textContent).toContain('Net Worth');
    expect(document.querySelector('#header-active-player').textContent).toContain('Varchelist');
  });

  it('clears the active player from the header and returns to search mode', async () => {
    apiMocks.listSeasons.mockResolvedValue({
      seasons: [
        { id: 'season-8', number: 8, name: 'Morphosis', active: true },
      ],
    });
    apiMocks.getPlayer.mockResolvedValue({
      player: {
        id: 'player-clear',
        deltaForceId: '36957529911336299744',
        name: 'ZETADON',
        levelOperations: 31,
        registeredAt: '2026-03-15T02:00:00Z',
      },
    });
    apiMocks.getPlayerOperationStats.mockResolvedValue({
      stats: buildPlayerStats(),
    });

    await import('../src/main.js');
    window.dispatchEvent(new Event('DOMContentLoaded'));
    await flushUi();

    const searchInput = document.querySelector('#player-search');
    searchInput.value = 'ZETADON';
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushUi();

    const playerTrigger = document.querySelector('#player-trigger');
    playerTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUi();

    const clearButton = document.querySelector('#header-player-clear');
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUi();

    expect(window.location.pathname).toBe('/player');
    expect(document.querySelector('#header-active-player').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#player-search-shell').classList.contains('hidden')).toBe(false);
    expect(localStorage.getItem('active_player_profile')).toBeNull();
  });
});
