/**
 * Market Tracker Page
 * Search, browse, and analyze Delta Force auction items
 */
import { listAuctionItems, getAuctionItem, getAuctionItemPriceSeries, getAuctionItemPrices } from '../api/client.js';
import { Chart, registerables } from 'chart.js';
import { escapeHTML } from '../utils/security.js';

Chart.register(...registerables);

let currentChart = null;
let lastKnownCurrentPrice = 0;
let lastKnownReferencePrice = 0;

// Helper to format price values for stats
function formatPriceShort(val) {
  const num = Number(val);
  if (isNaN(num)) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('id-ID');
}

function updatePriceTrend() {
  const currentPriceEl = document.getElementById('modal-current-price');
  const referencePriceEl = document.getElementById('modal-reference-price');
  if (!currentPriceEl || !referencePriceEl) return;

  const currentPrice = lastKnownCurrentPrice;
  const referencePrice = lastKnownReferencePrice;

  currentPriceEl.innerText = formatPriceShort(currentPrice);
  referencePriceEl.innerText = formatPriceShort(referencePrice);

  const trendContainer = document.getElementById('price-trend-icon');
  if (trendContainer) {
    if (currentPrice > referencePrice && referencePrice > 0) {
      // Overpriced: Red & Up arrow
      currentPriceEl.setAttribute('class', 'stat-value text-red');
      trendContainer.innerHTML = `<i data-lucide="trending-up" class="text-red" style="width: 16px; height: 16px; opacity: 0.8;"></i>`;
      trendContainer.style.display = 'flex';
    } else if (currentPrice < referencePrice && currentPrice > 0) {
      // Bargain: Green & Down arrow
      currentPriceEl.setAttribute('class', 'stat-value text-green');
      trendContainer.innerHTML = `<i data-lucide="trending-down" class="text-green" style="width: 16px; height: 16px; opacity: 0.8;"></i>`;
      trendContainer.style.display = 'flex';
    } else {
      // Fair Price or Missing Data: Gold & No trend
      currentPriceEl.setAttribute('class', 'stat-value text-gold');
      trendContainer.style.display = 'none';
      trendContainer.innerHTML = '';
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

export function renderMarketPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><i data-lucide="store" style="margin-right: 8px"></i>Market Tracker</h1>
      <p class="page-subtitle">Cari item, pantau harga, dan analisis tren pasar Delta Force</p>
    </div>

    <div class="search-bar">
      <span class="search-icon"><i data-lucide="search"></i></span>
      <input type="text" class="search-input" id="market-search"
        placeholder="Cari item... contoh: M4A1, AK47, Armor" />
    </div>



    <div id="market-results" class="grid-2-compact">
      <div class="loading-container" style="grid-column: 1 / -1">
        <i data-lucide="loader" class="spinner-lucide"></i>
        <span class="loading-text">Memuat data market...</span>
      </div>
    </div>

    <div id="market-pagination" class="pagination" style="display:none; justify-content: center; gap: var(--space-md); margin-top: var(--space-xl);">
      <button class="btn btn-secondary btn-sm" id="market-prev" disabled>
        ← Sebelumnya
      </button>
      <span id="market-page-info" style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600; min-width: 80px; text-align: center;">Halaman 1</span>
      <button class="btn btn-secondary btn-sm" id="market-next">
        Selanjutnya →
      </button>
    </div>
  `;

  let currentFilter = '';
  let currentSearch = '';
  let currentPageToken = '';
  let tokenStack = []; // Stack to keep track of previous page tokens
  let currentPage = 1;

  // Initial load
  loadMarketItems(container);

  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 10);
  }

  // Search
  const searchInput = container.querySelector('#market-search');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value.trim();
      currentPageToken = '';
      tokenStack = [];
      currentPage = 1;
      loadMarketItems(container);
    }, 500);
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
    const resultsEl = container.querySelector('#market-results');
    const paginationEl = container.querySelector('#market-pagination');
    const prevBtn = container.querySelector('#market-prev');
    const nextBtn = container.querySelector('#market-next');
    const pageInfo = container.querySelector('#market-page-info');

    resultsEl.innerHTML = `
      <div class="loading-container" style="grid-column: 1 / -1">
        <div class="spinner"></div>
        <span class="loading-text">Memuat data market...</span>
      </div>`;

    try {
      let filter = currentFilter;
      if (currentSearch) {
        const searchFilter = `lang_en : "${currentSearch}"`;
        filter = filter ? `${searchFilter} AND ${filter}` : searchFilter;
      }

      const data = await listAuctionItems({
        filter,
        pageSize: 10,
        pageToken: currentPageToken,
      });

      const items = data.items || data.auctionItems || [];
      const nextToken = data.nextPageToken || '';

      resultsEl.innerHTML = '';

      if (items.length === 0) {
        resultsEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1">
            <div class="empty-icon"><i data-lucide="package-search"></i></div>
            <div class="empty-text">Tidak ada item ditemukan</div>
            <div class="empty-hint">Coba kata kunci lain atau ubah filter</div>
          </div>`;
        paginationEl.style.display = 'none';
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'list-item-card';
        card.innerHTML = `
          <div class="list-item-icon">
            <i data-lucide="package" style="width: 16px; height: 16px;"></i>
          </div>
          <div class="list-item-main">
            <div class="list-item-info">
              <div class="list-item-name">${escapeHTML(item.name || item.langEn || item.displayName || 'Unknown Item')}</div>
              <div class="list-item-category">ID: ${escapeHTML(item.id.substring(0, 8))}...</div>
            </div>
          </div>
        `;
        card.addEventListener('click', () => {
          window.history.pushState({}, '', `/market/item/${item.id}`);
          // Trigger router (can also import navigateTo but this is simpler for now)
          window.dispatchEvent(new Event('popstate'));
        });
        resultsEl.appendChild(card);
      });

      // Update Pagination UI
      paginationEl.style.display = 'flex';
      prevBtn.disabled = tokenStack.length === 0;
      nextBtn.disabled = !nextToken;
      pageInfo.innerText = `Halaman ${currentPage}`;

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
      console.error('Market load error:', err);
      resultsEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1">
          <div class="empty-icon">⚠️</div>
          <div class="empty-text">Gagal memuat data market</div>
          <div class="empty-hint">${err.message}</div>
        </div>`;
    }
  }
}

export async function renderMarketItemPage(container, itemId) {
  container.innerHTML = `
    <div class="item-detail-header">
      <div style="margin-bottom: var(--space-md)">
        <button class="btn btn-secondary btn-sm" onclick="window.history.pushState({}, '', '/market'); window.dispatchEvent(new Event('popstate'));" style="padding: 6px 12px; height: 32px; font-size: 0.8rem;">
          <i data-lucide="arrow-left" style="width: 14px; height: 14px; margin-right: 4px"></i> Kembali
        </button>
      </div>
      
      <div class="item-header-main">
        <div class="item-header-content">
          <h1 class="page-title" id="page-item-name">Memuat...</h1>
          <div class="item-category" id="page-item-category">Item</div>
        </div>

        <div class="item-header-stats">
          <div class="stat-card">
            <div class="stat-info">
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <div id="modal-current-price" class="stat-value text-green">Memuat...</div>
                <span id="price-trend-icon" style="display: none; align-items: center;">
                  <i data-lucide="trending-down" class="text-green" style="width: 16px; height: 16px; opacity: 0.8;"></i>
                </span>
              </div>
              <div class="stat-label">Harga Saat Ini</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-info">
              <div id="modal-reference-price" class="stat-value text-gold">Memuat...</div>
              <div class="stat-label">Harga Referensi</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 0.9rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          <i data-lucide="line-chart" style="width: 18px; height: 18px; color: var(--accent-primary)"></i>
          Grafik Harga Historis
        </div>
        <div class="range-selector" id="chart-range-selector" style="display: flex; gap: 4px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
          <button class="range-btn active" data-days="1">1D</button>
          <button class="range-btn" data-days="3">3D</button>
          <button class="range-btn" data-days="7">7D</button>
          <button class="range-btn" data-days="14">2W</button>
          <button class="range-btn" data-days="30">1M</button>
        </div>
      </div>
      
      <div class="chart-container" style="height: 400px; padding: 0;">
        <canvas id="price-chart"></canvas>
        <div id="chart-loading" class="loading-container" style="position: absolute; inset: 0; background: rgba(13,20,17,0.8); display: flex; align-items: center; justify-content: center; z-index: 10;">
          <div class="spinner"></div>
          <span class="loading-text" style="margin-left: 12px">Memuat grafik...</span>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  try {
    const data = await getAuctionItem(itemId);
    const item = data.item || data;

    const itemName = item.name || item.langEn || 'Unknown';
    document.getElementById('page-item-name').innerText = escapeHTML(itemName);
    document.getElementById('page-item-category').innerText = escapeHTML(item.categoryName || item.category || 'Item');

    // Update SEO
    window.updateMetadata({
      title: `${itemName} — Market Tracker`,
      description: `Pantau harga dan tren pasar untuk ${itemName} di Delta Force. Analisis grafik harga historis dan rata-rata harga pasar.`
    });

    // Load chart data
    loadPriceChart(itemId, 1);
    loadRecentPrices(itemId);

    // Dynamic Price Trend Logic
    lastKnownCurrentPrice = Number(item.price || 0);
    lastKnownReferencePrice = Number(item.referencePrice || item.avgPrice || 0);
    updatePriceTrend();

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
    container.innerHTML = `<div class="empty-state">Gagal memuat item: ${err.message}</div>`;
  }
}

async function loadPriceChart(itemId, days = 1) {
  const chartLoading = document.getElementById('chart-loading');
  const canvas = document.getElementById('price-chart');

  chartLoading.style.display = 'flex';
  chartLoading.innerHTML = '<div class="spinner"></div><span class="loading-text" style="margin-left: 12px">Memuat grafik...</span>';

  try {
    const now = new Date();
    const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Choose interval based on range
    let interval = 'INTERVAL_DAY';
    if (days <= 3) interval = 'INTERVAL_HOUR';

    const data = await getAuctionItemPriceSeries(itemId, {
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      interval: interval,
    });

    chartLoading.style.display = 'none';

    const series = data.priceSeries || data.series || data.prices || [];
    if (series.length === 0) {
      chartLoading.style.display = 'flex';
      chartLoading.innerHTML = '<span class="text-muted">Belum ada data harga historis</span>';
      return;
    }

    const labels = series.map(s => {
      const d = new Date(s.time || s.timestamp);
      if (days <= 3) {
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    });

    const avgPrices = series.map(s => s.priceAverage || s.priceAvg || s.average || s.avg || 0);
    const highPrices = series.map(s => s.priceHigh || s.high || 0);
    const lowPrices = series.map(s => s.priceLow || s.low || 0);

    const latestAvg = avgPrices.length > 0 ? avgPrices[avgPrices.length - 1] : 0;
    lastKnownReferencePrice = latestAvg;
    updatePriceTrend();

    if (currentChart) currentChart.destroy();

    // Create gradient
    const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(15, 247, 150, 0.25)');
    gradient.addColorStop(1, 'rgba(15, 247, 150, 0)');

    currentChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Rata-rata',
            data: avgPrices,
            borderColor: '#0ff796',
            backgroundColor: gradient,
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#0ff796',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
          },
          {
            label: 'Tertinggi',
            data: highPrices,
            borderColor: 'rgba(74, 222, 128, 0.4)',
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0.4,
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Terendah',
            data: lowPrices,
            borderColor: 'rgba(248, 113, 113, 0.4)',
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0.4,
            pointRadius: 0,
            fill: false,
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
            borderColor: 'rgba(15, 247, 150, 0.2)',
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
              maxTicksLimit: 7
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
          },
        },
      },
    });
  } catch (err) {
    console.error('Price chart error:', err);
    chartLoading.innerHTML = '<span class="text-muted">⚠️ Gagal memuat grafik</span>';
  }
}

async function loadRecentPrices(itemId) {
  try {
    const now = new Date();
    // Use 24 hours ago instead of 30 days to heavily optimize API response speeds
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const data = await getAuctionItemPrices(itemId, {
      pageSize: 10,
      startTime: oneDayAgo.toISOString(),
      endTime: now.toISOString(),
    });
    const prices = data.auctionItemPrices || data.prices || data.items || [];

    // Update the current price in the modal header using the most recent listing
    const latestPrice = prices.length > 0 ? (prices[0].price || 0) : 0;
    lastKnownCurrentPrice = latestPrice;
    updatePriceTrend();

  } catch (err) {
    console.error('Recent prices error:', err);
    const curEl = document.getElementById('modal-current-price');
    if (curEl) curEl.innerHTML = '<span class="text-red">Gagal</span>';
  }
}


function formatPrice(value) {
  const num = Number(value);
  if (isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString('id-ID');
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
