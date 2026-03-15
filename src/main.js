/**
 * DFtracker — Main Entry Point
 * History API-based SPA router with page transitions
 */
import './styles/index.css';
import { renderMarketPage } from './pages/market.js';
import { renderPlayerPage } from './pages/player.js';
import { renderMapsPage } from './pages/maps.js';
import {
  renderPrivacyPage,
  renderTermsPage,
  renderSupportPage,
  renderVersionPage
} from './pages/info.js';

const routes = [
  {
    path: '/market',
    render: renderMarketPage,
    label: 'Market Tracker',
    metaTitle: 'Market Tracker — Pantau Harga Item Delta Force',
    metaDescription: 'Cari dan analisis riwayat harga item Delta Force secara real-time di market.'
  },
  {
    path: '/market/item/:id',
    render: (container, params) => import('./pages/market.js').then(m => m.renderMarketItemPage(container, params.id)),
    label: 'Market Tracker',
    metaTitle: 'Detail Item — Harga & Tren Market Delta Force',
    metaDescription: 'Analisis grafik harga historis dan tren pasar untuk item spesifik di Delta Force.'
  },
  {
    path: '/player',
    render: renderPlayerPage,
    label: 'Player Stats',
    metaTitle: 'Player Stats — Analisis Statistik Pemain Delta Force',
    metaDescription: 'Masukkan Delta Force ID untuk melihat statistik pertempuran, K/D, dan riwayat kekayaan pemain.'
  },
  {
    path: '/maps',
    render: renderMapsPage,
    label: 'Maps & Seasons',
    metaTitle: 'Maps & Seasons — Info Peta Delta Force',
    metaDescription: 'Daftar peta lengkap dan informasi season aktif Delta Force saat ini.'
  },
  {
    path: '/privacy',
    render: renderPrivacyPage,
    label: 'Privacy Policy',
    metaTitle: 'Privacy Policy — DFtracker',
    metaDescription: 'Kebijakan privasi dan perlindungan data pengguna di DFtracker.'
  },
  {
    path: '/terms',
    render: renderTermsPage,
    label: 'Terms of Service',
    metaTitle: 'Terms of Service — DFtracker',
    metaDescription: 'Syarat dan ketentuan penggunaan layanan DFtracker.'
  },
  {
    path: '/support',
    render: renderSupportPage,
    label: 'Support',
    metaTitle: 'Support Project — Dukung Pengembangan DFtracker',
    metaDescription: 'Dukung pengembangan DFtracker melalui donasi lokal (TipTap) atau internasional (PayPal).'
  },
  {
    path: '/version',
    render: renderVersionPage,
    label: 'Version History',
    metaTitle: 'Version History — Update DFtracker',
    metaDescription: 'Riwayat pembaruan dan fitur terbaru yang ditambahkan ke DFtracker.'
  },
];

/**
 * Main router function
 */
function router() {
  const path = window.location.pathname === '/' ? '/player' : window.location.pathname;
  const container = document.getElementById('page-container');

  let matchFound = false;

  for (const route of routes) {
    const routeParts = route.path.split('/');
    const pathParts = path.split('/');

    if (routeParts.length !== pathParts.length) continue;

    const params = {};
    const match = routeParts.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.substring(1)] = pathParts[i];
        return true;
      }
      return part === pathParts[i];
    });

    if (match) {
      renderPage(route, params, path);
      matchFound = true;
      break;
    }
  }

  if (!matchFound) {
    navigateTo('/player');
  }
}

/**
 * Navigate to a new path using History API
 */
export function navigateTo(path) {
  window.history.pushState({}, '', path);
  router();
}

/**
 * Update SEO metadata
 */
window.updateMetadata = function (routeDetails) {
  const baseTitle = 'DFtracker';
  const metaTitle = routeDetails.title || '';
  const metaDescription = routeDetails.description || '';

  document.title = metaTitle ? `${metaTitle} | ${baseTitle}` : baseTitle;

  const metaDesc = document.getElementById('meta-description');
  if (metaDesc && metaDescription) {
    metaDesc.setAttribute('content', metaDescription);
  }

  // Update OG/Twitter tags
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', document.title);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', metaDescription);

  const twTitle = document.querySelector('meta[property="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', document.title);

  const twDesc = document.querySelector('meta[property="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', metaDescription);

  // Update Canonical URL
  const canonicalLink = document.getElementById('canonical-link');
  if (canonicalLink) {
    canonicalLink.setAttribute('href', `https://dftracker.vercel.app${window.location.pathname}`);
  }
}

/**
 * Render page content with transition
 */
function renderPage(route, params, path) {
  const container = document.getElementById('page-container');

  // Update SEO with defaults from route
  window.updateMetadata({
    title: route.metaTitle,
    description: route.metaDescription
  });

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    const page = item.dataset.page;
    item.classList.toggle('active', path.startsWith(`/${page}`));
  });

  // Animate transition
  container.style.animation = 'none';
  container.offsetHeight; // force reflow
  container.style.animation = 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

  // Clear and render
  container.innerHTML = '';
  route.render(container, params);

  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Global click interceptor for Clean URLs
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link && link.href && link.href.startsWith(window.location.origin) && !link.target && !link.hasAttribute('download')) {
    e.preventDefault();
    const path = link.getAttribute('href');
    if (path !== window.location.pathname) {
      navigateTo(path);
    }
  }
});

// Popstate listener for back/forward buttons
window.addEventListener('popstate', router);

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('modal-overlay')?.classList.add('hidden');
  }
});

// Initial render
window.addEventListener('DOMContentLoaded', router);
