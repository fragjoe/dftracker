import { CLIENT_PREFERENCE_KEYS, setClientPreference } from '../api/preferences-store.js';
import { fetchTrackedLeaderboard } from '../api/tracker-store.js';
import { getCurrentLanguage, t } from '../i18n.js';

const DEFAULT_METRIC = 'rankedPoints';
const LEADERBOARD_LIMIT = 100;

const METRIC_KEYS = [
  'rankedPoints',
  'kdRatio',
  'extractionRate',
  'totalKills',
  'matchesPlayed',
  'playTime',
  'extractedAssets',
];

let leaderboardViewRequestId = 0;

export async function renderLeaderboardPage(container) {
  const requestId = ++leaderboardViewRequestId;
  container.innerHTML = `
    <div class="page-header leaderboard-header">
      <h1 class="page-title"><i data-lucide="trophy" style="margin-right: 8px"></i>${t('leaderboard.title')}</h1>
      <p class="page-subtitle">${t('leaderboard.subtitle')}</p>
    </div>

    <div class="leaderboard-filters-card mb-lg">
      <div class="leaderboard-controls-meta">
        <span id="leaderboard-last-sync" class="stats-last-update text-muted"></span>
      </div>
      <div class="leaderboard-controls">
        <div class="search-bar leaderboard-search-bar" style="margin: 0;">
          <span class="search-icon"><i data-lucide="search"></i></span>
          <input
            type="text"
            class="search-input"
            id="leaderboard-search"
            placeholder="${t('leaderboard.searchPlaceholder')}"
            autocomplete="off"
          />
        </div>
        <div class="leaderboard-filters">
          <div class="stats-dropdown stats-filter-group stats-filter-group-lg" id="leaderboard-metric-dropdown">
            <input type="hidden" id="leaderboard-metric" value="${DEFAULT_METRIC}" />
            <button type="button" class="stats-dropdown-trigger" id="leaderboard-metric-trigger" aria-haspopup="true" aria-expanded="false">
              <span id="leaderboard-metric-text"></span>
              <span class="stats-dropdown-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                </svg>
              </span>
            </button>
            <div class="stats-dropdown-menu hidden" id="leaderboard-metric-menu" role="menu" aria-labelledby="leaderboard-metric-trigger"></div>
          </div>
        </div>
      </div>
      <div id="leaderboard-resource-status" style="margin-top: var(--space-md);">
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">${t('leaderboard.loading')}</span>
        </div>
      </div>
      <div id="leaderboard-list" style="margin-top: var(--space-md);"></div>
    </div>
  `;

  const metricInput = container.querySelector('#leaderboard-metric');
  const metricTrigger = container.querySelector('#leaderboard-metric-trigger');
  const metricMenu = container.querySelector('#leaderboard-metric-menu');
  const metricText = container.querySelector('#leaderboard-metric-text');
  const resourceStatus = container.querySelector('#leaderboard-resource-status');
  const listEl = container.querySelector('#leaderboard-list');
  const searchInput = container.querySelector('#leaderboard-search');
  const lastSyncEl = container.querySelector('#leaderboard-last-sync');
  let latestLoadId = 0;
  let latestLeaderboardItems = [];

  const metricOptions = METRIC_KEYS.map((key) => ({
    value: key,
    label: t(`leaderboard.metrics.${key}`),
  }));

  function closeDropdowns() {
    const dropdown = container.querySelector('#leaderboard-metric-dropdown');
    if (!dropdown || !metricTrigger || !metricMenu) return;
    dropdown.classList.remove('open');
    metricMenu.classList.add('hidden');
    metricTrigger.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown(dropdownId, trigger, menu) {
    const dropdown = container.querySelector(`#${dropdownId}`);
    if (!dropdown || !trigger || !menu) return;
    const shouldOpen = menu.classList.contains('hidden');
    closeDropdowns();
    dropdown.classList.toggle('open', shouldOpen);
    menu.classList.toggle('hidden', !shouldOpen);
    trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  function renderMetricOptions() {
    const selected = metricOptions.find((option) => option.value === metricInput.value) || metricOptions[0];
    metricText.textContent = selected.label;
    metricMenu.innerHTML = metricOptions.map((option) => `
      <button
        type="button"
        class="stats-dropdown-option${option.value === metricInput.value ? ' active' : ''}"
        data-leaderboard-option="metric"
        data-value="${option.value}"
        role="menuitem"
      >
        <span class="stats-dropdown-option-label">${option.label}</span>
      </button>
    `).join('');
  }

  function renderLeaderboardRows(items) {
    if (!items.length) {
      resourceStatus.style.display = 'block';
      resourceStatus.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="trophy" style="width: 40px; height: 40px;"></i></div>
          <div class="empty-text">${searchInput.value.trim() ? t('leaderboard.noSearchResults') : t('leaderboard.emptyTitle')}</div>
          <div class="empty-hint">${searchInput.value.trim() ? t('leaderboard.noSearchResultsHint') : t('leaderboard.emptyHint')}</div>
        </div>
      `;
      listEl.innerHTML = '';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    resourceStatus.style.display = 'none';
    resourceStatus.innerHTML = '';
    listEl.innerHTML = `
      <div class="table-container leaderboard-table-container">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th class="leaderboard-heading-center">${t('leaderboard.table.rank')}</th>
              <th>${t('leaderboard.table.player')}</th>
              <th>${t('leaderboard.table.level')}</th>
              <th class="leaderboard-heading-center">${t(`leaderboard.metrics.${metricInput.value}`)}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((entry, index) => renderLeaderboardTableRow(entry, index, metricInput.value)).join('')}
          </tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll('[data-player-query]').forEach((element) => {
      element.addEventListener('click', () => {
        const query = element.dataset.playerQuery || '';
        if (!query) return;
        void setClientPreference(CLIENT_PREFERENCE_KEYS.lastPlayerQuery, query);
        window.history.pushState({}, '', '/player');
        window.dispatchEvent(new Event('popstate'));
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function renderLeaderboardFromCache() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const filtered = query
      ? latestLeaderboardItems.filter((entry) => {
          const player = entry.player || {};
          const name = String(player.name || '').toLowerCase();
          const deltaForceId = String(player.deltaForceId || '').toLowerCase();
          const id = String(player.id || '').toLowerCase();
          return name.includes(query) || deltaForceId.includes(query) || id.includes(query);
        })
      : [...latestLeaderboardItems];

    renderLeaderboardRows(filtered);
  }

  async function loadLeaderboard() {
    const loadId = ++latestLoadId;
    resourceStatus.style.display = 'block';
    resourceStatus.innerHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <span class="loading-text">${t('leaderboard.loading')}</span>
      </div>
    `;
    listEl.innerHTML = '';

    try {
      const data = await fetchTrackedLeaderboard({
        metric: metricInput.value,
        limit: LEADERBOARD_LIMIT,
      });

      if (requestId !== leaderboardViewRequestId || loadId !== latestLoadId) return;
      latestLeaderboardItems = data.items || [];
      renderLeaderboardFromCache();

      const leaderboardUpdatedAt = data.updatedAt || data.savedAt || '';
      const syncText = leaderboardUpdatedAt
        ? `${t('leaderboard.lastSync')}: ${formatDateTime(leaderboardUpdatedAt)}`
        : '';
      lastSyncEl.textContent = data.stale && syncText
        ? [syncText, t('player.cachedFallbackNotice')].join(' • ')
        : syncText;
    } catch (error) {
      if (requestId !== leaderboardViewRequestId || loadId !== latestLoadId) return;
      resourceStatus.style.display = 'block';
      resourceStatus.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="alert-triangle" style="width: 40px; height: 40px;"></i></div>
          <div class="empty-text">${t('leaderboard.loadErrorTitle')}</div>
          <div class="empty-hint">${t('leaderboard.loadErrorHint')}</div>
        </div>
      `;
      listEl.innerHTML = '';
      lastSyncEl.textContent = '';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  metricTrigger.addEventListener('click', () => toggleDropdown('leaderboard-metric-dropdown', metricTrigger, metricMenu));

  container.addEventListener('click', (event) => {
    const option = event.target.closest('[data-leaderboard-option]');
    if (!option) {
      if (!event.target.closest('.stats-dropdown')) {
        closeDropdowns();
      }
      return;
    }

    const kind = option.dataset.leaderboardOption;
    const value = option.dataset.value || '';
    if (kind === 'metric') metricInput.value = value;

    renderMetricOptions();
    closeDropdowns();
    loadLeaderboard();
  });

  searchInput.addEventListener('input', () => {
    renderLeaderboardFromCache();
  });

  renderMetricOptions();
  if (requestId !== leaderboardViewRequestId) return;
  await loadLeaderboard();
}

function renderLeaderboardTableRow(entry, index, metricKey) {
  const player = entry.player || {};
  const metricValue = formatMetricValue(metricKey, entry.metricValue);
  const playerQuery = player.deltaForceId || player.id || '';
  const rankValue = index + 1;

  return `
    <tr class="leaderboard-table-row" data-player-query="${playerQuery}">
      <td class="leaderboard-cell-rank leaderboard-cell-center">${entry.rank || rankValue}</td>
      <td>
        <div class="leaderboard-cell-player-name">${player.name || player.deltaForceId || 'Unknown'}</div>
        <div class="leaderboard-cell-player-id text-mono">${player.deltaForceId || player.id || '-'}</div>
      </td>
      <td>Lv.${player.levelOperations ?? '?'}</td>
      <td class="leaderboard-cell-metric leaderboard-cell-center text-mono">${metricValue}</td>
    </tr>
  `;
}

function formatMetricValue(metricKey, metricValue) {
  const value = Number(metricValue || 0);
  if (metricKey === 'kdRatio') return value ? value.toFixed(2) : '0.00';
  if (metricKey === 'extractionRate') return `${(value * 100).toFixed(1)}%`;
  if (metricKey === 'playTime') return formatPlayTime(value);
  if (metricKey === 'extractedAssets') return formatCompactNumber(value);
  return formatInteger(value);
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return formatInteger(number);
}

function formatInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString(getLeaderboardLocale()) : '0';
}

function formatPlayTime(seconds) {
  const totalSeconds = Math.max(0, Number(seconds || 0));
  const totalHours = Math.floor(totalSeconds / 3600);
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    return `${days}d`;
  }
  return `${totalHours}h`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(getLeaderboardLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLeaderboardLocale() {
  const language = getCurrentLanguage();
  if (language === 'id') return 'id-ID';
  if (language === 'zh') return 'zh-CN';
  return 'en-US';
}
