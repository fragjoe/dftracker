import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  deleteClientPreference: vi.fn(),
  getCachedSeasonsSummary: vi.fn(),
  getCachedPlayerStatsSummary: vi.fn(),
  getCachedPlayerWealthHistorySummary: vi.fn(),
  getCachedPlayerWealthSummary: vi.fn(),
  getClientPreferences: vi.fn(),
  getMarketCatalogSummary: vi.fn(),
  getCachedMarketItemSummary: vi.fn(),
  getCachedMarketPriceSummary: vi.fn(),
  getCachedMarketSeriesSummary: vi.fn(),
  findTrackedPlayer: vi.fn(),
  getLeaderboard: vi.fn(),
  getTrackerSummary: vi.fn(),
  savePlayerStatsSnapshot: vi.fn(),
  savePlayerWealthHistorySnapshot: vi.fn(),
  savePlayerWealthSnapshot: vi.fn(),
  upsertPlayer: vi.fn(),
  replaceMarketCatalog: vi.fn(),
  writeMarketItemCache: vi.fn(),
  writeMarketItemSeriesCache: vi.fn(),
  writeMarketItemSummaryCache: vi.fn(),
  writeCachedSeasons: vi.fn(),
  writeClientPreference: vi.fn(),
}));

vi.mock('../server/db.js', () => dbMocks);

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      return this.headers[name];
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = {
        ...this.headers,
        ...headers,
      };
    },
    end(payload = '') {
      this.body = payload;
    },
  };
}

describe('player stats snapshot priming', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbMocks.getCachedPlayerStatsSummary.mockImplementation(async ({ ranked }) => ({
      isFresh: false,
      stats: null,
      fetchedAt: '',
      statsUpdatedAt: '',
      ranked,
    }));
    dbMocks.findTrackedPlayer.mockResolvedValue({
      id: 'player-1',
      deltaForceId: '184247069710854616829',
      name: 'viloU',
      levelOperations: 60,
      registeredAt: '2025-02-28T02:28:43.000Z',
    });
    dbMocks.savePlayerStatsSnapshot.mockResolvedValue({});
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stats: {
            rankedPoints: 7263,
            playTime: 216677,
            updatedAt: '2026-04-06T06:46:33.872Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stats: {
            rankedPoints: 7355,
            playTime: 225806,
            updatedAt: '2026-04-06T06:46:33.872Z',
          },
        }),
      });
  });

  it('stores ranked and unranked snapshots from a single stats request', async () => {
    const { handleTrackerRequest } = await import('../server/handler.js');
    const response = createMockResponse();

    await handleTrackerRequest({
      method: 'GET',
      url: '/tracker-api/player/stats?playerId=player-1&seasonId=season-active&ranked=false',
      headers: { host: 'localhost' },
    }, response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      source: 'upstream',
      stale: false,
      stats: {
        rankedPoints: 7263,
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const requestBodies = global.fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(requestBodies).toEqual(expect.arrayContaining([
      { playerId: 'player-1', seasonId: 'season-active' },
      { playerId: 'player-1', seasonId: 'season-active', ranked: true },
    ]));

    expect(dbMocks.savePlayerStatsSnapshot).toHaveBeenCalledTimes(2);
    expect(dbMocks.savePlayerStatsSnapshot.mock.calls.map(([payload]) => payload.ranked).sort()).toEqual([false, true]);
  });
});
