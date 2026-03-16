import {
  getPlayer,
  getPlayerOperationHistoricalStashValue,
  getPlayerOperationStashValue,
  getPlayerOperationStats,
  listSeasons
} from '../api/client.js';
import { getCurrentLanguage, t } from '../i18n.js';
import { escapeHTML } from '../utils/security.js';

let stashChart = null;
let scoreBreakdownChart = null;
let allSeasons = [];
let activePlayerRequestId = 0;
let activePlayerProfile = null;
let detachPlayerPageClearListener = null;
let detachStatsDropdownListeners = null;
const seasonAvailabilityCache = new Map();
const playerLookupCache = new Map();
const playerStatsCache = new Map();
const playerStashCache = new Map();
const playerHistoryCache = new Map();
const playerViewStateCache = new Map();

const RECENT_SEARCHES_KEY = 'recent_searches_list';
const ACTIVE_PLAYER_PROFILE_KEY = 'active_player_profile';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID_PATTERN = /^\d{6,}$/;
const AUTO_SEARCH_NUMERIC_ID_LENGTH = 20;
const AUTO_SEARCH_DEBOUNCE_MS = {
  numericId: 350,
};
const PLAYER_CACHE_MAX_AGE_MS = {
  lookup: 10 * 60 * 1000,
  stats: 45 * 1000,
  stash: 45 * 1000,
  history: 45 * 1000,
};
let chartConstructorPromise = null;

async function getChartConstructor() {
  if (!chartConstructorPromise) {
    chartConstructorPromise = import('chart.js').then(({ Chart, registerables }) => {
      Chart.register(...registerables);
      return Chart;
    });
  }

  return chartConstructorPromise;
}

function normalizePlayerQueryKey(value = '') {
  return value.trim().toLowerCase();
}

function emitActivePlayerChange() {
  window.dispatchEvent(new CustomEvent('app:active-player-change', {
    detail: {
      player: getActivePlayerProfileSummary(),
    },
  }));
}

function createPlayerProfileSummary(player) {
  if (!isValidResolvedPlayer(player)) return null;

  return {
    id: player.id || '',
    deltaForceId: player.deltaForceId || '',
    name: player.name || '',
    levelOperations: player.levelOperations ?? null,
    registeredAt: player.registeredAt || '',
  };
}

function readStoredActivePlayerProfile() {
  try {
    const stored = JSON.parse(localStorage.getItem(ACTIVE_PLAYER_PROFILE_KEY) || 'null');
    return isValidResolvedPlayer(stored) ? stored : null;
  } catch (error) {
    return null;
  }
}

function persistActivePlayerProfile(player) {
  const summary = createPlayerProfileSummary(player);
  activePlayerProfile = summary;

  if (summary) {
    localStorage.setItem(ACTIVE_PLAYER_PROFILE_KEY, JSON.stringify(summary));
  } else {
    localStorage.removeItem(ACTIVE_PLAYER_PROFILE_KEY);
  }

  emitActivePlayerChange();
}

export function getActivePlayerProfileSummary() {
  if (isValidResolvedPlayer(activePlayerProfile)) {
    return activePlayerProfile;
  }

  const stored = readStoredActivePlayerProfile();
  if (stored) {
    activePlayerProfile = stored;
    return stored;
  }

  return null;
}

export function clearActivePlayerContext() {
  destroyPlayerCharts();
  activePlayerProfile = null;
  localStorage.removeItem('lastPlayerQuery');
  localStorage.removeItem(ACTIVE_PLAYER_PROFILE_KEY);
  emitActivePlayerChange();
  window.dispatchEvent(new Event('app:active-player-cleared'));
}

function getFreshCacheEntry(cache, key, maxAgeMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) return null;
  return entry;
}

function setCacheEntry(cache, key, value) {
  cache.set(key, {
    value,
    timestamp: Date.now(),
  });
}

function cacheResolvedPlayer(player, query = '') {
  const keys = new Set();
  if (query) keys.add(normalizePlayerQueryKey(query));
  if (player.id) keys.add(normalizePlayerQueryKey(player.id));
  if (player.deltaForceId) keys.add(normalizePlayerQueryKey(player.deltaForceId));
  if (player.name) {
    keys.add(normalizePlayerQueryKey(player.name));
    keys.add(normalizePlayerQueryKey(player.name.toLowerCase()));
  }

  keys.forEach(key => {
    if (key) {
      setCacheEntry(playerLookupCache, key, player);
    }
  });
}

function getStatsCacheKey(playerId, seasonId = '', ranked = false) {
  return `${playerId}:${seasonId || 'all'}:${ranked ? 'ranked' : 'all'}`;
}

function getPlayerViewState(playerId, activeSeasonId = '') {
  return playerViewStateCache.get(playerId) || {
    seasonId: activeSeasonId || '',
    ranked: false,
  };
}

function setPlayerViewState(playerId, state) {
  playerViewStateCache.set(playerId, {
    ...state,
    updatedAt: Date.now(),
  });
}

function destroyPlayerCharts() {
  if (stashChart) {
    stashChart.destroy();
    stashChart = null;
  }

  if (scoreBreakdownChart) {
    scoreBreakdownChart.destroy();
    scoreBreakdownChart = null;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isStalePlayerRequest(requestId) {
  return requestId !== activePlayerRequestId;
}

function hasStatsPayload(response) {
  return Boolean(response && response.stats);
}

function hasStashPayload(response) {
  return Boolean(response && response.stash);
}

function hasHistoricalStashPayload(response) {
  const allSeries = response?.historicalStashValues || response?.stashes || response?.historicalStashValue || response?.series || [];
  return allSeries.length > 0;
}

function isRetryablePendingResourceError(error) {
  const errorMessage = String(error?.message || '').toLowerCase();
  return errorMessage.includes('404')
    || errorMessage.includes('not_found')
    || errorMessage.includes('not found')
    || errorMessage.includes('data stat kosong')
    || errorMessage.includes('failed to fetch')
    || errorMessage.includes('network')
    || errorMessage.includes('timeout');
}

async function retryPlayerResource(fetcher, {
  attempts = 4,
  delayMs = 1800,
  isReady = value => Boolean(value),
  requestId = activePlayerRequestId,
} = {}) {
  let lastValue = null;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (isStalePlayerRequest(requestId)) {
      return null;
    }

    try {
      const value = await fetcher();
      lastValue = value;
      if (isReady(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1) {
      await wait(delayMs * (attempt + 1));
    }
  }

  if (lastError) {
    throw lastError;
  }

  return lastValue;
}

async function pollPlayerResource(fetcher, {
  requestId = activePlayerRequestId,
  isReady = value => Boolean(value),
  isRetryableError = isRetryablePendingResourceError,
  attemptsPerCycle = 2,
  attemptDelayMs = 1500,
  pollIntervalMs = 3500,
  maxPollMs = 60000,
  onPending = null,
} = {}) {
  const startedAt = Date.now();
  let lastValue = null;
  let lastError = null;

  while (!isStalePlayerRequest(requestId) && Date.now() - startedAt <= maxPollMs) {
    try {
      const value = await retryPlayerResource(fetcher, {
        attempts: attemptsPerCycle,
        delayMs: attemptDelayMs,
        isReady,
        requestId,
      });

      lastValue = value;
      if (isReady(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) {
        throw error;
      }
    }

    if (isStalePlayerRequest(requestId) || Date.now() - startedAt >= maxPollMs) {
      break;
    }

    if (onPending) {
      onPending({
        elapsedMs: Date.now() - startedAt,
        lastValue,
        lastError,
      });
    }
    await wait(pollIntervalMs);
  }

  if (lastError && !lastValue) {
    return null;
  }

  return lastValue;
}

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function addRecentSearch(player) {
  const recent = getRecentSearches();
  const queryValue = player.deltaForceId || player.name || player.id;
  const index = recent.findIndex(r => r.id === player.id || r.deltaForceId === player.deltaForceId);

  if (index !== -1) {
    recent.splice(index, 1);
  }

  recent.unshift({
    id: player.id,
    deltaForceId: player.deltaForceId,
    name: player.name || player.deltaForceId,
    queryValue,
  });

  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 5)));
}

function removeRecentSearch(queryValue = '') {
  const normalizedQuery = String(queryValue || '').trim().toLowerCase();
  if (!normalizedQuery) return;

  const filtered = getRecentSearches().filter(item => {
    const candidate = String(item.queryValue || item.deltaForceId || item.name || '').trim().toLowerCase();
    return candidate !== normalizedQuery;
  });

  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered));
}

function renderEmptyState() {
  const recent = getRecentSearches();

  if (recent.length > 0) {
    return `
      <div class="recent-searches" style="margin: var(--space-xl) auto 0;">
        <div class="recent-title" style="text-align: center;">${t('player.recentTitle')}</div>
        <div class="recent-list">
          ${recent.map(r => `
            <div class="recent-item" data-query="${escapeHTML(r.queryValue || r.deltaForceId || r.name || '')}">
              <div class="recent-item-icon"><i data-lucide="history" style="width: 16px; height: 16px;"></i></div>
              <div class="recent-item-info">
                <div class="recent-item-name">${escapeHTML(r.name)}</div>
                <div class="recent-item-id">${escapeHTML(r.deltaForceId || r.queryValue || '-')}</div>
              </div>
              <button
                type="button"
                class="recent-item-delete"
                data-query="${escapeHTML(r.queryValue || r.deltaForceId || r.name || '')}"
                aria-label="${escapeHTML(t('player.deleteRecent'))}"
                title="${escapeHTML(t('player.deleteRecent'))}"
              >
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="empty-state" style="padding: var(--space-2xl) 0">
      <div class="empty-text" style="color: var(--text-muted); font-size: 0.95rem;">${t('player.noRecent')}</div>
    </div>
  `;
}

function renderSearchFeedbackState({ icon, title, message }) {
  return `
    <div class="empty-state" style="padding: var(--space-xl) 0">
      <div class="empty-icon" style="color: var(--accent-red); margin-bottom: var(--space-md);">
        <i data-lucide="${icon}" style="width: 48px; height: 48px;"></i>
      </div>
      <div class="empty-text" style="color: var(--accent-red)">${title}</div>
      <div class="empty-hint">${message}</div>
    </div>
  `;
}

function encodeLoadingStages(stages) {
  return encodeURIComponent(JSON.stringify(stages));
}

function getLoadingStages(primaryMessage) {
  return [
    primaryMessage,
    t('player.loadingPhaseConnect'),
    t('player.loadingPhasePrepare'),
    t('player.loadingPhaseSync'),
  ];
}

function startLoadingStateAnimation(scope) {
  const root = scope?.querySelectorAll ? scope : document;
  root.querySelectorAll?.('[data-loading-stages]').forEach(element => {
    if (element.dataset.loadingBound === 'true') return;

    let stages;
    try {
      stages = JSON.parse(decodeURIComponent(element.dataset.loadingStages || '[]'));
    } catch (error) {
      stages = [];
    }

    if (!Array.isArray(stages) || stages.length < 2) return;

    const stageTimings = [2800, 7000, 12000];
    element.dataset.loadingBound = 'true';

    stages.slice(1).forEach((stageText, index) => {
      const timer = setTimeout(() => {
        if (!element.isConnected) {
          clearTimeout(timer);
          return;
        }

        element.textContent = stageText;
      }, stageTimings[index] || stageTimings[stageTimings.length - 1]);
    });
  });
}

function renderSectionLoadingState({ message, className = 'mb-lg' }) {
  const loadingStages = getLoadingStages(message);
  return `
    <div class="player-loading-shell ${className}">
      <div class="loading-container player-section-loading">
        <div class="spinner"></div>
        <div class="loading-progress" aria-hidden="true">
          <span class="loading-progress__bar"></span>
        </div>
        <span class="loading-text loading-text-animated" data-loading-stages="${encodeLoadingStages(loadingStages)}">${loadingStages[0]}</span>
      </div>
    </div>
  `;
}

function renderSectionEmptyCard({ icon, title, message, toneClass = 'text-muted', className = 'mb-lg' }) {
  return `
    <div class="card ${className}">
      <div class="card-header" style="display: flex; align-items: center; gap: 8px;">
        <i data-lucide="${icon}" style="width: 18px; color: var(--accent-primary)"></i>
        <span class="card-title">${title}</span>
      </div>
      <div class="empty-state" style="padding: var(--space-lg)">
        <div class="empty-hint ${toneClass}">${message}</div>
      </div>
    </div>
  `;
}

function renderSectionEmptyState({ message, toneClass = 'text-muted', className = 'mb-lg' }) {
  return `
    <div class="player-loading-shell ${className}">
      <div class="empty-state" style="padding: var(--space-lg) 0;">
        <div class="empty-hint ${toneClass}">${message}</div>
      </div>
    </div>
  `;
}

function renderCombinedResourceEmptyState(messages, className = 'mb-lg') {
  return `
    <div class="player-loading-shell ${className}">
      <div class="empty-state" style="padding: var(--space-lg) 0;">
        <div class="empty-hint text-muted">${messages.join('<br>')}</div>
      </div>
    </div>
  `;
}

function renderWealthHistoryCard(content) {
  return `
    <div class="card mb-lg">
      <div class="card-header" style="justify-content: space-between; flex-wrap: wrap; gap: var(--space-sm)">
        <div style="display: flex; align-items: center;">
          <i data-lucide="line-chart" style="margin-right: 8px; width: 18px; color: var(--accent-primary)"></i>
          <span class="card-title">${t('player.wealthHistory')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap">
          <span class="text-muted" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
            <i data-lucide="info" style="width: 14px; height: 14px;"></i>${t('player.wealthHint')}
          </span>
        </div>
      </div>
      ${content}
    </div>
  `;
}

function renderWealthHistoryLoading(message = t('player.stashLoading')) {
  return renderSectionLoadingState({
    message,
    className: 'mb-lg',
  });
}

function renderPlayerIdentityHeader(player) {
  const name = player.name || player.deltaForceId || 'Unknown';
  const regDate = player.registeredAt || '';

  return `
    <div class="flex-between mb-lg" style="align-items: flex-end; gap: var(--space-md)">
      <div class="player-profile" style="margin-bottom: 0; flex: 1">
        <div class="player-info">
          <div class="player-name">
            ${escapeHTML(name)}
            <span style="font-size: 0.9rem; color: var(--accent-primary); background: rgba(15, 247, 150, 0.1); padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600; margin-left: 8px; vertical-align: middle;">
              Lv.${escapeHTML(String(player.levelOperations || '?'))}
            </span>
          </div>
          <div style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 4px;">
            ${regDate ? `<span class="text-muted" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px;"><i data-lucide="calendar" style="width: 14px; height: 14px;"></i> ${t('player.accountCreated')}: ${formatDate(regDate)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function renderPlayerPage(container) {
  destroyPlayerCharts();
  const activePlayer = getActivePlayerProfileSummary();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><i data-lucide="chart-no-axes-combined" style="margin-right: 8px"></i>${t('player.title')}</h1>
      <p class="page-subtitle">${t('player.subtitle')}</p>
    </div>

    <div id="player-search-shell" class="player-search-shell${activePlayer ? ' hidden' : ''}">
      <div class="search-bar">
        <span class="search-icon"><i data-lucide="search"></i></span>
        <input type="text" class="search-input" id="player-search"
          placeholder="${t('player.searchPlaceholder')}" />
        <button class="search-clear hidden" id="search-clear"><i data-lucide="x"></i></button>
      </div>
      <div class="market-search-meta player-search-support text-muted">
        <i data-lucide="info" style="width: 14px; height: 14px;"></i>
        <span>${t('player.searchSupportNote')}</span>
      </div>

      <div id="player-search-results">
        ${activePlayer ? '' : renderEmptyState()}
      </div>
    </div>

    <div id="player-content"></div>
  `;
  const searchInput = container.querySelector('#player-search');
  const clearBtn = container.querySelector('#search-clear');
  const searchShell = container.querySelector('#player-search-shell');
  const searchResults = container.querySelector('#player-search-results');
  const contentEl = container.querySelector('#player-content');
  let searchDebounceTimer = null;
  let lastAutoSearchQuery = '';

  const showSearchShell = ({ focus = false, preserveQuery = false } = {}) => {
    searchShell.classList.remove('hidden');
    searchResults.innerHTML = renderEmptyState();
    contentEl.innerHTML = '';

    if (!preserveQuery) {
      searchInput.value = '';
      clearBtn.classList.add('hidden');
    }

    if (focus) {
      searchInput.focus();
    }

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }
  };

  const hideSearchShell = () => {
    searchShell.classList.add('hidden');
  };

  const getAutoSearchConfig = rawQuery => {
    const query = rawQuery.trim();
    if (!query) return null;

    if (/^\d+$/.test(query) && query.length === AUTO_SEARCH_NUMERIC_ID_LENGTH) {
      return { delayMs: AUTO_SEARCH_DEBOUNCE_MS.numericId };
    }

    return null;
  };

  const queueAutoSearch = rawQuery => {
    const query = rawQuery.trim();
    const autoSearchConfig = getAutoSearchConfig(query);

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }

    if (!autoSearchConfig) return;
    if (query === lastAutoSearchQuery) return;

    searchDebounceTimer = setTimeout(() => {
      lastAutoSearchQuery = query;
      loadPlayerData(container, query, { hideSearchOnSuccess: true });
    }, autoSearchConfig.delayMs);
  };

  // Load persistence
  const lastQuery = localStorage.getItem('lastPlayerQuery')
    || activePlayer?.deltaForceId
    || activePlayer?.id
    || '';
  if (lastQuery) {
    searchInput.value = lastQuery;
    clearBtn.classList.remove('hidden');
    setTimeout(() => loadPlayerData(container, lastQuery, { hideSearchOnSuccess: true }), 10);
  }

  searchInput.addEventListener('input', (e) => {
    if (e.target.value) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
      lastAutoSearchQuery = '';
    }

    queueAutoSearch(e.target.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      if (query) {
        lastAutoSearchQuery = query;
        loadPlayerData(container, query, { hideSearchOnSuccess: true });
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    searchInput.focus();
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    lastAutoSearchQuery = '';

    if (!getActivePlayerProfileSummary()) {
      searchResults.innerHTML = renderEmptyState();
      contentEl.innerHTML = '';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  searchResults.addEventListener('click', (e) => {
    const deleteButton = e.target.closest('.recent-item-delete');
    if (deleteButton) {
      e.preventDefault();
      e.stopPropagation();
      removeRecentSearch(deleteButton.dataset.query || '');
      searchResults.innerHTML = renderEmptyState();
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const item = e.target.closest('.recent-item');
    if (item) {
      const query = item.dataset.query;
      searchInput.value = query;
      clearBtn.classList.remove('hidden');
      lastAutoSearchQuery = query;
      loadPlayerData(container, query, { hideSearchOnSuccess: true });
    }
  });

  if (detachPlayerPageClearListener) {
    detachPlayerPageClearListener();
  }

  const handleActivePlayerCleared = () => {
    if (window.location.pathname !== '/player') return;
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    lastAutoSearchQuery = '';
    showSearchShell({ focus: true });
  };

  window.addEventListener('app:active-player-cleared', handleActivePlayerCleared);
  detachPlayerPageClearListener = () => {
    window.removeEventListener('app:active-player-cleared', handleActivePlayerCleared);
    detachPlayerPageClearListener = null;
  };

  if (activePlayer) {
    hideSearchShell();
  }

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 10);
  }

}

function getPlayerLookupStrategies(query) {
  const normalizedQuery = query.trim();
  const language = getCurrentLanguage();
  if (!normalizedQuery) return [];

  if (UUID_PATTERN.test(normalizedQuery)) {
    return [{
      id: normalizedQuery,
      label: language === 'en' ? 'Player UUID' : language === 'zh' ? '玩家 UUID' : 'UUID pemain'
    }];
  }

  if (NUMERIC_ID_PATTERN.test(normalizedQuery)) {
    return [{ deltaForceId: normalizedQuery, label: 'Delta Force ID' }];
  }

  const nameVariants = Array.from(new Set([
    normalizedQuery,
    normalizedQuery.toLowerCase(),
    normalizedQuery
      .toLowerCase()
      .split(/\s+/)
      .map(part => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
      .join(' '),
  ]));

  return [
    ...nameVariants.map(name => ({
      name,
      label: language === 'en' ? 'player name' : language === 'zh' ? '玩家名称' : 'nama pemain'
    })),
    { deltaForceId: normalizedQuery, label: 'Delta Force ID' },
  ];
}

function isValidResolvedPlayer(player) {
  return Boolean(player && (player.id || player.deltaForceId));
}

async function resolvePlayerQuery(query) {
  const cachedPlayerEntry = getFreshCacheEntry(playerLookupCache, normalizePlayerQueryKey(query), PLAYER_CACHE_MAX_AGE_MS.lookup);
  if (cachedPlayerEntry?.value && isValidResolvedPlayer(cachedPlayerEntry.value)) {
    return {
      player: cachedPlayerEntry.value,
      strategy: { cached: true },
    };
  }

  const lookupStrategies = getPlayerLookupStrategies(query);
  let lastError = null;

  for (const strategy of lookupStrategies) {
    try {
      const playerData = await retryPlayerResource(() => getPlayer(strategy), {
        attempts: strategy.name ? 2 : 1,
        delayMs: 600,
        isReady: value => {
          const player = value?.player || value;
          return isValidResolvedPlayer(player);
        },
      });
      const player = playerData.player || playerData;

      if (isValidResolvedPlayer(player)) {
        cacheResolvedPlayer(player, query);
        return {
          player,
          strategy,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new Error(t('player.invalidQuery'));
}

async function loadPlayerData(container, query, { hideSearchOnSuccess = false } = {}) {
  const requestId = ++activePlayerRequestId;
  destroyPlayerCharts();
  const searchResults = container.querySelector('#player-search-results');
  const contentEl = container.querySelector('#player-content');
  if (searchResults) {
    searchResults.innerHTML = '';
  }
  contentEl.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">${t('player.loading')}</span>
    </div>
  `;

  const seasonsPromise = allSeasons.length === 0
    ? listSeasons()
        .then((s) => {
          if (s?.seasons) {
            allSeasons = s.seasons.sort((a, b) => b.number - a.number);
          }
          return allSeasons;
        })
        .catch((e) => {
          console.error('Failed to load seasons:', e);
          return allSeasons;
        })
    : Promise.resolve(allSeasons);

  try {
    const [{ player }] = await Promise.all([
      resolvePlayerQuery(query),
      seasonsPromise,
    ]);

    if (isStalePlayerRequest(requestId)) {
      return;
    }

    if (!isValidResolvedPlayer(player)) {
      container.querySelector('#player-search-shell')?.classList.remove('hidden');
      if (searchResults && !getActivePlayerProfileSummary()) {
        searchResults.innerHTML = renderSearchFeedbackState({
          icon: 'user-search',
          title: t('player.notFoundTitle'),
          message: t('player.notFoundHint'),
        });
        contentEl.innerHTML = '';
      } else {
        contentEl.innerHTML = renderSearchFeedbackState({
          icon: 'user-search',
          title: t('player.notFoundTitle'),
          message: t('player.notFoundHint'),
        });
      }
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Save persistence on success
    localStorage.setItem('lastPlayerQuery', query);
    addRecentSearch(player);
    persistActivePlayerProfile(player);

    const playerName = player.name || player.deltaForceId || 'Unknown';
    window.updateMetadata({
      title: `${playerName} — ${t('player.title')}`,
      description: t('routes.player.description')
    });

    if (hideSearchOnSuccess) {
      container.querySelector('#player-search-shell')?.classList.add('hidden');
    }
    renderPlayerProfile(contentEl, player, requestId);
  } catch (err) {
    if (isStalePlayerRequest(requestId)) {
      return;
    }
    console.error('Player search error:', err);
    const errMsg = err.message || '';
    let errorTitle = t('player.errorTitle');
    let errorHint = t('player.errorHint');
    let errorIcon = 'alert-triangle';

    if (errMsg.includes('404') || errMsg.includes('not found')) {
      errorTitle = t('player.notFoundTitle');
      errorHint = t('player.notFoundHint');
      errorIcon = 'user-search';
    }

    container.querySelector('#player-search-shell')?.classList.remove('hidden');
    if (searchResults && !getActivePlayerProfileSummary()) {
      searchResults.innerHTML = renderSearchFeedbackState({
        icon: errorIcon,
        title: errorTitle,
        message: errorHint,
      });
      contentEl.innerHTML = '';
    } else {
      contentEl.innerHTML = renderSearchFeedbackState({
        icon: errorIcon,
        title: errorTitle,
        message: errorHint,
      });
    }
    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }
  }
}

function renderPlayerProfile(container, player, requestId) {
  const activeSeason = allSeasons.find(s => s.active) || allSeasons[0];
  const activeSeasonId = activeSeason ? activeSeason.id : null;
  const initialViewState = getPlayerViewState(player.id, activeSeasonId);
  const initialSeasonId = initialViewState.seasonId ?? activeSeasonId ?? '';
  const initialRanked = Boolean(initialViewState.ranked);
  const buildModeOptions = () => ([
    { value: 'false', label: t('player.modeAll') },
    { value: 'true', label: t('player.modeRanked') },
  ]);
  const buildSeasonOptions = ({ availabilityMap = null } = {}) => {
    const options = [{ value: '', label: t('player.seasonAll') }];

    allSeasons.forEach(season => {
      const availability = availabilityMap?.[season.id];
      const suffix = availability === 'no_data' ? ` • ${t('player.seasonNoData')}` : '';
      options.push({
        value: season.id,
        label: `S${season.number}: ${season.name}${suffix}`,
      });
    });

    return options;
  };

  container.innerHTML = `
    <div>
      <div id="stats-toolbar" class="stats-toolbar mb-lg" style="display: none;">
        <span id="stats-last-update" class="stats-last-update text-muted"></span>
        <div class="season-selector">
          <div class="stats-dropdown stats-filter-group stats-filter-group-sm" id="mode-filter-dropdown">
            <input type="hidden" id="mode-filter" value="${initialRanked ? 'true' : 'false'}" />
            <button type="button" class="stats-dropdown-trigger" id="mode-filter-trigger" aria-haspopup="true" aria-expanded="false">
              <span id="mode-filter-text"></span>
              <span class="stats-dropdown-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                </svg>
              </span>
            </button>
            <div class="stats-dropdown-menu hidden" id="mode-filter-menu" role="menu" aria-labelledby="mode-filter-trigger"></div>
          </div>

          <div class="stats-dropdown stats-filter-group stats-filter-group-lg" id="season-filter-dropdown">
            <input type="hidden" id="season-filter" value="${initialSeasonId}" />
            <button type="button" class="stats-dropdown-trigger" id="season-filter-trigger" aria-haspopup="true" aria-expanded="false">
              <span id="season-filter-text"></span>
              <span class="stats-dropdown-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                </svg>
              </span>
            </button>
            <div class="stats-dropdown-menu hidden" id="season-filter-menu" role="menu" aria-labelledby="season-filter-trigger"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-lg">
      <div id="stats-context-note" class="stats-context-note" style="display: none;"></div>
      <div id="player-resource-status">
        ${renderSectionLoadingState({
          message: t('player.loadingResources'),
          className: '',
        })}
      </div>
      <div id="stats-wrapper" style="display: none;"></div>
    </div>
  `;

  const seasonFilter = container.querySelector('#season-filter');
  const modeFilter = container.querySelector('#mode-filter');
  const statsToolbar = container.querySelector('#stats-toolbar');
  const seasonFilterDropdown = container.querySelector('#season-filter-dropdown');
  const modeFilterDropdown = container.querySelector('#mode-filter-dropdown');
  const seasonFilterTrigger = container.querySelector('#season-filter-trigger');
  const modeFilterTrigger = container.querySelector('#mode-filter-trigger');
  const seasonFilterText = container.querySelector('#season-filter-text');
  const modeFilterText = container.querySelector('#mode-filter-text');
  const seasonFilterMenu = container.querySelector('#season-filter-menu');
  const modeFilterMenu = container.querySelector('#mode-filter-menu');
  const statsContextNote = container.querySelector('#stats-context-note');
  const resourceStatus = container.querySelector('#player-resource-status');
  const statsWrapper = container.querySelector('#stats-wrapper');
  const getAvailabilityCacheKey = ranked => `${player.id}:${ranked ? 'ranked' : 'all'}`;
  const resourceState = {
    stats: 'loading',
  };
  startLoadingStateAnimation(container);

  const setStatsContextNote = (message = '') => {
    if (!statsContextNote) return;
    if (!message) {
      statsContextNote.style.display = 'none';
      statsContextNote.innerHTML = '';
      return;
    }

    statsContextNote.style.display = 'flex';
    statsContextNote.innerHTML = `
      <div class="stats-context-note__content">
        <i data-lucide="info" style="width: 14px; height: 14px;"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="stats-context-note__close" aria-label="Close notice">
        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
      </button>
    `;

    const closeButton = statsContextNote.querySelector('.stats-context-note__close');
    if (closeButton) {
      closeButton.addEventListener('click', () => setStatsContextNote(''), { once: true });
    }

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }
  };

  const rememberCurrentViewState = () => {
    setPlayerViewState(player.id, {
      seasonId: seasonFilter.value || '',
      ranked: modeFilter.value === 'true',
    });
  };

  const toggleStatsDropdown = (dropdown, trigger, menu, forceOpen) => {
    if (!dropdown || !trigger || !menu) return;
    const shouldOpen = typeof forceOpen === 'boolean'
      ? forceOpen
      : menu.classList.contains('hidden');

    dropdown.classList.toggle('open', shouldOpen);
    menu.classList.toggle('hidden', !shouldOpen);
    trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  };

  const closeStatsDropdowns = () => {
    toggleStatsDropdown(modeFilterDropdown, modeFilterTrigger, modeFilterMenu, false);
    toggleStatsDropdown(seasonFilterDropdown, seasonFilterTrigger, seasonFilterMenu, false);
  };

  const renderModeOptions = () => {
    const options = buildModeOptions();
    const selectedValue = modeFilter.value || 'false';
    const activeOption = options.find(option => option.value === selectedValue) || options[0];

    modeFilterText.textContent = activeOption.label;
    modeFilterMenu.innerHTML = options.map(option => `
      <button
        type="button"
        class="stats-dropdown-option${option.value === selectedValue ? ' active' : ''}"
        data-stats-option="mode"
        data-value="${option.value}"
        role="menuitem"
      >
        <span class="stats-dropdown-option-label">${escapeHTML(option.label)}</span>
      </button>
    `).join('');
  };

  const renderResolvedStats = (response, seasonId, availabilityMap, availabilityCacheKey, { preserveContextNote = false } = {}) => {
    if (seasonId) {
      availabilityMap[seasonId] = 'has_data';
      seasonAvailabilityCache.set(availabilityCacheKey, availabilityMap);
      renderSeasonOptions(availabilityMap);
    }

    statsWrapper.innerHTML = renderStats(response.stats);
    statsWrapper.style.display = 'block';
    if (statsToolbar) {
      statsToolbar.style.display = 'flex';
    }
    resourceState.stats = 'ready';
    renderScoreBreakdownChart(response.stats);
    updatePlayerResourceStatus();

    const statsUpdateEl = container.querySelector('#stats-last-update');
    if (statsUpdateEl && response.stats.updatedAt) {
      statsUpdateEl.innerHTML = `<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> ${t('player.statsUpdated')}: ${formatDateTime(response.stats.updatedAt)}`;
    } else if (statsUpdateEl) {
      statsUpdateEl.innerHTML = '';
    }

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }

    if (!preserveContextNote) {
      setStatsContextNote('');
    }
  };

  const renderSeasonOptions = (availabilityMap = null) => {
    const selectedSeasonId = seasonFilter.value || '';
    const options = buildSeasonOptions({ availabilityMap });
    const activeOption = options.find(option => option.value === selectedSeasonId) || options[0];

    seasonFilterText.textContent = activeOption.label;
    seasonFilterMenu.innerHTML = options.map(option => `
      <button
        type="button"
        class="stats-dropdown-option${option.value === selectedSeasonId ? ' active' : ''}"
        data-stats-option="season"
        data-value="${escapeHTML(option.value)}"
        role="menuitem"
      >
        <span class="stats-dropdown-option-label">${escapeHTML(option.label)}</span>
      </button>
    `).join('');
  };

  const updateSeasonAvailability = async ({ ranked = false, prioritizeSeasonId = '' } = {}) => {
    const cacheKey = getAvailabilityCacheKey(ranked);
    const cachedAvailability = seasonAvailabilityCache.get(cacheKey);
    if (cachedAvailability) {
      renderSeasonOptions(cachedAvailability);
    }

    const availabilityMap = { ...(cachedAvailability || {}) };

    for (const season of allSeasons) {
      if (isStalePlayerRequest(requestId)) return;
      if (availabilityMap[season.id] === 'has_data' || availabilityMap[season.id] === 'no_data') {
        continue;
      }

      try {
        const response = await retryPlayerResource(() => getPlayerOperationStats(player.id, {
          seasonId: season.id,
          ranked,
        }), {
          attempts: season.id === prioritizeSeasonId ? 2 : 1,
          delayMs: 800,
          isReady: hasStatsPayload,
          requestId,
        });

        availabilityMap[season.id] = response?.stats ? 'has_data' : 'no_data';
      } catch (error) {
        const errorMessage = String(error?.message || '').toLowerCase();
        availabilityMap[season.id] = errorMessage.includes('404') || errorMessage.includes('not_found')
          ? 'no_data'
          : 'unknown';
      }
    }

    if (isStalePlayerRequest(requestId)) return;
    seasonAvailabilityCache.set(cacheKey, availabilityMap);
    renderSeasonOptions(availabilityMap);
  };

  const updatePlayerResourceStatus = () => {
    if (!resourceStatus) return;

    if (resourceState.stats === 'loading') {
      if (statsToolbar) {
        statsToolbar.style.display = 'flex';
      }
      resourceStatus.style.display = 'block';
      resourceStatus.innerHTML = renderSectionLoadingState({
        message: t('player.statsLoading'),
        className: '',
      });
      startLoadingStateAnimation(resourceStatus);
      return;
    }

    if (resourceState.stats !== 'ready') {
      if (statsToolbar) {
        statsToolbar.style.display = 'flex';
      }
      resourceStatus.style.display = 'block';
      resourceStatus.innerHTML = renderSectionEmptyState({
        message: `${t('player.noData')}. ${t('player.noDataHint')}`,
        className: '',
      });
      return;
    }

    resourceStatus.style.display = 'none';
    resourceStatus.innerHTML = '';
  };

  const loadStatsResource = ({ seasonId, ranked, onPending = null }) => {
    const fetchStats = () => getPlayerOperationStats(player.id, { seasonId, ranked });
    if (seasonId) {
      return retryPlayerResource(fetchStats, {
        attempts: 4,
        delayMs: 1500,
        isReady: hasStatsPayload,
        requestId,
      });
    }

    return pollPlayerResource(fetchStats, {
      attemptsPerCycle: 2,
      attemptDelayMs: 1500,
      pollIntervalMs: 4000,
      maxPollMs: 90000,
      isReady: hasStatsPayload,
      requestId,
      onPending,
    });
  };

  const fetchUpdatedStats = async ({ allowAutoFallback = false } = {}) => {
    if (isStalePlayerRequest(requestId)) return;
    const seasonId = seasonFilter.value;
    const ranked = modeFilter.value === 'true';
    const availabilityCacheKey = getAvailabilityCacheKey(ranked);
    const availabilityMap = { ...(seasonAvailabilityCache.get(availabilityCacheKey) || {}) };
    const statsCacheKey = getStatsCacheKey(player.id, seasonId, ranked);
    const freshStatsCache = getFreshCacheEntry(playerStatsCache, statsCacheKey, PLAYER_CACHE_MAX_AGE_MS.stats);
    const anyStatsCache = playerStatsCache.get(statsCacheKey);
    const cachedSeasonEmpty = freshStatsCache?.value?.status === 'empty';

    if (scoreBreakdownChart) {
      scoreBreakdownChart.destroy();
      scoreBreakdownChart = null;
    }

    rememberCurrentViewState();

    if (freshStatsCache?.value?.status === 'ready' && freshStatsCache.value.response?.stats) {
      renderResolvedStats(freshStatsCache.value.response, seasonId, availabilityMap, availabilityCacheKey);
      return;
    }

    if (cachedSeasonEmpty && !(allowAutoFallback && seasonId)) {
      resourceState.stats = 'empty';
      statsWrapper.style.display = 'none';
      statsWrapper.innerHTML = '';
      updatePlayerResourceStatus();
      return;
    }

    if (anyStatsCache?.value?.status === 'ready' && anyStatsCache.value.response?.stats) {
      renderResolvedStats(anyStatsCache.value.response, seasonId, availabilityMap, availabilityCacheKey);
    } else {
      resourceState.stats = 'loading';
      statsWrapper.style.display = 'none';
      statsWrapper.innerHTML = '';
      if (statsToolbar) {
        statsToolbar.style.display = 'none';
      }
      updatePlayerResourceStatus();
    }

    try {
      const res = cachedSeasonEmpty
        ? null
        : await loadStatsResource({
            seasonId,
            ranked,
            onPending: () => {},
          });

      if (isStalePlayerRequest(requestId)) return;

      if (res?.stats) {
        setCacheEntry(playerStatsCache, statsCacheKey, {
          status: 'ready',
          response: res,
        });
        renderResolvedStats(res, seasonId, availabilityMap, availabilityCacheKey);
      } else {
        throw new Error("NOT_FOUND: Data stat kosong untuk filter ini");
      }
    } catch (err) {
      if (isStalePlayerRequest(requestId)) return;
      console.error('Stats fetch error:', err);
      const errMsg = err.message || '';

      if (errMsg.includes('404') || errMsg.includes('not_found') || errMsg.includes('Data stat kosong')) {
        if (seasonId) {
          availabilityMap[seasonId] = 'no_data';
          seasonAvailabilityCache.set(availabilityCacheKey, availabilityMap);
          renderSeasonOptions(availabilityMap);
        }
        setCacheEntry(playerStatsCache, statsCacheKey, {
          status: 'empty',
        });

        if (allowAutoFallback && seasonId) {
          try {
            const allTimeCacheKey = getStatsCacheKey(player.id, '', ranked);
            const freshAllTimeCache = getFreshCacheEntry(playerStatsCache, allTimeCacheKey, PLAYER_CACHE_MAX_AGE_MS.stats);
            if (freshAllTimeCache?.value?.status === 'ready' && freshAllTimeCache.value.response?.stats) {
              seasonFilter.value = '';
              rememberCurrentViewState();
              setStatsContextNote(t('player.autoFallbackNotice'));
              renderResolvedStats(freshAllTimeCache.value.response, '', availabilityMap, availabilityCacheKey, {
                preserveContextNote: true,
              });
              return;
            }

            const fallbackRes = await loadStatsResource({
              seasonId: '',
              ranked,
              onPending: () => {},
            });

            if (isStalePlayerRequest(requestId)) return;

            if (fallbackRes?.stats) {
              seasonFilter.value = '';
              rememberCurrentViewState();
              setStatsContextNote(t('player.autoFallbackNotice'));
              setCacheEntry(playerStatsCache, getStatsCacheKey(player.id, '', ranked), {
                status: 'ready',
                response: fallbackRes,
              });
              renderResolvedStats(fallbackRes, '', availabilityMap, availabilityCacheKey, {
                preserveContextNote: true,
              });
              return;
            }
          } catch (fallbackErr) {
            console.error('Stats all-time fallback error:', fallbackErr);
          }
        }

        setStatsContextNote('');
        resourceState.stats = 'empty';
        statsWrapper.style.display = 'none';
        statsWrapper.innerHTML = '';
        updatePlayerResourceStatus();
      } else {
        setStatsContextNote('');
        resourceState.stats = 'empty';
        statsWrapper.style.display = 'none';
        statsWrapper.innerHTML = '';
        updatePlayerResourceStatus();
      }
    }
  };

  renderModeOptions();
  renderSeasonOptions();

  modeFilterTrigger.addEventListener('click', () => {
    toggleStatsDropdown(seasonFilterDropdown, seasonFilterTrigger, seasonFilterMenu, false);
    toggleStatsDropdown(modeFilterDropdown, modeFilterTrigger, modeFilterMenu);
  });

  seasonFilterTrigger.addEventListener('click', () => {
    toggleStatsDropdown(modeFilterDropdown, modeFilterTrigger, modeFilterMenu, false);
    toggleStatsDropdown(seasonFilterDropdown, seasonFilterTrigger, seasonFilterMenu);
  });

  modeFilterMenu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-stats-option="mode"]');
    if (!option) return;
    const nextValue = option.dataset.value || 'false';
    if (modeFilter.value !== nextValue) {
      modeFilter.value = nextValue;
      setStatsContextNote('');
      rememberCurrentViewState();
      renderModeOptions();
      renderSeasonOptions(seasonAvailabilityCache.get(getAvailabilityCacheKey(modeFilter.value === 'true')) || null);
      updateSeasonAvailability({ ranked: modeFilter.value === 'true', prioritizeSeasonId: seasonFilter.value });
      fetchUpdatedStats();
    }
    closeStatsDropdowns();
  });

  seasonFilterMenu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-stats-option="season"]');
    if (!option) return;
    const nextValue = option.dataset.value || '';
    if (seasonFilter.value !== nextValue) {
      seasonFilter.value = nextValue;
      setStatsContextNote('');
      rememberCurrentViewState();
      renderSeasonOptions(seasonAvailabilityCache.get(getAvailabilityCacheKey(modeFilter.value === 'true')) || null);
      fetchUpdatedStats();
    }
    closeStatsDropdowns();
  });

  if (detachStatsDropdownListeners) {
    detachStatsDropdownListeners();
  }

  const handleDocumentStatsDropdownClick = (event) => {
    if (!container.contains(event.target)) {
      closeStatsDropdowns();
      return;
    }

    if (!event.target.closest('.stats-dropdown')) {
      closeStatsDropdowns();
    }
  };

  document.addEventListener('click', handleDocumentStatsDropdownClick);
  detachStatsDropdownListeners = () => {
    document.removeEventListener('click', handleDocumentStatsDropdownClick);
    detachStatsDropdownListeners = null;
  };

  updateSeasonAvailability({ ranked: false, prioritizeSeasonId: activeSeasonId || '' });
  updatePlayerResourceStatus();
  fetchUpdatedStats({ allowAutoFallback: true });

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 50);
  }
}

function renderStats(stats) {
  const statItems = [
    { label: t('player.metrics.kdRatio'), value: stats.kdRatio?.toFixed(2) || '0', icon: 'swords', color: 'var(--accent-primary)' },
    { label: t('player.metrics.extraction'), value: `${((stats.extractionRate || 0) * 100).toFixed(1)}%`, icon: 'person-standing', color: 'var(--accent-green)' },
    { label: t('player.metrics.totalKills'), value: formatNumber(stats.totalKills || 0), icon: 'skull', color: 'var(--accent-red)' },
    { label: t('player.metrics.totalDeaths'), value: formatNumber(stats.totalDeaths || 0), icon: 'ghost', color: 'var(--accent-orange)' },
    { label: t('player.metrics.matchesPlayed'), value: formatNumber(stats.matchesPlayed || 0), icon: 'gamepad-2', color: 'var(--accent-blue)' },
    { label: t('player.metrics.accuracy'), value: `${((stats.bulletDischargedHitRatio || 0) * 100).toFixed(1)}%`, icon: 'crosshair', color: 'var(--accent-purple)' },
    { label: t('player.metrics.headshotRate'), value: `${((stats.knockedHeadshotRatio || 0) * 100).toFixed(1)}%`, icon: 'target', color: 'var(--accent-primary)' },
    { label: t('player.metrics.revives'), value: formatNumber(stats.revives || 0), icon: 'heart-pulse', color: 'var(--accent-green)' },
  ];

  const matchInfo = [
    { label: t('player.metrics.matchesExtracted'), value: formatNumber(stats.matchesExtracted || 0) },
    { label: t('player.metrics.matchesLost'), value: formatNumber(stats.matchesLost || 0) },
    { label: t('player.metrics.matchesQuit'), value: formatNumber(stats.matchesQuit || 0) },
    { label: t('player.metrics.playTime'), value: formatPlayTime(stats.playTime || 0) },
    { label: t('player.metrics.rankedPoints'), value: formatNumber(stats.rankedPoints || 0) },
    { label: t('player.metrics.pickups'), value: formatNumber(stats.pickups || 0) },
  ];

  const gunplayInfo = [
    { label: t('player.metrics.totalFired'), value: formatNumber(stats.bulletsDischarged || 0) },
    { label: t('player.metrics.bulletsHit'), value: formatNumber(stats.bulletsDischargedHit || 0) },
    { label: t('player.metrics.bulletsMissed'), value: formatNumber(stats.bulletsDischargedMissed || 0) },
    { label: t('player.metrics.knockedCount'), value: formatNumber(stats.knockedCount || 0) },
    { label: t('player.metrics.headshotCount'), value: formatNumber(stats.knockedHeadshotCount || 0) },
    { label: t('player.metrics.bulletsPerKnock'), value: stats.bulletsDischargedPerKnock?.toFixed(2) || '0' },
    { label: t('player.metrics.hitsPerKnock'), value: stats.bulletsDischargedHitPerKnock?.toFixed(2) || '0' },
  ];

  const extractionInfo = [
    { label: t('player.metrics.extractedAssets'), value: formatPriceShort(stats.extractedAssets || 0) },
    { label: t('player.metrics.teammateAssetsSaved'), value: formatPriceShort(stats.extractedTeammateAssets || 0) },
    { label: t('player.metrics.mandlebricksExtracted'), value: formatNumber(stats.extractedMandlebricks || 0) },
  ];

  const diffData = {
    easy: [
      { label: t('player.metrics.kdRatio'), value: stats.kdRatioEasy?.toFixed(2) || '-' },
      { label: t('player.metrics.totalKills'), value: formatNumber(stats.totalKillsEasy || 0) },
      { label: t('player.metrics.totalDeaths'), value: formatNumber(stats.totalDeathsEasy || 0) },
    ],
    normal: [
      { label: t('player.metrics.kdRatio'), value: stats.kdRatioMedium?.toFixed(2) || '-' },
      { label: t('player.metrics.totalKills'), value: formatNumber(stats.totalKillsMedium || 0) },
      { label: t('player.metrics.totalDeaths'), value: formatNumber(stats.totalDeathsMedium || 0) },
    ],
    hard: [
      { label: t('player.metrics.kdRatio'), value: stats.kdRatioHard?.toFixed(2) || '-' },
      { label: t('player.metrics.totalKills'), value: formatNumber(stats.totalKillsHard || 0) },
      { label: t('player.metrics.totalDeaths'), value: formatNumber(stats.totalDeathsHard || 0) },
    ]
  };

  window.switchDiffTab = function (level) {
    document.querySelectorAll('.diff-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.diff-content').forEach(c => c.style.display = 'none');
    const targetTab = document.getElementById(`tab-${level}`);
    if (targetTab) targetTab.classList.add('active');
    const targetContent = document.getElementById(`content-${level}`);
    if (targetContent) targetContent.style.display = 'grid';
  };

  function renderGrid(items) {
    return items.map(s => `
      <div style="padding: var(--space-xs)">
        <div class="text-muted" style="font-size: 0.70rem; text-transform: uppercase; letter-spacing: 0.5px">${s.label}</div>
        <div class="text-mono" style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin-top: 2px">${s.value}</div>
      </div>
    `).join('');
  }

  return `
    <div class="grid-4 mb-lg">
      ${statItems.map(s => `
        <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
          <div style="font-size: 2rem; color: ${s.color}; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: var(--radius-md); background: rgba(255,255,255,0.03);"><i data-lucide="${s.icon}"></i></div>
          <div style="flex: 1;">
            <div class="stat-value" style="font-size: 1.6rem; color: ${s.color}; -webkit-text-fill-color: initial; background: none;">${s.value}</div>
            <div class="stat-label" style="margin-top: 0;">${s.label}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="grid-2 mb-lg" style="gap: var(--space-md)">
      <div class="card" style="height: 100%">
          <div class="card-header" style="display: flex; align-items: center; gap: 8px;">
          <i data-lucide="gamepad-2" style="width: 18px"></i><span class="card-title">${t('player.sectionMatchInfo')}</span>
        </div>
        <div class="grid-3" style="padding: var(--space-sm)">
          ${renderGrid([...matchInfo, ...extractionInfo])}
        </div>
      </div>

      <div class="card" style="height: 100%">
          <div class="card-header" style="display: flex; align-items: center; gap: 8px;">
          <i data-lucide="crosshair" style="width: 18px"></i><span class="card-title">${t('player.sectionGunplay')}</span>
        </div>
        <div class="grid-3" style="padding: var(--space-sm)">${renderGrid(gunplayInfo)}</div>
      </div>
    </div>

    <div class="grid-2 mb-lg" style="gap: var(--space-md); align-items: stretch;">
      <div class="card" style="height: 100%;">
        <div class="card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="trophy" style="width: 18px; color: var(--accent-gold)"></i><span class="card-title">${t('player.sectionScoreBreakdown')}</span>
          </div>
          <span class="text-muted" style="font-size: 0.75rem;">${t('player.scoreBreakdownHint')}</span>
        </div>
        <div class="chart-container" style="height: 340px; padding-top: 0;">
          <canvas id="score-breakdown-chart"></canvas>
        </div>
      </div>

      <div class="card" style="height: 100%;">
        <div class="card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="flame" style="width: 18px; color: var(--accent-orange)"></i>
            <span class="card-title">${t('player.sectionDifficulty')}</span>
          </div>
          <div class="diff-tabs" style="display: flex; gap: 4px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: var(--radius-md);">
            <button id="tab-easy" class="diff-tab active" onclick="switchDiffTab('easy')">${t('player.difficultyEasy')}</button>
            <button id="tab-normal" class="diff-tab" onclick="switchDiffTab('normal')">${t('player.difficultyNormal')}</button>
            <button id="tab-hard" class="diff-tab" onclick="switchDiffTab('hard')">${t('player.difficultyHard')}</button>
          </div>
        </div>

        <div id="content-easy" class="diff-content grid-3" style="padding: var(--space-md); display: grid;">
          ${renderGrid(diffData.easy)}
        </div>
        <div id="content-normal" class="diff-content grid-3" style="padding: var(--space-md); display: none;">
          ${renderGrid(diffData.normal)}
        </div>
        <div id="content-hard" class="diff-content grid-3" style="padding: var(--space-md); display: none;">
          ${renderGrid(diffData.hard)}
        </div>
      </div>
    </div>
  `;
}

function renderStashValue(stash) {
  const liquid = Number(stash.assetsLiquid || 0);
  const fixed = Number(stash.assetsFixed || 0);
  const collection = Number(stash.assetsCollection || 0);
  const net = Number(stash.assetsNet || 0);

  return `
    <div class="grid-4 mb-lg">
      <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
        <div style="font-size: 1.5rem; color: var(--accent-green); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(74, 222, 128, 0.1);"><i data-lucide="banknote"></i></div>
        <div style="flex: 1;">
          <div class="stat-value" style="font-size: 1.4rem; color: var(--accent-green); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(liquid)}</div>
          <div class="stat-label" style="margin-top: 0;">${t('player.liquidAssets')}</div>
        </div>
      </div>
      <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
        <div style="font-size: 1.5rem; color: var(--accent-blue); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(96, 165, 250, 0.1);"><i data-lucide="home"></i></div>
        <div style="flex: 1;">
          <div class="stat-value" style="font-size: 1.4rem; color: var(--accent-blue); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(fixed)}</div>
          <div class="stat-label" style="margin-top: 0;">${t('player.fixedAssets')}</div>
        </div>
      </div>
      <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
        <div style="font-size: 1.5rem; color: var(--accent-purple); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(192, 132, 252, 0.1);"><i data-lucide="archive"></i></div>
        <div style="flex: 1;">
          <div class="stat-value" style="font-size: 1.4rem; color: var(--accent-purple); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(collection)}</div>
          <div class="stat-label" style="margin-top: 0;">${t('player.collectionAssets')}</div>
        </div>
      </div>
      <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
        <div style="font-size: 1.5rem; color: var(--text-primary); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.05);"><i data-lucide="bar-chart-3"></i></div>
        <div style="flex: 1;">
          <div class="stat-value" style="font-size: 1.4rem; color: var(--text-primary); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(net)}</div>
          <div class="stat-label" style="margin-top: 0;">${t('player.netWorth')}</div>
        </div>
      </div>
    </div>
  `;
}

function renderStashSummaryLoading(renderLoadingState, message = t('player.stashSummaryLoading')) {
  return renderLoadingState({
    icon: 'coins',
    title: t('player.stashTitle'),
    message,
  });
}

function renderStashSummaryUnavailable() {
  return renderSectionEmptyState({
    message: t('player.stashSummaryUnavailable'),
  });
}

function setWealthLastUpdate(timestamp = '') {
  const lastUpdateEl = document.getElementById('wealth-last-update');
  if (!lastUpdateEl) return;

  if (timestamp) {
    lastUpdateEl.innerHTML = `<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> ${t('player.stashUpdated')}: ${formatDateTime(timestamp)}`;
    if (window.lucide) {
      window.lucide.createIcons();
    }
    return;
  }

  lastUpdateEl.innerHTML = '';
}

async function renderHistoricalStashSeries(historyWrapper, allSeries) {
  historyWrapper.innerHTML = renderWealthHistoryCard(`
    <div class="chart-container">
      <canvas id="stash-chart"></canvas>
    </div>
  `);
  historyWrapper.style.display = 'block';

  const canvas = historyWrapper.querySelector('#stash-chart');
  if (!canvas) return false;

  allSeries.sort((a, b) => {
    const timeA = new Date(a.time || a.createdAt || a.timestamp || 0);
    const timeB = new Date(b.time || b.createdAt || b.timestamp || 0);
    return timeA - timeB;
  });

  const latestEntry = allSeries[allSeries.length - 1];
  const labels = allSeries.map(s => {
    const d = new Date(s.time || s.createdAt || s.timestamp || 0);
    return d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
  });

  const netValues = allSeries.map(s => Number(s.assetsNet || s.netWorth || s.value || 0));
  const pointRadius = getChartPointRadius(labels.length, 30);
  const tickLimit = getAdaptiveTickLimit(labels.length, 30);
  const Chart = await getChartConstructor();

  if (stashChart) stashChart.destroy();

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(15, 247, 150, 0.3)');
  gradient.addColorStop(1, 'rgba(15, 247, 150, 0)');

  stashChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: t('player.netWorth'),
        data: netValues,
        borderColor: '#0ff796',
        backgroundColor: gradient,
        fill: true,
        cubicInterpolationMode: 'monotone',
        tension: 0.28,
        borderWidth: 1.8,
        pointRadius,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#0ff796',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111a16',
          borderColor: 'rgba(15,247,150,0.3)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${t('player.netWorth')}: ${formatPriceShort(ctx.raw)}`
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => formatPriceShort(v),
            color: '#5c6860',
            font: { size: 10, family: 'JetBrains Mono' }
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
          grace: '8%',
        },
        x: {
          ticks: {
            color: '#5c6860',
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: tickLimit,
          },
          grid: { display: false }
        }
      }
    }
  });

  return true;
}

export async function renderWealthPage(container) {
  destroyPlayerCharts();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><i data-lucide="wallet" style="margin-right: 8px"></i>${t('player.stashTitle')}</h1>
      <p class="page-subtitle">${t('player.wealthHint')}</p>
    </div>
    <div id="wealth-page-content">
      ${renderSectionLoadingState({
        message: t('player.loadingResources'),
        className: '',
      })}
    </div>
  `;

  const contentEl = container.querySelector('#wealth-page-content');
  startLoadingStateAnimation(contentEl);

  try {
    const player = await resolveActivePlayerForSharedPages();

    if (!player) {
      contentEl.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl) 0">
          <div class="empty-icon text-muted"><i data-lucide="wallet-cards" style="width: 48px; height: 48px;"></i></div>
          <div class="empty-hint">${t('player.wealthNoPlayer')}</div>
          <div style="margin-top: var(--space-lg); display: flex; justify-content: center;">
            <a href="/player" class="btn btn-secondary">
              <i data-lucide="arrow-left-right" style="width: 16px; height: 16px;"></i>
              ${t('player.goToStats')}
            </a>
          </div>
        </div>
      `;
      if (window.lucide) {
        setTimeout(() => window.lucide.createIcons(), 10);
      }
      return;
    }

    const playerName = player.name || player.deltaForceId || 'Unknown';
    window.updateMetadata({
      title: `${playerName} — ${t('player.stashTitle')}`,
      description: t('routes.wealth.description')
    });

    contentEl.innerHTML = `
      <div id="wealth-toolbar" class="stats-toolbar mb-lg" style="display: none;">
        <span id="wealth-last-update" class="stats-last-update text-muted"></span>
      </div>
      <div id="wealth-resource-status">
        ${renderSectionLoadingState({
          message: t('player.loadingResources'),
          className: '',
        })}
      </div>
      <div id="stash-wrapper" style="display: none;"></div>
      <div id="stash-history-wrapper" style="display: none;"></div>
    `;

    const resourceStatus = contentEl.querySelector('#wealth-resource-status');
    const wealthToolbar = contentEl.querySelector('#wealth-toolbar');
    const stashWrapper = contentEl.querySelector('#stash-wrapper');
    const historyWrapper = contentEl.querySelector('#stash-history-wrapper');
    const resourceState = {
      stash: 'loading',
      history: 'loading',
    };

    const updatePlayerResourceStatus = () => {
      if (!resourceStatus) return;

      const states = Object.values(resourceState);
      const hasLoading = states.includes('loading');
      const hasReady = states.includes('ready');

      if (hasLoading) {
        if (wealthToolbar) {
          wealthToolbar.style.display = 'none';
        }
        resourceStatus.style.display = 'block';
        resourceStatus.innerHTML = renderSectionLoadingState({
          message: t('player.loadingResources'),
          className: '',
        });
        startLoadingStateAnimation(resourceStatus);
        return;
      }

      if (!hasReady) {
        if (wealthToolbar) {
          wealthToolbar.style.display = 'none';
        }
        resourceStatus.style.display = 'block';
        resourceStatus.innerHTML = renderSectionEmptyState({
          message: t('player.combinedUnavailable'),
          className: '',
        });
        return;
      }

      if (wealthToolbar) {
        wealthToolbar.style.display = 'flex';
      }
      resourceStatus.style.display = 'none';
      resourceStatus.innerHTML = '';
    };

    updatePlayerResourceStatus();
    const requestId = ++activePlayerRequestId;

    loadStashValue(player.id, requestId, {
      stashWrapper,
      resourceState,
      updatePlayerResourceStatus,
    });
    loadStashChart(player.id, requestId, {
      historyWrapper,
      resourceState,
      updatePlayerResourceStatus,
    });
  } catch (error) {
    console.error('Wealth page error:', error);
    contentEl.innerHTML = `
      <div class="empty-state" style="padding: var(--space-xl) 0">
        <div class="empty-icon" style="color: var(--accent-red); margin-bottom: var(--space-md);"><i data-lucide="alert-triangle" style="width: 48px; height: 48px;"></i></div>
        <div class="empty-text" style="color: var(--accent-red)">${t('player.errorTitle')}</div>
        <div class="empty-hint">${t('player.errorHint')}</div>
      </div>
    `;
  }

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 10);
  }
}

async function loadStashValue(playerId, requestId, controls = {}) {
  const stashWrapper = controls.stashWrapper || document.getElementById('stash-wrapper');
  if (!stashWrapper) return;
  const resourceState = controls.resourceState || null;
  const updatePlayerResourceStatus = controls.updatePlayerResourceStatus || (() => {});
  const freshStashCache = getFreshCacheEntry(playerStashCache, playerId, PLAYER_CACHE_MAX_AGE_MS.stash);

  stashWrapper.style.display = 'none';
  stashWrapper.innerHTML = '';
  if (freshStashCache?.value?.status === 'ready' && freshStashCache.value.response?.stash) {
    setWealthLastUpdate(freshStashCache.value.response.stash.updatedAt || freshStashCache.value.response.stash.createdAt || '');
    stashWrapper.innerHTML = renderStashValue(freshStashCache.value.response.stash);
    stashWrapper.style.display = 'block';
    if (resourceState) {
      resourceState.stash = 'ready';
      updatePlayerResourceStatus();
    }
    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }
    return;
  }

  if (freshStashCache?.value?.status === 'empty') {
    setWealthLastUpdate('');
    if (resourceState) {
      resourceState.stash = 'empty';
      updatePlayerResourceStatus();
    } else {
      stashWrapper.innerHTML = renderStashSummaryUnavailable();
    }
    return;
  }

  if (resourceState) {
    resourceState.stash = 'loading';
    updatePlayerResourceStatus();
  }

  try {
    const result = await pollPlayerResource(() => getPlayerOperationStashValue(playerId), {
      attemptsPerCycle: 2,
      attemptDelayMs: 1800,
      pollIntervalMs: 4000,
      maxPollMs: 90000,
      isReady: hasStashPayload,
      requestId,
      onPending: () => {
        if (!isStalePlayerRequest(requestId) && stashWrapper.isConnected && resourceState) {
          resourceState.stash = 'loading';
          updatePlayerResourceStatus();
        }
      },
    });

    if (isStalePlayerRequest(requestId) || !stashWrapper.isConnected) return;

    if (result?.stash) {
      setCacheEntry(playerStashCache, playerId, {
        status: 'ready',
        response: result,
      });
      setWealthLastUpdate(result.stash.updatedAt || result.stash.createdAt || '');
      stashWrapper.innerHTML = renderStashValue(result.stash);
      stashWrapper.style.display = 'block';
      if (resourceState) {
        resourceState.stash = 'ready';
        updatePlayerResourceStatus();
      }
    } else {
      setCacheEntry(playerStashCache, playerId, { status: 'empty' });
      setWealthLastUpdate('');
      stashWrapper.style.display = 'none';
      stashWrapper.innerHTML = '';
      if (resourceState) {
        resourceState.stash = 'empty';
        updatePlayerResourceStatus();
      } else {
        stashWrapper.innerHTML = renderStashSummaryUnavailable();
      }
    }
  } catch (err) {
    if (isStalePlayerRequest(requestId) || !stashWrapper.isConnected) return;
    console.error('Stash summary error:', err);
    setCacheEntry(playerStashCache, playerId, { status: 'empty' });
    setWealthLastUpdate('');
    stashWrapper.style.display = 'none';
    stashWrapper.innerHTML = '';
    if (resourceState) {
      resourceState.stash = 'empty';
      updatePlayerResourceStatus();
    } else {
      stashWrapper.innerHTML = renderStashSummaryUnavailable();
    }
  }

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 10);
  }
}

async function resolveActivePlayerForSharedPages() {
  const activePlayer = getActivePlayerProfileSummary();
  if (activePlayer && isValidResolvedPlayer(activePlayer)) {
    return activePlayer;
  }

  const lastQuery = localStorage.getItem('lastPlayerQuery');
  if (!lastQuery) {
    return null;
  }

  const { player } = await resolvePlayerQuery(lastQuery);
  if (isValidResolvedPlayer(player)) {
    persistActivePlayerProfile(player);
    return player;
  }

  return null;
}

async function loadStashChart(playerId, requestId, controls = {}) {
  const historyWrapper = controls.historyWrapper || document.getElementById('stash-history-wrapper');
  if (!historyWrapper) return;
  const resourceState = controls.resourceState || null;
  const updatePlayerResourceStatus = controls.updatePlayerResourceStatus || (() => {});
  const freshHistoryCache = getFreshCacheEntry(playerHistoryCache, playerId, PLAYER_CACHE_MAX_AGE_MS.history);

  historyWrapper.style.display = 'none';
  historyWrapper.innerHTML = '';
  if (freshHistoryCache?.value?.status === 'ready' && Array.isArray(freshHistoryCache.value.series) && freshHistoryCache.value.series.length > 0) {
    const didRender = await renderHistoricalStashSeries(historyWrapper, [...freshHistoryCache.value.series]);
    if (didRender && resourceState) {
      resourceState.history = 'ready';
      updatePlayerResourceStatus();
    }
    return;
  }

  if (freshHistoryCache?.value?.status === 'empty') {
    if (resourceState) {
      resourceState.history = 'empty';
      updatePlayerResourceStatus();
    } else {
      historyWrapper.innerHTML = renderSectionEmptyState({
        message: t('player.stashUnavailable'),
      });
    }
    return;
  }

  if (resourceState) {
    resourceState.history = 'loading';
    updatePlayerResourceStatus();
  } else {
    historyWrapper.innerHTML = renderWealthHistoryLoading();
    startLoadingStateAnimation(historyWrapper);
    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const data = await pollPlayerResource(() => getPlayerOperationHistoricalStashValue(playerId, {
      pageSize: 50,
      startTime: thirtyDaysAgo.toISOString(),
      endTime: now.toISOString()
    }), {
      attemptsPerCycle: 2,
      attemptDelayMs: 1800,
      pollIntervalMs: 4000,
      maxPollMs: 90000,
      isReady: hasHistoricalStashPayload,
      requestId,
      onPending: () => {
        if (!isStalePlayerRequest(requestId) && historyWrapper.isConnected && resourceState) {
          resourceState.history = 'loading';
          updatePlayerResourceStatus();
        }
      },
    });

    if (isStalePlayerRequest(requestId) || !historyWrapper.isConnected) return;
    // Handle multiple possible response structures
    const allSeries = data?.historicalStashValues || data?.stashes || data?.historicalStashValue || data?.series || [];

    if (allSeries.length === 0) {
      setCacheEntry(playerHistoryCache, playerId, { status: 'empty', series: [] });
      historyWrapper.style.display = 'none';
      historyWrapper.innerHTML = '';
      if (resourceState) {
        resourceState.history = 'empty';
        updatePlayerResourceStatus();
      } else {
        historyWrapper.innerHTML = renderSectionEmptyState({
          message: t('player.stashUnavailable'),
        });
        if (window.lucide) {
          setTimeout(() => window.lucide.createIcons(), 10);
        }
      }
      return;
    }

    setCacheEntry(playerHistoryCache, playerId, {
      status: 'ready',
      series: [...allSeries],
    });
    await renderHistoricalStashSeries(historyWrapper, allSeries);
    if (resourceState) {
      resourceState.history = 'ready';
      updatePlayerResourceStatus();
    }
  } catch (err) {
    console.error('Stash chart error:', err);
    if (!historyWrapper.isConnected || isStalePlayerRequest(requestId)) return;
    setCacheEntry(playerHistoryCache, playerId, { status: 'empty', series: [] });
    historyWrapper.style.display = 'none';
    historyWrapper.innerHTML = '';
    if (resourceState) {
      resourceState.history = 'empty';
      updatePlayerResourceStatus();
    } else {
      historyWrapper.innerHTML = renderSectionEmptyState({
        message: `⚠️ ${t('player.chartLoadError')}: ${err.message || t('player.unknownError')}`,
      });
      if (window.lucide) {
        setTimeout(() => window.lucide.createIcons(), 10);
      }
    }
  }
}

async function renderScoreBreakdownChart(stats) {
  const canvas = document.getElementById('score-breakdown-chart');
  if (!canvas) return;

  const scoreItems = [
    { label: 'Combat', value: Number(stats.scoreCombat || 0) },
    { label: 'Survival', value: Number(stats.scoreSurvival || 0) },
    { label: 'Co-op', value: Number(stats.scoreCoop || 0) },
    { label: 'Search', value: Number(stats.scoreSearch || 0) },
    { label: 'Wealth', value: Number(stats.scoreWealth || 0) },
  ];
  const values = scoreItems.map(item => item.value);
  const maxScore = Math.max(100, Math.ceil(Math.max(...values, 0) / 10) * 10);

  if (scoreBreakdownChart) {
    scoreBreakdownChart.destroy();
  }

  const Chart = await getChartConstructor();

  scoreBreakdownChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: scoreItems.map(item => item.label),
      datasets: [
        {
          label: t('player.sectionScoreBreakdown'),
          data: values,
          borderColor: 'rgba(255, 214, 102, 0.95)',
          backgroundColor: 'rgba(255, 214, 102, 0.24)',
          pointBackgroundColor: '#ffd666',
          pointBorderColor: '#fff7d6',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#ffd666',
          pointRadius: 2.5,
          pointHoverRadius: 5,
          borderWidth: 1.4,
          fill: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111a16',
          borderColor: 'rgba(255, 214, 102, 0.35)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${scoreItems[ctx.dataIndex].label}: ${formatNumber(ctx.raw)}`
          }
        }
      },
      scales: {
        r: {
          min: 0,
          max: maxScore,
          beginAtZero: true,
          ticks: {
            display: false,
            stepSize: Math.max(20, Math.ceil(maxScore / 5 / 10) * 10),
          },
          grid: {
            color: 'rgba(255,255,255,0.12)',
            circular: false,
          },
          angleLines: {
            color: 'rgba(255,255,255,0.14)',
          },
          pointLabels: {
            color: '#9ca89f',
            font: {
              size: 12,
              family: 'Inter',
              weight: '600'
            },
            callback: (_, index) => [
              scoreItems[index].label,
              formatNumber(scoreItems[index].value)
            ],
          },
        }
      }
    }
  });
}

function createGradient(canvas, color1, color2) {
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function getAdaptiveTickLimit(points, days) {
  if (points <= 6) return points;
  if (days <= 7) return 7;
  if (days <= 30) return 6;
  return 5;
}

function getChartPointRadius(points, days) {
  if (points <= 8) return 3;
  if (days <= 7 && points <= 16) return 2.5;
  if (points <= 24) return 1.5;
  return 0;
}

function getLocale() {
  const language = getCurrentLanguage();
  if (language === 'en') return 'en-US';
  if (language === 'zh') return 'zh-CN';
  return 'id-ID';
}

function formatNumber(val) {
  const num = Number(val);
  if (isNaN(num)) return '0';
  return num.toLocaleString(getLocale());
}

function formatPriceShort(value) {
  const num = Number(value);
  if (isNaN(num)) return '0';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString(getLocale());
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString(getLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatPlayTime(seconds) {
  const num = Number(seconds);
  if (isNaN(num) || num === 0) return '-';
  const hours = Math.floor(num / 3600);
  const mins = Math.floor((num % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins} m`;
  return `${mins} m`;
}
