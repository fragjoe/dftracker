import { listSeasons } from '../api/client.js';
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
      <div class="leaderboard-header__eyebrow">${t('leaderboard.eyebrow')}</div>
      <h1 class="page-title"><i data-lucide="trophy" style="margin-right: 8px"></i>${t('leaderboard.title')}</h1>
      <p class="page-subtitle">${t('leaderboard.subtitle')}</p>
    </div>

    <div class="card leaderboard-intro-card mb-lg">
      <div class="leaderboard-intro">
        <div class="leaderboard-intro__copy">
          <div class="card-title">${t('leaderboard.indexedTitle')}</div>
          <p class="text-muted">${t('leaderboard.indexedHint')}</p>
        </div>
        <div class="leaderboard-intro__badge">
          <span class="card-badge badge-gold">${t('leaderboard.liveBadge')}</span>
        </div>
      </div>
    </div>

    <div class="card mb-lg">
      <div class="card-header" style="justify-content: space-between; gap: var(--space-md); flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i data-lucide="trophy" style="width: 18px; color: var(--accent-primary)"></i>
          <span class="card-title">${t('leaderboard.filtersTitle')}</span>
        </div>
        <span id="leaderboard-last-sync" class="stats-last-update text-muted"></span>
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

        <div class="stats-dropdown stats-filter-group stats-filter-group-sm" id="leaderboard-mode-dropdown">
          <input type="hidden" id="leaderboard-mode" value="false" />
          <button type="button" class="stats-dropdown-trigger" id="leaderboard-mode-trigger" aria-haspopup="true" aria-expanded="false">
            <span id="leaderboard-mode-text"></span>
            <span class="stats-dropdown-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
              </svg>
            </span>
          </button>
          <div class="stats-dropdown-menu hidden" id="leaderboard-mode-menu" role="menu" aria-labelledby="leaderboard-mode-trigger"></div>
        </div>

        <div class="stats-dropdown stats-filter-group stats-filter-group-lg" id="leaderboard-season-dropdown">
          <input type="hidden" id="leaderboard-season" value="" />
          <button type="button" class="stats-dropdown-trigger" id="leaderboard-season-trigger" aria-haspopup="true" aria-expanded="false">
            <span id="leaderboard-season-text"></span>
            <span class="stats-dropdown-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
              </svg>
            </span>
          </button>
          <div class="stats-dropdown-menu hidden" id="leaderboard-season-menu" role="menu" aria-labelledby="leaderboard-season-trigger"></div>
        </div>
      </div>
    </div>

    <div class="grid-3 leaderboard-summary-grid mb-lg">
      <div class="stat-card leaderboard-stat-card">
        <div>
          <div id="leaderboard-total-players" class="stat-value">0</div>
          <div class="stat-label">${t('leaderboard.summary.players')}</div>
        </div>
      </div>
      <div class="stat-card leaderboard-stat-card">
        <div>
          <div id="leaderboard-active-metric" class="stat-value">${t(`leaderboard.metrics.${DEFAULT_METRIC}`)}</div>
          <div class="stat-label">${t('leaderboard.summary.metric')}</div>
        </div>
      </div>
      <div class="stat-card leaderboard-stat-card">
        <div>
          <div id="leaderboard-active-scope" class="stat-value">${t('leaderboard.mode.all')}</div>
          <div class="stat-label">${t('leaderboard.summary.scope')}</div>
        </div>
      </div>
    </div>

    <div id="leaderboard-resource-status">
      <div class="loading-container">
        <div class="spinner"></div>
        <span class="loading-text">${t('leaderboard.loading')}</span>
      </div>
    </div>
    <div id="leaderboard-list"></div>
  `;

  const metricInput = container.querySelector('#leaderboard-metric');
  const modeInput = container.querySelector('#leaderboard-mode');
  const seasonInput = container.querySelector('#leaderboard-season');
  const metricTrigger = container.querySelector('#leaderboard-metric-trigger');
  const modeTrigger = container.querySelector('#leaderboard-mode-trigger');
  const seasonTrigger = container.querySelector('#leaderboard-season-trigger');
  const metricMenu = container.querySelector('#leaderboard-metric-menu');
  const modeMenu = container.querySelector('#leaderboard-mode-menu');
  const seasonMenu = container.querySelector('#leaderboard-season-menu');
  const metricText = container.querySelector('#leaderboard-metric-text');
  const modeText = container.querySelector('#leaderboard-mode-text');
  const seasonText = container.querySelector('#leaderboard-season-text');
  const resourceStatus = container.querySelector('#leaderboard-resource-status');
  const listEl = container.querySelector('#leaderboard-list');
  const lastSyncEl = container.querySelector('#leaderboard-last-sync');
  const totalPlayersEl = container.querySelector('#leaderboard-total-players');
  const activeMetricEl = container.querySelector('#leaderboard-active-metric');
  const activeScopeEl = container.querySelector('#leaderboard-active-scope');
  let seasons = [];
  let latestLoadId = 0;

  const modeOptions = [
    { value: 'false', label: t('leaderboard.mode.all') },
    { value: 'true', label: t('leaderboard.mode.ranked') },
  ];

  const metricOptions = METRIC_KEYS.map((key) => ({
    value: key,
    label: t(`leaderboard.metrics.${key}`),
  }));

  function closeDropdowns() {
    [
      ['leaderboard-metric-dropdown', metricTrigger, metricMenu],
      ['leaderboard-mode-dropdown', modeTrigger, modeMenu],
      ['leaderboard-season-dropdown', seasonTrigger, seasonMenu],
    ].forEach(([id, trigger, menu]) => {
      const dropdown = container.querySelector(`#${id}`);
      if (!dropdown || !trigger || !menu) return;
      dropdown.classList.remove('open');
      menu.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    });
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

  function renderModeOptions() {
    const selected = modeOptions.find((option) => option.value === modeInput.value) || modeOptions[0];
    modeText.textContent = selected.label;
    modeMenu.innerHTML = modeOptions.map((option) => `
      <button
        type="button"
        class="stats-dropdown-option${option.value === modeInput.value ? ' active' : ''}"
        data-leaderboard-option="mode"
        data-value="${option.value}"
        role="menuitem"
      >
        <span class="stats-dropdown-option-label">${option.label}</span>
      </button>
    `).join('');
  }

  function renderSeasonOptions() {
    const options = [{ value: '', label: t('leaderboard.seasonAll') }, ...seasons.map((season) => ({
      value: season.id,
      label: `S${season.number}: ${season.name}`,
    }))];
    const selected = options.find((option) => option.value === seasonInput.value) || options[0];
    seasonText.textContent = selected.label;
    seasonMenu.innerHTML = options.map((option) => `
      <button
        type="button"
        class="stats-dropdown-option${option.value === seasonInput.value ? ' active' : ''}"
        data-leaderboard-option="season"
        data-value="${option.value}"
        role="menuitem"
      >
        <span class="stats-dropdown-option-label">${option.label}</span>
      </button>
    `).join('');
  }

  function updateSummary(data) {
    const metricLabel = t(`leaderboard.metrics.${metricInput.value}`);
    const scopeLabel = modeInput.value === 'true'
      ? t('leaderboard.mode.ranked')
      : t('leaderboard.mode.all');
    totalPlayersEl.textContent = formatInteger(data.totalSize || 0);
    activeMetricEl.textContent = metricLabel;
    activeScopeEl.textContent = scopeLabel;
  }

  function renderLeaderboardRows(items) {
    if (!items.length) {
      resourceStatus.style.display = 'block';
      resourceStatus.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="trophy" style="width: 40px; height: 40px;"></i></div>
          <div class="empty-text">${t('leaderboard.emptyTitle')}</div>
          <div class="empty-hint">${t('leaderboard.emptyHint')}</div>
        </div>
      `;
      listEl.innerHTML = '';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    resourceStatus.style.display = 'none';
    resourceStatus.innerHTML = '';
    listEl.innerHTML = `
      <div class="leaderboard-list">
        ${items.map((entry, index) => renderLeaderboardRow(entry, index, metricInput.value)).join('')}
      </div>
    `;

    listEl.querySelectorAll('[data-player-query]').forEach((element) => {
      element.addEventListener('click', () => {
        const query = element.dataset.playerQuery || '';
        if (!query) return;
        localStorage.setItem('lastPlayerQuery', query);
        window.history.pushState({}, '', '/player');
        window.dispatchEvent(new Event('popstate'));
      });
    });

    if (window.lucide) window.lucide.createIcons();
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
        seasonId: seasonInput.value,
        ranked: modeInput.value === 'true',
        limit: LEADERBOARD_LIMIT,
      });

      if (requestId !== leaderboardViewRequestId || loadId !== latestLoadId) return;
      updateSummary(data);
      renderLeaderboardRows(data.items || []);

      const freshEntry = (data.items || []).find((item) => item.fetchedAt || item.statsUpdatedAt);
      lastSyncEl.textContent = freshEntry
        ? `${t('leaderboard.lastSync')}: ${formatDateTime(freshEntry.statsUpdatedAt || freshEntry.fetchedAt)}`
        : '';
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
  modeTrigger.addEventListener('click', () => toggleDropdown('leaderboard-mode-dropdown', modeTrigger, modeMenu));
  seasonTrigger.addEventListener('click', () => toggleDropdown('leaderboard-season-dropdown', seasonTrigger, seasonMenu));

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
    if (kind === 'mode') modeInput.value = value;
    if (kind === 'season') seasonInput.value = value;

    renderMetricOptions();
    renderModeOptions();
    renderSeasonOptions();
    closeDropdowns();
    loadLeaderboard();
  });

  renderMetricOptions();
  renderModeOptions();

  try {
    const seasonData = await listSeasons({ pageSize: 50 });
    seasons = (seasonData?.seasons || []).sort((left, right) => Number(right.number || 0) - Number(left.number || 0));
  } catch (error) {
    seasons = [];
  }

  if (requestId !== leaderboardViewRequestId) return;
  renderSeasonOptions();
  await loadLeaderboard();
}

function renderLeaderboardRow(entry, index, metricKey) {
  const player = entry.player || {};
  const rankClass = index < 3 ? ` leaderboard-rank--top-${index + 1}` : '';
  const metricValue = formatMetricValue(metricKey, entry.metricValue, entry.stats || {});
  const playerQuery = player.deltaForceId || player.id || '';

  return `
    <button type="button" class="leaderboard-row" data-player-query="${playerQuery}">
      <div class="leaderboard-rank${rankClass}">#${index + 1}</div>
      <div class="leaderboard-row__main">
        <div class="leaderboard-row__identity">
          <div class="leaderboard-row__name">${player.name || player.deltaForceId || 'Unknown'}</div>
          <div class="leaderboard-row__meta">
            <span>${player.deltaForceId || player.id || '-'}</span>
            <span>•</span>
            <span>Lv.${player.levelOperations ?? '?'}</span>
          </div>
        </div>
        <div class="leaderboard-row__metric">
          <div class="leaderboard-row__metric-value">${metricValue}</div>
          <div class="leaderboard-row__metric-label">${t(`leaderboard.metrics.${metricKey}`)}</div>
        </div>
      </div>
      <div class="leaderboard-row__cta">
        <i data-lucide="arrow-left-right" style="width: 16px; height: 16px;"></i>
      </div>
    </button>
  `;
}

function formatMetricValue(metricKey, metricValue, stats) {
  const value = Number(metricValue || 0);
  if (metricKey === 'kdRatio') return value ? value.toFixed(2) : '0.00';
  if (metricKey === 'extractionRate') return `${(value * 100).toFixed(1)}%`;
  if (metricKey === 'playTime') return formatPlayTime(Number(stats?.playTime || value));
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
