import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
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

describe('market modal flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.setItem('app_language', 'en');
    document.body.innerHTML = '<div id="page-container"></div>';
    apiMocks.getAuctionItem.mockReset();
    apiMocks.getAuctionItemPriceSeries.mockReset();
    apiMocks.getAuctionItemPrices.mockReset();
    apiMocks.listAuctionItems.mockReset();
  });

  it('opens and closes the market detail modal from the list view', async () => {
    apiMocks.listAuctionItems.mockResolvedValue({
      items: [
        { id: 'item-1', name: 'Assault Rifle' },
      ],
      nextPageToken: '',
    });
    apiMocks.getAuctionItemPrices.mockResolvedValue({
      prices: [
        { price: 125000, createdAt: '2026-03-16T10:00:00Z' },
      ],
    });
    apiMocks.getAuctionItemPriceSeries.mockResolvedValue({
      priceSeries: [
        { time: '2026-03-15T10:00:00Z', priceAverage: 100000, priceHigh: 110000, priceLow: 90000 },
        { time: '2026-03-16T10:00:00Z', priceAverage: 120000, priceHigh: 130000, priceLow: 95000 },
      ],
    });
    apiMocks.getAuctionItem.mockResolvedValue({
      item: {
        id: 'item-1',
        name: 'Assault Rifle',
        categoryName: 'Weapon',
      },
    });

    const { renderMarketPage } = await import('../src/pages/market.js');
    const container = document.getElementById('page-container');
    renderMarketPage(container);

    await flushUi();

    const firstCard = container.querySelector('.list-item-card');
    expect(firstCard).not.toBeNull();

    firstCard.click();
    await flushUi();

    const overlay = document.getElementById('modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector('#page-item-name').innerText).toBe('Assault Rifle');
    expect(overlay.querySelector('#chart-range-selector')).not.toBeNull();

    overlay.querySelector('.modal-close').click();
    await vi.advanceTimersByTimeAsync(300);

    expect(document.getElementById('modal-overlay')).toBeNull();
  });
});
