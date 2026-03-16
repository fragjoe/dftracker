/**
 * Market Tracker Page
 * Search, browse, and analyze Delta Force auction items
 */
import {
  LANGUAGE_EN,
  LANGUAGE_ZH_HANS,
  getAuctionItem,
  getAuctionItemPriceSeries,
  getAuctionItemPrices,
  listAuctionItems
} from '../api/client.js';
import { getCurrentLanguage, t } from '../i18n.js';
import { escapeHTML } from '../utils/security.js';

let currentChart = null;
let lastKnownCurrentPrice = 0;
let lastKnownBenchmarkPrice = 0;
let lastKnownBenchmarkLabel = t('market.benchmarkPrice', { range: t('market.range.day7') });
const marketItemDetailsCache = new Map();
const MARKET_SEARCH_DEBOUNCE_MS = 280;
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

function getMarketSearchField() {
  return getCurrentLanguage() === 'zh' ? 'lang_zh_hans' : 'lang_en';
}

function getMarketApiLanguage() {
  return getCurrentLanguage() === 'zh' ? LANGUAGE_ZH_HANS : LANGUAGE_EN;
}

function escapeMarketFilterValue(value = '') {
  return String(value)
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\s+/g, ' ');
}

function getLocale() {
  const language = getCurrentLanguage();
  if (language === 'en') return 'en-US';
  if (language === 'zh') return 'zh-CN';
  return 'id-ID';
}

// Helper to format price values for stats
function formatPriceShort(val) {
  const num = Number(val);
  if (isNaN(num)) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString(getLocale());
}

function updatePriceTrend() {
  const currentPriceEl = document.getElementById('modal-current-price');
  const benchmarkPriceEl = document.getElementById('modal-benchmark-price');
  const benchmarkLabelEl = document.getElementById('benchmark-price-label');
  const highPriceEl = document.getElementById('modal-high-price');
  const highPriceLabelEl = document.getElementById('high-price-label');
  const lowPriceEl = document.getElementById('modal-low-price');
  const lowPriceLabelEl = document.getElementById('low-price-label');
  const spreadEl = document.getElementById('price-spread-value');
  const spreadLabelEl = document.getElementById('price-spread-label');
  if (!currentPriceEl || !benchmarkPriceEl) return;

  const currentPrice = lastKnownCurrentPrice;
  const benchmarkPrice = lastKnownBenchmarkPrice;
  const spreadPercent = getSpreadPercent(currentPrice, benchmarkPrice);
  const marketStatus = getMarketStatus(currentPrice, benchmarkPrice);

  currentPriceEl.innerText = formatPriceShort(currentPrice);
  benchmarkPriceEl.innerText = formatPriceShort(benchmarkPrice);
  if (benchmarkLabelEl) {
    benchmarkLabelEl.innerText = lastKnownBenchmarkLabel;
  }
  if (spreadEl) {
    spreadEl.innerText = spreadPercent === null
      ? '-'
      : `${spreadPercent > 0 ? '+' : ''}${spreadPercent.toFixed(1)}%`;
    spreadEl.className = `market-detail-inline-value ${marketStatus.colorClass}`;
  }
  if (spreadLabelEl) {
    spreadLabelEl.innerText = t('market.currentPrice');
  }
  if (benchmarkLabelEl) {
    benchmarkLabelEl.innerText = lastKnownBenchmarkLabel;
  }
  if (highPriceLabelEl) {
    highPriceLabelEl.innerText = t('market.chartSummary.high', { range: formatRangeShort(getActiveMarketRangeDays()) });
  }
  if (lowPriceLabelEl) {
    lowPriceLabelEl.innerText = t('market.chartSummary.low', { range: formatRangeShort(getActiveMarketRangeDays()) });
  }

  const trendContainer = document.getElementById('price-trend-icon');
  if (trendContainer) {
    currentPriceEl.setAttribute('class', `stat-value ${marketStatus.colorClass}`);

    if (marketStatus.state === 'expensive') {
      trendContainer.innerHTML = `<i data-lucide="trending-up" class="${marketStatus.colorClass}" style="width: 16px; height: 16px; opacity: 0.8;"></i>`;
      trendContainer.style.display = 'flex';
    } else if (marketStatus.state === 'cheap') {
      trendContainer.innerHTML = `<i data-lucide="trending-down" class="${marketStatus.colorClass}" style="width: 16px; height: 16px; opacity: 0.8;"></i>`;
      trendContainer.style.display = 'flex';
    } else {
      trendContainer.style.display = 'none';
      trendContainer.innerHTML = '';
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

export function renderMarketPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><i data-lucide="store" style="margin-right: 8px"></i>${t('market.title')}</h1>
      <p class="page-subtitle">${t('market.subtitle')}</p>
    </div>

    <div class="search-bar">
      <span class="search-icon"><i data-lucide="search"></i></span>
      <input type="text" class="search-input" id="market-search"
        placeholder="${t('market.searchPlaceholder')}" />
    </div>
    <div id="market-search-meta" class="market-search-meta text-muted">${t('market.searchBrowse')}</div>



    <div id="market-results" class="grid-2-compact">
      <div class="loading-container" style="grid-column: 1 / -1">
        <i data-lucide="loader" class="spinner-lucide"></i>
        <span class="loading-text">${t('market.loading')}</span>
      </div>
    </div>

    <div id="market-pagination" class="pagination" style="display:none; justify-content: center; gap: var(--space-md); margin-top: var(--space-xl);">
      <button class="btn btn-secondary btn-sm" id="market-prev" disabled>
        ${t('market.prev')}
      </button>
      <span id="market-page-info" style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600; min-width: 80px; text-align: center;">${t('market.pageInfo', { page: 1 })}</span>
      <button class="btn btn-secondary btn-sm" id="market-next">
        ${t('market.next')}
      </button>
    </div>
  `;

  let currentFilter = '';
  let currentSearch = '';
  let currentPageToken = '';
  let tokenStack = []; // Stack to keep track of previous page tokens
  let currentPage = 1;
  let latestLoadRequestId = 0;
  const searchInput = container.querySelector('#market-search');
  const searchMeta = container.querySelector('#market-search-meta');

  // Initial load
  loadMarketItems(container);

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 10);
  }

  // Search
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const nextSearch = e.target.value.trim();
    if (searchMeta) {
      searchMeta.textContent = nextSearch
        ? t('market.searchPending', { query: nextSearch })
        : t('market.searchBrowse');
    }
    searchTimeout = setTimeout(() => {
      currentSearch = nextSearch;
      currentPageToken = '';
      tokenStack = [];
      currentPage = 1;
      loadMarketItems(container);
    }, MARKET_SEARCH_DEBOUNCE_MS);
  });

  // Pagination controls
  container.querySelector('#market-prev').addEventListener('click', () => {
    if (tokenStack.length > 0) {
      currentPageToken = tokenStack.pop();
      currentPage--;
      loadMarketItems(container);
    }
  });

  container.querySelector('#market-next').addEventListener('click', () => {
    // Current token is stored in the stack when moving forward
    // but the actual nextPageToken is set inside loadMarketItems after fetch
    // So we'll need to handle stack pushing inside loadMarketItems
  });

  async function loadMarketItems(container, direction = 'first') {
    const requestId = ++latestLoadRequestId;
    const resultsEl = container.querySelector('#market-results');
    const paginationEl = container.querySelector('#market-pagination');
    const prevBtn = container.querySelector('#market-prev');
    const nextBtn = container.querySelector('#market-next');
    const pageInfo = container.querySelector('#market-page-info');

    resultsEl.innerHTML = `
      <div class="loading-container" style="grid-column: 1 / -1">
        <div class="spinner"></div>
        <span class="loading-text">${t('market.loadingWithPrices')}</span>
      </div>`;
    if (searchMeta) {
      searchMeta.textContent = currentSearch
        ? t('market.searchLoading', { query: currentSearch })
        : t('market.searchBrowse');
    }

    try {
      let filter = currentFilter;
      if (currentSearch) {
        const searchValue = escapeMarketFilterValue(currentSearch);
        const searchField = getMarketSearchField();
        const searchFilter = `${searchField} : "${searchValue}"`;
        filter = filter ? `${searchFilter} AND ${filter}` : searchFilter;
      }

      const data = await listAuctionItems({
        filter,
        language: getMarketApiLanguage(),
        pageSize: 10,
        pageToken: currentPageToken,
      });
      if (requestId !== latestLoadRequestId) return;

      const items = data.items || data.auctionItems || [];
      const nextToken = data.nextPageToken || '';
      const enrichedItems = await enrichMarketItems(items);
      if (requestId !== latestLoadRequestId) return;

      resultsEl.innerHTML = '';

      if (enrichedItems.length === 0) {
        resultsEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1">
            <div class="empty-icon"><i data-lucide="package-search"></i></div>
            <div class="empty-text">${t('market.noItemsTitle')}</div>
            <div class="empty-hint">${t('market.noItemsHint')}</div>
          </div>`;
        paginationEl.style.display = 'none';
        if (searchMeta) {
          searchMeta.textContent = currentSearch
            ? t('market.searchNoResults', { query: currentSearch })
            : t('market.searchBrowse');
        }
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      enrichedItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'list-item-card';
        const spreadPercent = getSpreadPercent(item.price, item.marketBaseline7d);
        const marketStatus = getMarketStatus(item.price, item.marketBaseline7d);
        card.innerHTML = `
          <div class="list-item-icon">
            <i data-lucide="package" style="width: 16px; height: 16px;"></i>
          </div>
          <div class="list-item-main">
            <div class="list-item-info">
              <div class="list-item-name">${escapeHTML(item.name || item.langEn || item.displayName || t('market.itemType'))}</div>
              <div class="list-item-category">${t('market.mapIdPrefix')}: ${escapeHTML(item.id.substring(0, 8))}...</div>
            </div>
            <div class="list-item-action" style="margin-left: auto; gap: var(--space-md); align-items: center;">
              <div style="text-align: right;">
                <div class="list-item-price ${marketStatus.colorClass}">${formatPriceShort(item.price || 0)}</div>
                <div class="${marketStatus.colorClass}" style="font-size: 0.8rem; font-weight: 700; font-family: var(--font-mono);">
                  ${formatMarketSpread(spreadPercent)}
                </div>
              </div>
            </div>
          </div>
        `;
        card.addEventListener('click', () => {
          openMarketItemOverlay(item.id);
        });
        resultsEl.appendChild(card);
      });

      // Update Pagination UI
      paginationEl.style.display = 'flex';
      prevBtn.disabled = tokenStack.length === 0;
      nextBtn.disabled = !nextToken;
      pageInfo.innerText = t('market.pageInfo', { page: currentPage });
      if (searchMeta) {
        searchMeta.textContent = currentSearch
          ? t('market.searchResults', { count: enrichedItems.length, query: currentSearch })
          : t('market.searchBrowse');
      }

      // Update the "Next" click handler with the closure-scoped nextToken
      const newNextBtn = nextBtn.cloneNode(true);
      nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
      newNextBtn.onclick = () => {
        tokenStack.push(currentPageToken);
        currentPageToken = nextToken;
        currentPage++;
        loadMarketItems(container, 'next');
      };

      if (window.lucide) window.lucide.createIcons();

    } catch (err) {
      if (requestId !== latestLoadRequestId) return;
      console.error('Market load error:', err);
      resultsEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1">
          <div class="empty-icon">⚠️</div>
          <div class="empty-text">${t('market.loadErrorTitle')}</div>
          <div class="empty-hint">${err.message}</div>
        </div>`;
      if (searchMeta) {
        searchMeta.textContent = t('market.loadErrorTitle');
      }
    }
  }
}

export function closeMarketItemOverlay() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay || overlay.dataset.closing === 'true') return;

  overlay.dataset.closing = 'true';
  overlay.classList.add('is-closing');
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    if (currentChart) {
      currentChart.destroy();
      currentChart = null;
    }
    overlay.remove();
  };

  overlay.addEventListener('animationend', cleanup, { once: true });
  window.setTimeout(cleanup, 260);
}

function openMarketItemOverlay(itemId) {
  closeMarketItemOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content market-detail-modal" role="dialog" aria-modal="true" aria-label="Detail item market">
      <button type="button" class="modal-close" aria-label="Tutup detail item">
        <i data-lucide="x"></i>
      </button>
      <div id="market-detail-modal-body"></div>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeMarketItemOverlay();
    }
  });

  overlay.querySelector('.modal-close')?.addEventListener('click', closeMarketItemOverlay);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
  });
  renderMarketItemView(overlay.querySelector('#market-detail-modal-body'), itemId, { showBackButton: false });

  if (window.lucide) window.lucide.createIcons();
}

export async function renderMarketItemPage(container, itemId) {
  return renderMarketItemView(container, itemId, { showBackButton: true });
}

async function renderMarketItemView(container, itemId, { showBackButton = true } = {}) {
  container.innerHTML = `
    <div class="item-detail-header">
      ${showBackButton ? `
      <div style="margin-bottom: var(--space-md)">
        <button class="btn btn-secondary btn-sm" onclick="window.history.pushState({}, '', '/market'); window.dispatchEvent(new Event('popstate'));" style="padding: 6px 12px; height: 32px; font-size: 0.8rem;">
          <i data-lucide="arrow-left" style="width: 14px; height: 14px; margin-right: 4px"></i> ${t('market.back')}
        </button>
      </div>` : ''}
      
      <div class="item-header-main">
        <div class="item-header-content">
          <h1 class="page-title" id="page-item-name">${t('market.detailLoading')}</h1>
          <div class="item-category" id="page-item-category">${t('market.itemType')}</div>
        </div>

        <div class="item-header-stats">
          <div class="market-detail-stat">
            <div class="market-detail-stat-info">
              <div class="market-detail-current-row">
                <div id="modal-current-price" class="stat-value text-green">${t('market.detailLoading')}</div>
                <span id="price-trend-icon" style="display: none; align-items: center;">
                  <i data-lucide="trending-down" class="text-green" style="width: 16px; height: 16px; opacity: 0.8;"></i>
                </span>
              </div>
              <div class="market-detail-inline-meta">
                <div id="price-spread-label" class="stat-label">${t('market.currentPrice')}</div>
                <div id="price-spread-value" class="market-detail-inline-value text-gold">-</div>
              </div>
            </div>
          </div>

          <div class="market-detail-stat">
            <div class="market-detail-stat-info">
              <div id="modal-benchmark-price" class="stat-value text-gold">${t('market.detailLoading')}</div>
              <div id="benchmark-price-label" class="stat-label">${t('market.benchmarkPrice', { range: t('market.range.day1') })}</div>
            </div>
          </div>

          <div class="market-detail-stat">
            <div class="market-detail-stat-info">
              <div id="modal-high-price" class="stat-value">-</div>
              <div id="high-price-label" class="stat-label">${t('market.chartSummary.high', { range: t('market.range.day1') })}</div>
            </div>
          </div>

          <div class="market-detail-stat">
            <div class="market-detail-stat-info">
              <div id="modal-low-price" class="stat-value">-</div>
              <div id="low-price-label" class="stat-label">${t('market.chartSummary.low', { range: t('market.range.day1') })}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="market-detail-section">
      <div class="market-detail-section-header">
        <div style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 0.9rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          <i data-lucide="line-chart" style="width: 18px; height: 18px; color: var(--accent-primary)"></i>
          ${t('market.chartTitle')}
        </div>
        <div class="range-selector" id="chart-range-selector" style="display: flex; gap: 4px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
          <button class="range-btn active" data-days="1">${t('market.range.day1')}</button>
          <button class="range-btn" data-days="3">${t('market.range.day3')}</button>
          <button class="range-btn" data-days="7">${t('market.range.day7')}</button>
          <button class="range-btn" data-days="14">${t('market.range.day14')}</button>
          <button class="range-btn" data-days="30">${t('market.range.day30')}</button>
        </div>
      </div>
      <div class="chart-container market-detail-chart" style="height: 400px; padding: 0;">
        <canvas id="price-chart"></canvas>
        <div id="chart-loading" class="loading-container" style="position: absolute; inset: 0; background: rgba(13,20,17,0.8); display: flex; align-items: center; justify-content: center; z-index: 10;">
          <div class="spinner"></div>
          <span class="loading-text" style="margin-left: 12px">${t('market.chartLoading')}</span>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  try {
    const data = await getAuctionItem(itemId, getMarketApiLanguage());
    const item = data.item || data;

    const itemName = item.name || item.langEn || 'Unknown';
    document.getElementById('page-item-name').innerText = escapeHTML(itemName);
    document.getElementById('page-item-category').innerText = escapeHTML(item.categoryName || item.category || t('market.itemType'));

    if (showBackButton) {
      window.updateMetadata({
        title: t('routes.marketItem.title', { itemName }),
        description: t('routes.marketItem.description', { itemName })
      });
    }

    // Load chart data
    loadPriceChart(itemId, 1);
    loadRecentPrices(itemId);

    // Range selector handlers
    document.getElementById('chart-range-selector').addEventListener('click', (e) => {
      const btn = e.target.closest('.range-btn');
      if (!btn) return;
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days);
      loadPriceChart(itemId, days);
    });
  } catch (err) {
    console.error('Failed to load item:', err);
    container.innerHTML = `<div class="empty-state">${t('market.loadErrorTitle')}: ${err.message}</div>`;
  }
}

async function loadPriceChart(itemId, days = 1) {
  const chartLoading = document.getElementById('chart-loading');
  const canvas = document.getElementById('price-chart');

  chartLoading.style.display = 'flex';
  chartLoading.innerHTML = `<div class="spinner"></div><span class="loading-text" style="margin-left: 12px">${t('market.chartLoading')}</span>`;
  updateMarketRangeStats(days, null);

  try {
    const now = new Date();
    const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Choose interval based on range
    let interval = 'INTERVAL_DAY';
    if (days <= 3) interval = 'INTERVAL_HOUR';

    const marketData = await getAuctionItemPriceSeries(itemId, {
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      interval: interval,
      language: getMarketApiLanguage(),
    });

    chartLoading.style.display = 'none';

    const marketSeries = marketData.priceSeries || marketData.series || marketData.prices || [];

    if (marketSeries.length === 0) {
      chartLoading.style.display = 'flex';
      chartLoading.innerHTML = `<span class="text-muted">${t('market.chartEmpty')}</span>`;
      updateMarketRangeStats(days, null);
      return;
    }

    const mergedSeries = mergePriceSeries(marketSeries);
    const labels = mergedSeries.map(point => formatSeriesLabel(point.timestamp, days));
    const avgPrices = mergedSeries.map(point => point.marketAvg);
    const highPrices = mergedSeries.map(point => point.marketHigh);
    const lowPrices = mergedSeries.map(point => point.marketLow);
    const marketMedian = getMedianPrice(avgPrices);
    const baselinePrices = avgPrices.map(() => marketMedian);
    const pointRadius = getLinePointRadius(labels.length, days);
    const tickLimit = getTimeAxisTickLimit(days, labels.length);
    const Chart = await getChartConstructor();

    lastKnownBenchmarkPrice = marketMedian;
    lastKnownBenchmarkLabel = getMarketBaselineLabel(days);
    updateMarketRangeStats(days, {
      highPrices,
      lowPrices,
    });
    updatePriceTrend();

    if (currentChart) currentChart.destroy();

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(96, 165, 250, 0.22)');
    gradient.addColorStop(1, 'rgba(96, 165, 250, 0)');

    currentChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: t('market.series.market'),
            data: avgPrices,
            borderColor: '#60a5fa',
            backgroundColor: gradient,
            fill: true,
            cubicInterpolationMode: 'monotone',
            tension: 0.28,
            borderWidth: 2,
            pointRadius,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#60a5fa',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            spanGaps: true,
          },
          {
            label: lastKnownBenchmarkLabel,
            data: baselinePrices,
            borderColor: 'rgba(255, 255, 255, 0.92)',
            backgroundColor: 'transparent',
            borderWidth: 1.6,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: '#d1d5db',
            pointHoverBorderWidth: 2,
            fill: false,
            spanGaps: true,
          },
          {
            label: t('market.series.high'),
            data: highPrices,
            borderColor: 'rgba(248, 113, 113, 0.65)',
            borderWidth: 1,
            cubicInterpolationMode: 'monotone',
            tension: 0.2,
            pointRadius: 0,
            fill: false,
            spanGaps: true,
          },
          {
            label: t('market.series.low'),
            data: lowPrices,
            borderColor: 'rgba(74, 222, 128, 0.65)',
            borderWidth: 1,
            cubicInterpolationMode: 'monotone',
            tension: 0.2,
            pointRadius: 0,
            fill: false,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1000,
          easing: 'easeOutQuart',
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: '#9ca89f',
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 15,
              font: { family: 'Inter', size: 11, weight: '500' }
            },
          },
          tooltip: {
            backgroundColor: 'rgba(17, 26, 22, 0.95)',
            borderColor: 'rgba(96, 165, 250, 0.2)',
            borderWidth: 1,
            titleColor: '#fff',
            bodyColor: '#9ca89f',
            titleFont: { family: 'Inter', size: 13, weight: '700' },
            bodyFont: { family: 'JetBrains Mono', size: 12 },
            padding: 12,
            cornerRadius: 10,
            displayColors: true,
            boxPadding: 6,
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                  label += formatPrice(context.parsed.y);
                }
                return label;
              }
            }
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#5c6860',
              font: { size: 10, family: 'Inter' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: tickLimit
            },
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false },
            ticks: {
              color: '#5c6860',
              font: { size: 10, family: 'JetBrains Mono' },
              callback: (v) => formatPrice(v),
              padding: 8
            },
            grace: '8%',
          },
        },
      },
    });
  } catch (err) {
    console.error('Price chart error:', err);
    chartLoading.innerHTML = `<span class="text-muted">⚠️ ${t('market.chartError')}</span>`;
    updateMarketRangeStats(days, null);
  }
}

async function loadRecentPrices(itemId) {
  try {
    const latestPrice = await getLatestMarketSnapshot(itemId);
    lastKnownCurrentPrice = Number(latestPrice.price || 0);
    updatePriceTrend();

  } catch (err) {
    console.error('Recent prices error:', err);
    const curEl = document.getElementById('modal-current-price');
    if (curEl) curEl.innerHTML = `<span class="text-red">${t('market.loadErrorTitle')}</span>`;
  }
}

async function enrichMarketItems(items) {
  const detailResults = await Promise.all(items.map(async (item) => {
    if (marketItemDetailsCache.has(item.id)) {
      return {
        ...item,
        ...marketItemDetailsCache.get(item.id),
      };
    }

    try {
      const [latestPrice, marketBaseline7d] = await Promise.all([
        getLatestMarketSnapshot(item.id),
        getMarketBaseline(item.id, 7),
      ]);
      const snapshot = {
        price: Number(latestPrice.price || 0),
        marketBaseline7d: Number(marketBaseline7d || 0),
      };
      marketItemDetailsCache.set(item.id, snapshot);
      return {
        ...item,
        ...snapshot,
      };
    } catch (error) {
      console.error(`Failed to enrich market item ${item.id}:`, error);
      return {
        ...item,
        price: 0,
        marketBaseline7d: 0,
      };
    }
  }));

  return detailResults;
}

async function getLatestMarketSnapshot(itemId) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const data = await getAuctionItemPrices(itemId, {
    pageSize: 1,
    orderBy: 'created_at desc',
    startTime: oneDayAgo.toISOString(),
    endTime: now.toISOString(),
    language: getMarketApiLanguage(),
  });
  return data.prices?.[0] || data.auctionItemPrices?.[0] || data.items?.[0] || {};
}

function mergePriceSeries(marketSeries, referenceSeries) {
  const points = new Map();

  marketSeries.forEach((entry) => {
    const key = normalizeSeriesTimestamp(entry.time || entry.timestamp);
    points.set(key, {
      timestamp: key,
      marketAvg: Number(entry.priceAverage || entry.priceAvg || entry.average || entry.avg || 0),
      marketHigh: Number(entry.priceHigh || entry.high || 0),
      marketLow: Number(entry.priceLow || entry.low || 0),
    });
  });

  return [...points.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function normalizeSeriesTimestamp(value) {
  return value ? new Date(value).toISOString() : new Date(0).toISOString();
}

function formatSeriesLabel(timestamp, days) {
  const date = new Date(timestamp);
  if (days <= 3) {
    return date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
}

function getSpreadPercent(currentPrice, referencePrice) {
  if (!currentPrice || !referencePrice) return null;
  return ((currentPrice - referencePrice) / referencePrice) * 100;
}

function getMarketStatus(currentPrice, referencePrice) {
  if (!currentPrice || !referencePrice) {
    return {
      state: 'unknown',
      colorClass: 'text-gold',
      spreadLabel: t('market.status.unknown'),
      description: t('market.descriptions.unknown'),
    };
  }

  const spreadPercent = getSpreadPercent(currentPrice, referencePrice);
  if (spreadPercent === null) {
    return {
      state: 'unknown',
      colorClass: 'text-gold',
      spreadLabel: t('market.status.unknown'),
      description: t('market.descriptions.unknown'),
    };
  }

  if (spreadPercent < 0) {
    return {
      state: 'cheap',
      colorClass: 'text-green',
      spreadLabel: t('market.status.cheap'),
      description: t('market.descriptions.cheap'),
    };
  }

  if (spreadPercent > 0) {
    return {
      state: 'expensive',
      colorClass: 'text-red',
      spreadLabel: t('market.status.expensive'),
      description: t('market.descriptions.expensive'),
    };
  }

  return {
    state: 'fair',
    colorClass: 'text-gold',
    spreadLabel: t('market.status.fair'),
    description: t('market.descriptions.fair'),
  };
}

function formatMarketSpread(spreadPercent) {
  if (spreadPercent === null) return '-';
  return `${spreadPercent > 0 ? '+' : ''}${spreadPercent.toFixed(1)}%`;
}

function getTimeAxisTickLimit(days, points) {
  if (points <= 6) return points;
  if (days <= 1) return 6;
  if (days <= 3) return 8;
  if (days <= 14) return 7;
  return 6;
}

function getLinePointRadius(points, days) {
  if (days <= 3 && points <= 12) return 3;
  if (points <= 10) return 2.5;
  if (points <= 24) return 1.5;
  return 0;
}

async function getMarketBaseline(itemId, days) {
  const now = new Date();
  const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const interval = days <= 3 ? 'INTERVAL_HOUR' : 'INTERVAL_DAY';
  const data = await getAuctionItemPriceSeries(itemId, {
    startTime: startTime.toISOString(),
    endTime: now.toISOString(),
    interval,
    language: getMarketApiLanguage(),
  });
  const marketSeries = data.priceSeries || data.series || data.prices || [];
  const values = marketSeries.map((entry) => Number(entry.priceAverage || entry.priceAvg || entry.average || entry.avg || 0));
  return getMedianPrice(values);
}

function getMedianPrice(values) {
  const normalized = values
    .map((value) => Number(value || 0))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  if (normalized.length === 0) return 0;

  const middleIndex = Math.floor(normalized.length / 2);
  if (normalized.length % 2 === 0) {
    return (normalized[middleIndex - 1] + normalized[middleIndex]) / 2;
  }

  return normalized[middleIndex];
}

function getMarketBaselineLabel(days) {
  return t('market.benchmarkPrice', { range: formatRangeShort(days) });
}

function updateMarketRangeStats(days, summary) {
  const highPriceEl = document.getElementById('modal-high-price');
  const lowPriceEl = document.getElementById('modal-low-price');
  const highPriceLabelEl = document.getElementById('high-price-label');
  const lowPriceLabelEl = document.getElementById('low-price-label');

  if (highPriceLabelEl) {
    highPriceLabelEl.innerText = t('market.chartSummary.high', { range: formatRangeShort(days) });
  }
  if (lowPriceLabelEl) {
    lowPriceLabelEl.innerText = t('market.chartSummary.low', { range: formatRangeShort(days) });
  }

  if (!summary) {
    if (highPriceEl) highPriceEl.innerText = '-';
    if (lowPriceEl) lowPriceEl.innerText = '-';
    return;
  }

  const validHighPrices = summary.highPrices.filter(value => Number(value) > 0);
  const validLowPrices = summary.lowPrices.filter(value => Number(value) > 0);

  if (highPriceEl) {
    highPriceEl.innerText = validHighPrices.length ? formatPrice(Math.max(...validHighPrices)) : '-';
  }
  if (lowPriceEl) {
    lowPriceEl.innerText = validLowPrices.length ? formatPrice(Math.min(...validLowPrices)) : '-';
  }
}

function getActiveMarketRangeDays() {
  const activeRange = document.querySelector('#chart-range-selector .range-btn.active');
  return Number(activeRange?.dataset.days || 1);
}

function formatRangeShort(days) {
  if (days === 1) return t('market.range.day1');
  if (days === 3) return t('market.range.day3');
  if (days === 7) return t('market.range.day7');
  if (days === 14) return t('market.range.day14');
  if (days === 30) return t('market.range.day30');
  if (getCurrentLanguage() === 'en') return `${days}D`;
  if (getCurrentLanguage() === 'zh') return `${days}天`;
  return `${days}H`;
}


function formatPrice(value) {
  const num = Number(value);
  if (isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString(getLocale());
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
