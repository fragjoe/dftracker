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
const LEADERBOARD_RANK_SNAPSHOT_KEY = 'dftracker_leaderboard_rank_snapshot_v1';

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
  const searchInput = container.querySelector('#leaderboard-search');
  const lastSyncEl = container.querySelector('#leaderboard-last-sync');
  let seasons = [];
  let latestLoadId = 0;
  let latestLeaderboardItems = [];

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
              <th>${t('leaderboard.table.rank')}</th>
              <th>${t('leaderboard.table.player')}</th>
              <th>${t('leaderboard.table.level')}</th>
              <th>${t(`leaderboard.metrics.${metricInput.value}`)}</th>
              <th>${t('leaderboard.table.change')}</th>
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
        localStorage.setItem('lastPlayerQuery', query);
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
        seasonId: seasonInput.value,
        ranked: modeInput.value === 'true',
        limit: LEADERBOARD_LIMIT,
      });

      if (requestId !== leaderboardViewRequestId || loadId !== latestLoadId) return;
      latestLeaderboardItems = annotateRankChanges({
        items: data.items || [],
        filterKey: getRankSnapshotFilterKey({
          metric: metricInput.value,
          seasonId: seasonInput.value,
          ranked: modeInput.value === 'true',
        }),
      });
      renderLeaderboardFromCache();

      const freshEntry = (data.items || []).find((item) => item.fetchedAt || item.statsUpdatedAt);
      const syncText = freshEntry
        ? `${t('leaderboard.lastSync')}: ${formatDateTime(freshEntry.statsUpdatedAt || freshEntry.fetchedAt)}`
        : '';
      lastSyncEl.textContent = syncText;
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

  searchInput.addEventListener('input', () => {
    renderLeaderboardFromCache();
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
  if (!seasonInput.value) {
    const activeSeason = seasons.find((season) => season.active) || seasons[0];
    seasonInput.value = activeSeason?.id || '';
  }
  renderSeasonOptions();
  await loadLeaderboard();
}

function renderLeaderboardTableRow(entry, index, metricKey) {
  const player = entry.player || {};
  const metricValue = formatMetricValue(metricKey, entry.metricValue, entry.stats || {});
  const playerQuery = player.deltaForceId || player.id || '';
  const rankChangeBadge = renderRankChangeBadge(entry.rankChange);
  const rankValue = index + 1;

  return `
    <tr class="leaderboard-table-row" data-player-query="${playerQuery}">
      <td class="leaderboard-cell-rank">${rankValue}</td>
      <td>
        <div class="leaderboard-cell-player-name">${player.name || player.deltaForceId || 'Unknown'}</div>
        <div class="leaderboard-cell-player-id text-mono">${player.deltaForceId || player.id || '-'}</div>
      </td>
      <td>Lv.${player.levelOperations ?? '?'}</td>
      <td class="text-mono">${metricValue}</td>
      <td>${rankChangeBadge}</td>
    </tr>
  `;
}

function renderRankChangeBadge(rankChange = {}) {
  if (rankChange.state === 'up') {
    return `
      <span class="leaderboard-delta leaderboard-delta--up">
        <i data-lucide="trending-up" style="width: 12px; height: 12px;"></i>${t('leaderboard.rank.up', { value: rankChange.delta })}
      </span>
    `;
  }

  if (rankChange.state === 'down') {
    return `
      <span class="leaderboard-delta leaderboard-delta--down">
        <i data-lucide="trending-down" style="width: 12px; height: 12px;"></i>${t('leaderboard.rank.down', { value: rankChange.delta })}
      </span>
    `;
  }

  if (rankChange.state === 'new') {
    return `
      <span class="leaderboard-delta leaderboard-delta--new">
        <i data-lucide="flame" style="width: 12px; height: 12px;"></i>${t('leaderboard.rank.new')}
      </span>
    `;
  }

  return `
    <span
      class="leaderboard-delta leaderboard-delta--same"
      title="${t('leaderboard.rank.sameTitle')}"
      aria-label="${t('leaderboard.rank.sameTitle')}"
    >
      <i data-lucide="minus" style="width: 12px; height: 12px;"></i>-
    </span>
  `;
}

function annotateRankChanges({ items, filterKey }) {
  const snapshots = readRankSnapshots();
  const now = new Date();
  const currentWeekKey = getIsoWeekKey(now);
  const previousWeekKey = getIsoWeekKey(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const filterSnapshot = snapshots[filterKey] || {};
  const weeklySnapshots = (filterSnapshot && typeof filterSnapshot.weeks === 'object' && filterSnapshot.weeks)
    ? filterSnapshot.weeks
    : {};
  const previousSnapshot = weeklySnapshots[previousWeekKey]?.ranks || null;
  const currentSnapshot = {};

  const annotated = items.map((entry, index) => {
    const rank = index + 1;
    const playerId = entry?.player?.id || '';
    currentSnapshot[playerId] = rank;

    const previousRank = previousSnapshot ? Number(previousSnapshot[playerId] || 0) : 0;
    let rankChange = { state: 'same', delta: 0 };
    if (!previousSnapshot) {
      rankChange = { state: 'same', delta: 0 };
    } else if (!previousRank) {
      rankChange = { state: 'new', delta: 0 };
    } else if (previousRank > rank) {
      rankChange = { state: 'up', delta: previousRank - rank };
    } else if (previousRank < rank) {
      rankChange = { state: 'down', delta: rank - previousRank };
    }

    return {
      ...entry,
      rank,
      rankChange,
    };
  });

  weeklySnapshots[currentWeekKey] = {
    savedAt: now.toISOString(),
    ranks: currentSnapshot,
  };
  snapshots[filterKey] = {
    weeks: pruneWeeklySnapshots(weeklySnapshots),
  };
  writeRankSnapshots(snapshots);
  return annotated;
}

function getRankSnapshotFilterKey({ metric, seasonId, ranked }) {
  return `${metric}:${seasonId || 'all'}:${ranked ? 'ranked' : 'all'}`;
}

function readRankSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(LEADERBOARD_RANK_SNAPSHOT_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function writeRankSnapshots(snapshots) {
  try {
    localStorage.setItem(LEADERBOARD_RANK_SNAPSHOT_KEY, JSON.stringify(snapshots));
  } catch (error) {
    // Ignore write failure and keep leaderboard functional.
  }
}

function pruneWeeklySnapshots(weeks) {
  const sortedKeys = Object.keys(weeks).sort();
  const keepKeys = sortedKeys.slice(-8);
  const pruned = {};
  keepKeys.forEach((key) => {
    pruned[key] = weeks[key];
  });
  return pruned;
}

function getIsoWeekKey(date) {
  const utcDate = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const weekday = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - weekday + 3);

  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);

  const weekNumber = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
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
