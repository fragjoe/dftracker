import { getPlayer, getPlayerOperationStats, getPlayerOperationStashValue, getPlayerOperationHistoricalStashValue, listSeasons } from '../api/client.js';
import { Chart, registerables } from 'chart.js';
import { escapeHTML } from '../utils/security.js';

Chart.register(...registerables);

let stashChart = null;
let currentPlayerData = null;
let allSeasons = [];

const RECENT_SEARCHES_KEY = 'recent_searches_list';

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function addRecentSearch(player) {
  const recent = getRecentSearches();
  const index = recent.findIndex(r => r.id === player.id || r.deltaForceId === player.deltaForceId);

  if (index !== -1) {
    recent.splice(index, 1);
  }

  recent.unshift({
    id: player.id,
    deltaForceId: player.deltaForceId,
    name: player.name || player.deltaForceId
  });

  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 5)));
}

function renderEmptyState() {
  const recent = getRecentSearches();

  if (recent.length > 0) {
    return `
      <div class="recent-searches" style="margin: var(--space-xl) auto 0;">
        <div class="recent-title" style="text-align: center;">Pencarian Terakhir</div>
        <div class="recent-list">
          ${recent.map(r => `
            <div class="recent-item" data-id="${escapeHTML(r.deltaForceId)}">
              <div class="recent-item-icon"><i data-lucide="history" style="width: 16px; height: 16px;"></i></div>
              <div class="recent-item-info">
                <div class="recent-item-name">${escapeHTML(r.name)}</div>
                <div class="recent-item-id">${escapeHTML(r.deltaForceId)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="empty-state" style="padding: var(--space-2xl) 0">
      <div class="empty-text" style="color: var(--text-muted); font-size: 0.95rem;">Belum ada riwayat pencarian</div>
    </div>
  `;
}

export async function renderPlayerPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><i data-lucide="chart-no-axes-combined" style="margin-right: 8px"></i>Player Stats</h1>
      <p class="page-subtitle">Analisis performa dan riwayat kekayaan pemain secara detail</p>
    </div>

    <div class="search-bar">
      <span class="search-icon"><i data-lucide="search"></i></span>
      <input type="text" class="search-input" id="player-search"
        placeholder="Masukkan Delta Force ID..." />
      <button class="search-clear hidden" id="search-clear"><i data-lucide="x"></i></button>
    </div>

    <div id="player-content">
      ${renderEmptyState()}
    </div>
  `;

  // Fetch seasons in background
  try {
    const s = await listSeasons();
    if (s && s.seasons) {
      allSeasons = s.seasons;
    }
  } catch (e) {
    console.error('Failed to load seasons:', e);
  }

  const searchInput = container.querySelector('#player-search');
  const clearBtn = container.querySelector('#search-clear');

  // Load persistence
  const lastQuery = localStorage.getItem('lastPlayerQuery');
  if (lastQuery) {
    searchInput.value = lastQuery;
    clearBtn.classList.remove('hidden');
    setTimeout(() => loadPlayerData(container, lastQuery), 10);
  }

  searchInput.addEventListener('input', (e) => {
    if (e.target.value) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) loadPlayerData(container, query);
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    searchInput.focus();
    container.querySelector('#player-content').innerHTML = renderEmptyState();
    localStorage.removeItem('lastPlayerQuery');
    if (window.lucide) window.lucide.createIcons();
  });

  document.getElementById('page-container').addEventListener('click', (e) => {
    const item = e.target.closest('.recent-item');
    if (item) {
      const id = item.dataset.id;
      searchInput.value = id;
      clearBtn.classList.remove('hidden');
      loadPlayerData(container, id);
    }
  });

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 10);
  }
}

async function loadPlayerData(container, query) {
  const contentEl = container.querySelector('#player-content');
  contentEl.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Mencari pemain...</span>
    </div>
  `;

  if (allSeasons.length === 0) {
    try {
      const s = await listSeasons();
      if (s && s.seasons) {
        allSeasons = s.seasons.sort((a, b) => b.number - a.number);
      }
    } catch (e) {
      console.error('Failed to load seasons:', e);
    }
  }

  try {
    const playerData = await getPlayer({ deltaForceId: query });
    const player = playerData.player || playerData;

    if (!player || (!player.id && !player.deltaForceId)) {
      contentEl.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl) 0">
          <div class="empty-icon" style="color: var(--accent-red); margin-bottom: var(--space-md);"><i data-lucide="user-search" style="width: 48px; height: 48px;"></i></div>
          <div class="empty-text" style="color: var(--accent-red)">Pemain Tidak Ditemukan</div>
          <div class="empty-hint">Delta Force ID tersebut tidak terdaftar atau belum pernah terekam di database sistem.</div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const playerId = player.id;
    currentPlayerData = player;

    const activeSeason = allSeasons.find(s => s.active) || allSeasons[0];
    const initialSeasonId = activeSeason ? activeSeason.id : '';

    const [statsResult, stashResult] = await Promise.allSettled([
      getPlayerOperationStats(playerId, { seasonId: initialSeasonId }),
      getPlayerOperationStashValue(playerId),
    ]);

    const stats = statsResult.status === 'fulfilled' ? (statsResult.value.stats || null) : null;
    const stash = stashResult.status === 'fulfilled' ? (stashResult.value.stash || null) : null;

    // Save persistence on success
    localStorage.setItem('lastPlayerQuery', query);
    addRecentSearch(player);

    const playerName = player.name || player.deltaForceId || 'Unknown';
    window.updateMetadata({
      title: `${playerName} — Statistik Pemain`,
      description: `Analisis performa pertempuran, K/D ratio, dan histori kekayaan untuk pemain Delta Force ${playerName}.`
    });

    renderPlayerProfile(contentEl, player, stats, stash);
    loadStashChart(playerId);
  } catch (err) {
    console.error('Player search error:', err);
    const errMsg = err.message || '';
    let errorTitle = 'Gagal memuat data pemain';
    let errorHint = 'Terjadi kesalahan sistem saat mengambil data dari API.';
    let errorIcon = 'alert-triangle';

    if (errMsg.includes('404') || errMsg.includes('not found')) {
      errorTitle = 'Pemain Tidak Ditemukan';
      errorHint = 'Delta Force ID tersebut tidak terdaftar atau belum pernah terekam di database sistem.';
      errorIcon = 'user-search';
    }

    contentEl.innerHTML = `
      <div class="empty-state" style="padding: var(--space-xl) 0">
        <div class="empty-icon" style="color: var(--accent-red); margin-bottom: var(--space-md);"><i data-lucide="${errorIcon}" style="width: 48px; height: 48px;"></i></div>
        <div class="empty-text" style="color: var(--accent-red)">${errorTitle}</div>
        <div class="empty-hint">${errorHint}</div>
      </div>
    `;
    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }
  }
}

function renderPlayerProfile(container, player, stats, stash) {
  const name = player.name || player.deltaForceId || 'Unknown';
  const regDate = player.registeredAt || '';

  let seasonOptions = '<option value="">Seluruh Waktu</option>';

  const activeSeason = allSeasons.find(s => s.active) || allSeasons[0];
  const activeSeasonId = activeSeason ? activeSeason.id : null;

  allSeasons.forEach(s => {
    const isActive = s.id === activeSeasonId;
    const selected = isActive ? 'selected' : '';
    const isDisabled = s.number <= 7;
    const symbol = isDisabled ? '🔒 ' : '📅 ';
    const disabledAttr = isDisabled ? 'disabled' : '';

    seasonOptions += `<option value="${s.id}" ${selected} ${disabledAttr}>S${s.number}: ${s.name}</option>`;
  });

  container.innerHTML = `
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
            <span id="stats-last-update" class="text-muted" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px"></span>
            ${regDate ? `<span class="text-muted" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px;"><span style="color: rgba(255,255,255,0.1)">|</span> <i data-lucide="calendar" style="width: 14px; height: 14px;"></i> Akun dibuat: ${formatDate(regDate)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="season-selector flex-between" style="gap: var(--space-md); flex-wrap: wrap">
        <div style="min-width: 150px">
          <select id="mode-filter" class="form-control">
            <option value="false" selected>Semua Mode</option>
            <option value="true">Ranked Only</option>
          </select>
        </div>

        <div style="min-width: 200px">
          <select id="season-filter" class="form-control">
            ${seasonOptions}
          </select>
        </div>
      </div>
    </div>

    <div id="stats-wrapper">
      <div class="card mb-lg"><div class="empty-state" style="padding: var(--space-lg)"><div class="empty-hint">⚠️ Memuat Statistik...</div></div></div>
    </div>

    ${stash ? renderStashValue(stash) : ''}
    <div id="stash-icons-trigger"></div>

    <div class="card mt-lg">
      <div class="card-header" style="justify-content: space-between; flex-wrap: wrap; gap: var(--space-sm)">
        <div style="display: flex; align-items: center;">
          <i data-lucide="line-chart" style="margin-right: 8px; width: 18px; color: var(--accent-primary)"></i>
          <span class="card-title">Riwayat Kekayaan</span>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap">
          <span id="stash-last-update" class="text-muted" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px"></span>
          <span class="text-muted" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
            <i data-lucide="info" style="width: 14px; height: 14px;"></i>Data terekam sejak UUID ini pertama kali dicari
          </span>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="stash-chart"></canvas>
      </div>
      <div id="stash-chart-loading" class="loading-container" style="padding: var(--space-md)">
        <div class="spinner"></div>
        <span class="loading-text">Memuat grafik kekayaan...</span>
      </div>
    </div>
  `;

  const seasonFilter = container.querySelector('#season-filter');
  const modeFilter = container.querySelector('#mode-filter');

  const fetchUpdatedStats = async () => {
    const seasonId = seasonFilter.value;
    const ranked = modeFilter.value === 'true';

    const statsWrapper = container.querySelector('#stats-wrapper');
    statsWrapper.innerHTML = `
      <div class="loading-container card mb-lg" style="padding: var(--space-xl)">
        <div class="spinner"></div>
        <span class="loading-text">Memuat statistik...</span>
      </div>
    `;

    try {
      const res = await getPlayerOperationStats(player.id, { seasonId, ranked });
      if (res.stats) {
        statsWrapper.innerHTML = renderStats(res.stats);

        // Update Stats Last Update info
        const statsUpdateEl = container.querySelector('#stats-last-update');
        if (statsUpdateEl && res.stats.updatedAt) {
          statsUpdateEl.innerHTML = `<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Stats diperbarui: ${formatDateTime(res.stats.updatedAt)}`;
        } else if (statsUpdateEl) {
          statsUpdateEl.innerHTML = '';
        }

        if (window.lucide) {
          setTimeout(() => window.lucide.createIcons(), 10);
        }
      } else {
        throw new Error("NOT_FOUND: Data stat kosong untuk filter ini");
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
      const errMsg = err.message || '';

      if (errMsg.includes('404') || errMsg.includes('not_found') || errMsg.includes('Data stat kosong')) {
        statsWrapper.innerHTML = `
          <div class="card mb-lg">
            <div class="empty-state" style="padding: var(--space-xl)">
              <div class="empty-icon text-muted"><i data-lucide="parachute"></i></div>
              <div class="empty-text">Tidak Ada Data</div>
              <div class="empty-hint">
                Pemain ini tidak memiliki rekam jejak untuk mode / season yang dipilih.<br>
                <span style="color: var(--accent-primary); cursor: pointer; text-decoration: underline" onclick="document.getElementById('season-filter').value=''; document.getElementById('season-filter').dispatchEvent(new Event('change'))">
                  Coba lihat statistik "Seluruh Waktu" (All Time)
                </span>
              </div>
            </div>
          </div>
        `;
        if (window.lucide) {
          setTimeout(() => window.lucide.createIcons(), 10);
        }
      } else {
        statsWrapper.innerHTML = `
          <div class="card mb-lg">
            <div class="empty-state" style="padding: var(--space-lg)">
              <div class="empty-hint text-red">⚠️ Gagal memuat statistik. Hubungi admin API atau coba UUID lain.</div>
              <div class="text-muted" style="font-size: 0.75rem; margin-top: 8px">${errMsg}</div>
            </div>
          </div>
        `;
      }
    }
  };

  seasonFilter.addEventListener('change', fetchUpdatedStats);
  modeFilter.addEventListener('change', fetchUpdatedStats);

  fetchUpdatedStats();

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 50);
  }
}

function renderStats(stats) {
  const statItems = [
    { label: 'K/D Ratio', value: stats.kdRatio?.toFixed(2) || '0', icon: 'swords', color: 'var(--accent-primary)' },
    { label: 'Extraction', value: `${((stats.extractionRate || 0) * 100).toFixed(1)}%`, icon: 'person-standing', color: 'var(--accent-green)' },
    { label: 'Total Kills', value: formatNumber(stats.totalKills || 0), icon: 'skull', color: 'var(--accent-red)' },
    { label: 'Total Deaths', value: formatNumber(stats.totalDeaths || 0), icon: 'ghost', color: 'var(--accent-orange)' },
    { label: 'Matches Played', value: formatNumber(stats.matchesPlayed || 0), icon: 'gamepad-2', color: 'var(--accent-blue)' },
    { label: 'Accuracy', value: `${((stats.bulletDischargedHitRatio || 0) * 100).toFixed(1)}%`, icon: 'crosshair', color: 'var(--accent-purple)' },
    { label: 'Headshot Rate', value: `${((stats.knockedHeadshotRatio || 0) * 100).toFixed(1)}%`, icon: 'target', color: 'var(--accent-primary)' },
    { label: 'Revives', value: formatNumber(stats.revives || 0), icon: 'heart-pulse', color: 'var(--accent-green)' },
  ];

  const matchInfo = [
    { label: 'Matches Extracted', value: formatNumber(stats.matchesExtracted || 0) },
    { label: 'Matches Lost', value: formatNumber(stats.matchesLost || 0) },
    { label: 'Matches Quit', value: formatNumber(stats.matchesQuit || 0) },
    { label: 'Play Time', value: formatPlayTime(stats.playTime || 0) },
    { label: 'Ranked Points', value: formatNumber(stats.rankedPoints || 0) },
    { label: 'Pickups', value: formatNumber(stats.pickups || 0) },
  ];

  const gunplayInfo = [
    { label: 'Total Fired', value: formatNumber(stats.bulletsDischarged || 0) },
    { label: 'Bullets Hit', value: formatNumber(stats.bulletsDischargedHit || 0) },
    { label: 'Bullets Missed', value: formatNumber(stats.bulletsDischargedMissed || 0) },
    { label: 'Knocked Count', value: formatNumber(stats.knockedCount || 0) },
    { label: 'Headshot Count', value: formatNumber(stats.knockedHeadshotCount || 0) },
    { label: 'Bullets per Knock', value: stats.bulletsDischargedPerKnock?.toFixed(2) || '0' },
    { label: 'Hits per Knock', value: stats.bulletsDischargedHitPerKnock?.toFixed(2) || '0' },
  ];

  const extractionInfo = [
    { label: 'Extracted Assets', value: formatPriceShort(stats.extractedAssets || 0) },
    { label: 'Teammate Assets Saved', value: formatPriceShort(stats.extractedTeammateAssets || 0) },
    { label: 'Mandlebricks Extracted', value: formatNumber(stats.extractedMandlebricks || 0) },
  ];

  const diffData = {
    easy: [
      { label: 'K/D Ratio', value: stats.kdRatioEasy?.toFixed(2) || '-' },
      { label: 'Total Kills', value: formatNumber(stats.totalKillsEasy || 0) },
      { label: 'Total Deaths', value: formatNumber(stats.totalDeathsEasy || 0) },
    ],
    normal: [
      { label: 'K/D Ratio', value: stats.kdRatioMedium?.toFixed(2) || '-' },
      { label: 'Total Kills', value: formatNumber(stats.totalKillsMedium || 0) },
      { label: 'Total Deaths', value: formatNumber(stats.totalDeathsMedium || 0) },
    ],
    hard: [
      { label: 'K/D Ratio', value: stats.kdRatioHard?.toFixed(2) || '-' },
      { label: 'Total Kills', value: formatNumber(stats.totalKillsHard || 0) },
      { label: 'Total Deaths', value: formatNumber(stats.totalDeathsHard || 0) },
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
          <i data-lucide="gamepad-2" style="width: 18px"></i><span class="card-title">Info Pertandingan</span>
        </div>
        <div class="grid-3" style="padding: var(--space-sm)">
          ${renderGrid([...matchInfo, ...extractionInfo])}
        </div>
      </div>

      <div class="card" style="height: 100%">
        <div class="card-header" style="display: flex; align-items: center; gap: 8px;">
          <i data-lucide="crosshair" style="width: 18px"></i><span class="card-title">Detail Gunplay</span>
        </div>
        <div class="grid-3" style="padding: var(--space-sm)">${renderGrid(gunplayInfo)}</div>
      </div>
    </div>

    <div class="card mb-lg">
      <div class="card-header" style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i data-lucide="flame" style="width: 18px; color: var(--accent-orange)"></i>
          <span class="card-title">Pertempuran per Tingkat Kesulitan</span>
        </div>
        <div class="diff-tabs" style="display: flex; gap: 4px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: var(--radius-md);">
          <button id="tab-easy" class="diff-tab active" onclick="switchDiffTab('easy')">Easy</button>
          <button id="tab-normal" class="diff-tab" onclick="switchDiffTab('normal')">Normal</button>
          <button id="tab-hard" class="diff-tab" onclick="switchDiffTab('hard')">Hard</button>
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

    <div class="card mb-lg">
      <div class="card-header" style="display: flex; align-items: center; gap: 8px;">
        <i data-lucide="trophy" style="width: 18px; color: var(--accent-gold)"></i><span class="card-title">Score Breakdown</span>
      </div>
      <div class="grid-4" style="margin-top: var(--space-md); gap: var(--space-sm)">
        ${renderScoreBar('Combat', stats.scoreCombat || 0)}
        ${renderScoreBar('Survival', stats.scoreSurvival || 0)}
        ${renderScoreBar('Co-op', stats.scoreCoop || 0)}
        ${renderScoreBar('Search', stats.scoreSearch || 0)}
        ${renderScoreBar('Wealth', stats.scoreWealth || 0)}
      </div>
    </div>
  `;
}

function renderScoreBar(label, value) {
  const pct = Math.min(value, 100);
  return `
    <div style="padding: var(--space-sm)">
      <div class="flex-between" style="margin-bottom: 4px">
        <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px">${label}</span>
        <span class="text-mono text-gold" style="font-size: 0.85rem; font-weight: 600">${value}</span>
      </div>
      <div style="background: var(--bg-input); border-radius: var(--radius-full); height: 6px; overflow: hidden">
        <div style="background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); height: 100%; width: ${pct}%; border-radius: var(--radius-full); transition: width 0.6s ease"></div>
      </div>
    </div>
  `;
}

function renderStashValue(stash) {
  const liquid = Number(stash.assetsLiquid || 0);
  const fixed = Number(stash.assetsFixed || 0);
  const collection = Number(stash.assetsCollection || 0);
  const net = Number(stash.assetsNet || 0);
  const total = liquid + fixed + collection;

  return `
    <div class="card mb-lg">
      <div class="card-header" style="display: flex; align-items: center; gap: 8px; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i data-lucide="coins" style="width: 18px; color: var(--accent-gold)"></i><span class="card-title">Kekayaan (Stash Value)</span>
        </div>
        <span class="card-badge badge-gold">${formatPriceShort(total)} Total</span>
      </div>
      <div class="grid-4" style="margin-top: var(--space-md)">
        <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
          <div style="font-size: 1.5rem; color: var(--accent-green); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(74, 222, 128, 0.1);"><i data-lucide="banknote"></i></div>
          <div style="flex: 1;">
            <div class="stat-value" style="font-size: 1.4rem; color: var(--accent-green); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(liquid)}</div>
            <div class="stat-label" style="margin-top: 0;">Liquid Assets</div>
          </div>
        </div>
        <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
          <div style="font-size: 1.5rem; color: var(--accent-blue); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(96, 165, 250, 0.1);"><i data-lucide="home"></i></div>
          <div style="flex: 1;">
            <div class="stat-value" style="font-size: 1.4rem; color: var(--accent-blue); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(fixed)}</div>
            <div class="stat-label" style="margin-top: 0;">Fixed Assets</div>
          </div>
        </div>
        <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
          <div style="font-size: 1.5rem; color: var(--accent-purple); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(192, 132, 252, 0.1);"><i data-lucide="archive"></i></div>
          <div style="flex: 1;">
            <div class="stat-value" style="font-size: 1.4rem; color: var(--accent-purple); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(collection)}</div>
            <div class="stat-label" style="margin-top: 0;">Collection</div>
          </div>
        </div>
        <div class="stat-card" style="display: flex; align-items: center; gap: var(--space-md); text-align: left; padding: var(--space-md);">
          <div style="font-size: 1.5rem; color: var(--text-primary); display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.05);"><i data-lucide="bar-chart-3"></i></div>
          <div style="flex: 1;">
            <div class="stat-value" style="font-size: 1.4rem; color: var(--text-primary); -webkit-text-fill-color: initial; background: none;">${formatPriceShort(net)}</div>
            <div class="stat-label" style="margin-top: 0;">Net Worth</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadStashChart(playerId) {
  const chartLoading = document.getElementById('stash-chart-loading');
  const canvas = document.getElementById('stash-chart');
  if (!chartLoading || !canvas) return;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const data = await getPlayerOperationHistoricalStashValue(playerId, {
      pageSize: 50,
      startTime: thirtyDaysAgo.toISOString(),
      endTime: now.toISOString()
    });
    // Handle multiple possible response structures
    const allSeries = data.historicalStashValues || data.stashes || data.historicalStashValue || data.series || [];

    chartLoading.style.display = 'none';
    if (allSeries.length === 0) {
      chartLoading.style.display = 'flex';
      chartLoading.innerHTML = '<span class="text-muted">Riwayat belum tersedia</span>';
      return;
    }

    // Sort by time, handle multiple possible time field names
    allSeries.sort((a, b) => {
      const timeA = new Date(a.time || a.createdAt || a.timestamp || 0);
      const timeB = new Date(b.time || b.createdAt || b.timestamp || 0);
      return timeA - timeB;
    });

    // Update Last Update info
    const latestEntry = allSeries[allSeries.length - 1];
    const latestTime = latestEntry.time || latestEntry.createdAt || latestEntry.timestamp;
    const lastUpdateEl = document.getElementById('stash-last-update');
    if (lastUpdateEl && latestTime) {
      lastUpdateEl.innerHTML = `<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Stash diperbarui: ${formatDateTime(latestTime)}`;
      if (window.lucide) window.lucide.createIcons();
    }

    const labels = allSeries.map(s => {
      const d = new Date(s.time || s.createdAt || s.timestamp || 0);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    });

    const netValues = allSeries.map(s => Number(s.assetsNet || s.netWorth || s.value || 0));

    if (stashChart) stashChart.destroy();

    // Create gradient using the market.js pattern
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(15, 247, 150, 0.3)');
    gradient.addColorStop(1, 'rgba(15, 247, 150, 0)');

    stashChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Net Worth',
          data: netValues,
          borderColor: '#0ff796',
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 2
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
              label: (ctx) => `Net Worth: ${formatPriceShort(ctx.raw)}`
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
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          x: {
            ticks: {
              color: '#5c6860',
              font: { size: 10 }
            },
            grid: { display: false }
          }
        }
      }
    });
  } catch (err) {
    console.error('Stash chart error:', err);
    chartLoading.style.display = 'flex';
    chartLoading.innerHTML = `<span class="text-muted" style="font-size: 0.75rem;">⚠️ Gagal memuat grafik: ${err.message || 'Error Unknown'}</span>`;
  }
}

function createGradient(canvas, color1, color2) {
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function formatNumber(val) {
  const num = Number(val);
  if (isNaN(num)) return '0';
  return num.toLocaleString('id-ID');
}

function formatPriceShort(value) {
  const num = Number(value);
  if (isNaN(num)) return '0';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString('id-ID');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).replace('.', ':');
}

function formatPlayTime(seconds) {
  const num = Number(seconds);
  if (isNaN(num) || num === 0) return '-';
  const hours = Math.floor(num / 3600);
  const mins = Math.floor((num % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins} m`;
  return `${mins} m`;
}
