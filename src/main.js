/**
 * DFtracker — Main Entry Point
 * History API-based SPA router with page transitions
 */
import './styles/index.css';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Calendar,
  ChartNoAxesCombined,
  Check,
  Coins,
  Copy,
  Crosshair,
  ExternalLink,
  Flame,
  Gamepad2,
  Ghost,
  Heart,
  HeartPulse,
  History,
  Home,
  Info,
  LineChart,
  Loader,
  Minus,
  Package,
  PackageSearch,
  PersonStanding,
  RefreshCw,
  Scroll,
  Search,
  ShieldCheck,
  Skull,
  Store,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserSearch,
  Wallet,
  WalletCards,
  X,
  createIcons,
} from 'lucide';
import { listSeasons } from './api/client.js';
import { clearActivePlayerContext, getActivePlayerProfileSummary, renderPlayerPage, renderWealthPage } from './pages/player.js';
import { getCurrentLanguage, getLanguageOptions, initializeLanguage, setCurrentLanguage, t, tForLanguage } from './i18n.js';
import { escapeHTML, isAppErrorKind } from './utils/security.js';

const STORAGE_NOTICE_KEY = 'storage_notice_acknowledged';
let activeRenderRequestId = 0;
let appMaintenanceActive = false;
let maintenanceAnimationInterval = null;
let maintenanceTypingTimeout = null;
const MAINTENANCE_CYCLE_MS = 3600;
const MAINTENANCE_TYPING_STEP_MS = 55;
const MAINTENANCE_HOLD_MS = 700;

const APP_ICONS = {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Calendar,
  ChartNoAxesCombined,
  Check,
  Coins,
  Copy,
  Crosshair,
  ExternalLink,
  Flame,
  Gamepad2,
  Ghost,
  Heart,
  HeartPulse,
  History,
  Home,
  Info,
  LineChart,
  Loader,
  Minus,
  Package,
  PackageSearch,
  PersonStanding,
  RefreshCw,
  Scroll,
  Search,
  ShieldCheck,
  Skull,
  Store,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserSearch,
  Wallet,
  WalletCards,
  X,
};

function createAppIcons() {
  createIcons({ icons: APP_ICONS });
}

if (!window.lucide) {
  window.lucide = {
    createIcons: createAppIcons,
  };
} else if (!window.lucide.createIcons) {
  window.lucide.createIcons = createAppIcons;
}

const routes = [
  {
    path: '/market',
    render: async (container) => {
      const { renderMarketPage } = await import('./pages/market.js');
      return renderMarketPage(container);
    },
    label: 'Market Tracker',
    metaTitleKey: 'routes.market.title',
    metaDescriptionKey: 'routes.market.description',
  },
  {
    path: '/market/item/:id',
    render: async (container, params) => {
      const { renderMarketItemPage } = await import('./pages/market.js');
      return renderMarketItemPage(container, params.id);
    },
    label: 'Market Tracker',
    metaTitleKey: 'routes.marketItem.title',
    metaDescriptionKey: 'routes.marketItem.description',
  },
  {
    path: '/player',
    render: renderPlayerPage,
    label: 'Player Stats',
    metaTitleKey: 'routes.player.title',
    metaDescriptionKey: 'routes.player.description',
  },
  {
    path: '/wealth',
    render: renderWealthPage,
    label: 'Player Wealth',
    metaTitleKey: 'routes.wealth.title',
    metaDescriptionKey: 'routes.wealth.description',
  },
  {
    path: '/leaderboard',
    render: async (container) => {
      const { renderLeaderboardPage } = await import('./pages/leaderboard.js');
      return renderLeaderboardPage(container);
    },
    label: 'Leaderboard',
    metaTitleKey: 'routes.leaderboard.title',
    metaDescriptionKey: 'routes.leaderboard.description',
  },
  {
    path: '/privacy',
    render: async (container) => {
      const { renderPrivacyPage } = await import('./pages/info.js');
      return renderPrivacyPage(container);
    },
    label: 'Kebijakan Privasi',
    metaTitleKey: 'routes.privacy.title',
    metaDescriptionKey: 'routes.privacy.description',
  },
  {
    path: '/terms',
    render: async (container) => {
      const { renderTermsPage } = await import('./pages/info.js');
      return renderTermsPage(container);
    },
    label: 'Ketentuan Layanan',
    metaTitleKey: 'routes.terms.title',
    metaDescriptionKey: 'routes.terms.description',
  },
  {
    path: '/support',
    render: async (container) => {
      const { renderSupportPage } = await import('./pages/info.js');
      return renderSupportPage(container);
    },
    label: 'Dukung Proyek',
    metaTitleKey: 'routes.support.title',
    metaDescriptionKey: 'routes.support.description',
  },
  {
    path: '/version',
    render: async (container) => {
      const { renderVersionPage } = await import('./pages/info.js');
      return renderVersionPage(container);
    },
    label: 'Riwayat Versi',
    metaTitleKey: 'routes.version.title',
    metaDescriptionKey: 'routes.version.description',
  },
];

function renderMaintenancePage() {
  const container = document.getElementById('page-container');
  if (!container) return;

  if (maintenanceAnimationInterval) {
    window.clearInterval(maintenanceAnimationInterval);
    maintenanceAnimationInterval = null;
  }
  if (maintenanceTypingTimeout) {
    window.clearTimeout(maintenanceTypingTimeout);
    maintenanceTypingTimeout = null;
  }

  const languageOrder = getLanguageOptions().map(({ value }) => value);
  const activeLanguage = getCurrentLanguage();
  const orderedLanguages = [
    activeLanguage,
    ...languageOrder.filter((value) => value !== activeLanguage),
  ];
  const titlePhrases = orderedLanguages.map((language) => tForLanguage(language, 'app.maintenance.shortTitle'));
  const messagePhrases = orderedLanguages.map((language) => tForLanguage(language, 'app.maintenance.shortMessage'));

  window.updateMetadata({
    title: t('app.maintenance.title'),
    description: t('app.maintenance.message'),
  });

  container.innerHTML = `
    <section class="maintenance-shell" aria-live="polite">
      <div class="maintenance-card">
        <h1 class="maintenance-title">
          <span id="maintenance-title-text" class="maintenance-title-text"></span>
          <span class="maintenance-caret" aria-hidden="true"></span>
        </h1>
        <div class="maintenance-message-shell">
          <p id="maintenance-message-text" class="maintenance-message" data-roll-state="enter"></p>
        </div>
      </div>
    </section>
  `;

  const titleEl = document.getElementById('maintenance-title-text');
  const messageEl = document.getElementById('maintenance-message-text');
  if (!titleEl || !messageEl) return;

  const typeAndDeleteTitle = (text) => {
    if (maintenanceTypingTimeout) {
      window.clearTimeout(maintenanceTypingTimeout);
      maintenanceTypingTimeout = null;
    }

    const maxChars = Math.max(text.length, 1);
    const totalTypingBudget = Math.max(MAINTENANCE_CYCLE_MS - (MAINTENANCE_HOLD_MS * 2), MAINTENANCE_TYPING_STEP_MS * 2);
    const stepMs = Math.max(28, Math.floor(totalTypingBudget / (maxChars * 2)));
    let phase = 'typing';
    let index = 0;

    const tick = () => {
      if (!titleEl.isConnected || !appMaintenanceActive) return;

      if (phase === 'typing') {
        index += 1;
        titleEl.textContent = text.slice(0, index);
        if (index >= text.length) {
          phase = 'hold_full';
          maintenanceTypingTimeout = window.setTimeout(tick, MAINTENANCE_HOLD_MS);
          return;
        }
        maintenanceTypingTimeout = window.setTimeout(tick, stepMs);
        return;
      }

      if (phase === 'hold_full') {
        phase = 'deleting';
        maintenanceTypingTimeout = window.setTimeout(tick, stepMs);
        return;
      }

      if (phase === 'deleting') {
        index -= 1;
        titleEl.textContent = text.slice(0, Math.max(0, index));
        if (index <= 0) {
          phase = 'hold_empty';
          maintenanceTypingTimeout = window.setTimeout(tick, MAINTENANCE_HOLD_MS);
          return;
        }
        maintenanceTypingTimeout = window.setTimeout(tick, stepMs);
      }
    };

    titleEl.textContent = '';
    tick();
  };

  const updateMessage = (text) => {
    messageEl.setAttribute('data-roll-state', 'exit');
    window.setTimeout(() => {
      if (!messageEl.isConnected || !appMaintenanceActive) return;
      messageEl.textContent = text;
      messageEl.setAttribute('data-roll-state', 'enter');
    }, 220);
  };

  let phraseIndex = 0;
  typeAndDeleteTitle(titlePhrases[phraseIndex]);
  messageEl.textContent = messagePhrases[phraseIndex];
  messageEl.setAttribute('data-roll-state', 'enter');

  maintenanceAnimationInterval = window.setInterval(() => {
    if (!appMaintenanceActive) return;
    phraseIndex = (phraseIndex + 1) % titlePhrases.length;
    typeAndDeleteTitle(titlePhrases[phraseIndex]);
    updateMessage(messagePhrases[phraseIndex]);
  }, MAINTENANCE_CYCLE_MS);
}

function updateAppShellForMaintenance() {
  const app = document.getElementById('app');
  const header = document.getElementById('header');
  const footer = document.querySelector('.footer');
  if (app) {
    app.classList.toggle('app--maintenance', appMaintenanceActive);
  }
  if (header) {
    header.classList.toggle('hidden', appMaintenanceActive);
  }
  if (footer) {
    footer.classList.toggle('hidden', appMaintenanceActive);
  }
}

function activateGlobalMaintenanceMode() {
  appMaintenanceActive = true;
  updateAppShellForMaintenance();
  updateStorageNoticeVisibility();
  renderMaintenancePage();
}

async function verifyGlobalMaintenanceStatus() {
  try {
    await listSeasons({ pageSize: 1 });
    return false;
  } catch (error) {
    if (isAppErrorKind(error, 'maintenance')) {
      activateGlobalMaintenanceMode();
      return true;
    }
    return false;
  }
}

/**
 * Main router function
 */
function router() {
  if (appMaintenanceActive) {
    updateAppShellForMaintenance();
    renderMaintenancePage();
    return;
  }

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

function updateStaticLanguageUI() {
  document.getElementById('nav-player-label').innerText = t('nav.player');
  document.getElementById('nav-wealth-label').innerText = t('nav.wealth');
  document.getElementById('nav-leaderboard-label').innerText = t('nav.leaderboard');
  document.getElementById('nav-market-label').innerText = t('nav.market');
  document.getElementById('footer-privacy-link').innerText = t('footer.privacy');
  document.getElementById('footer-terms-link').innerText = t('footer.terms');
  document.getElementById('footer-support-link').innerText = t('footer.support');
  const storageNoticeText = document.getElementById('storage-notice-text');
  const storageNoticeLink = document.getElementById('storage-notice-link');
  const storageNoticeDismiss = document.getElementById('storage-notice-dismiss');

  if (storageNoticeText) storageNoticeText.innerText = t('app.storageNotice');
  if (storageNoticeLink) storageNoticeLink.innerText = t('app.storageLearnMore');
  if (storageNoticeDismiss) storageNoticeDismiss.innerText = t('app.storageDismiss');

  const currentLanguage = getCurrentLanguage();
  const languageTrigger = document.getElementById('language-trigger');
  const languageTriggerText = document.getElementById('language-trigger-text');
  const languageTriggerFlag = document.getElementById('language-trigger-flag');
  const languageMenu = document.getElementById('language-menu');

  if (languageTrigger && languageTriggerText && languageTriggerFlag && languageMenu) {
    const options = getLanguageOptions();
    const activeOption = options.find(({ value }) => value === currentLanguage) || options[0];

    languageTrigger.dataset.currentLang = currentLanguage;
    languageTriggerText.innerText = activeOption.label;
    languageTriggerFlag.className = `lang-flag flag-${activeOption.flag}`;

    languageMenu.innerHTML = options.map(({ value, label, shortLabel, flag }) => `
      <button
        type="button"
        class="language-option${value === currentLanguage ? ' active' : ''}"
        data-language-option="${value}"
        role="menuitem"
      >
        <span class="lang-flag flag-${flag}" aria-hidden="true"></span>
        <span class="language-option-short">${shortLabel}</span>
      </button>
    `).join('');
  }

  renderActivePlayerHeader();
}

function updateStorageNoticeVisibility() {
  const storageNotice = document.getElementById('storage-notice');
  if (!storageNotice) return;

  if (appMaintenanceActive) {
    storageNotice.classList.add('hidden');
    return;
  }

  const isDismissed = localStorage.getItem(STORAGE_NOTICE_KEY) === 'true';
  storageNotice.classList.toggle('hidden', isDismissed);

  if (!isDismissed && window.lucide) {
    window.lucide.createIcons();
  }
}

function renderActivePlayerHeader() {
  const headerActivePlayer = document.getElementById('header-active-player');
  if (!headerActivePlayer) return;

  const player = getActivePlayerProfileSummary();
  if (!player) {
    headerActivePlayer.classList.add('hidden');
    headerActivePlayer.innerHTML = '';
    return;
  }

  const playerName = escapeHTML(player.name || player.deltaForceId || 'Unknown');
  const playerId = escapeHTML(player.deltaForceId || '');
  const playerLevel = escapeHTML(String(player.levelOperations || '?'));
  const playerUuid = escapeHTML(player.id || '');
  const createdAt = player.registeredAt ? formatHeaderPlayerDate(player.registeredAt) : '';

  headerActivePlayer.classList.remove('hidden');
  headerActivePlayer.innerHTML = `
    <div class="player-dropdown" id="player-dropdown">
      <button
        type="button"
        class="player-trigger"
        id="player-trigger"
        aria-haspopup="true"
        aria-expanded="false"
      >
        <div class="player-trigger-meta">
          <span class="player-trigger-name">${playerName}</span>
        </div>
        <span class="player-trigger-level">Lv.${playerLevel}</span>
        <span class="player-trigger-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
          </svg>
        </span>
      </button>
      <div class="player-menu hidden" id="player-menu" role="menu" aria-labelledby="player-trigger">
        <div class="player-menu-section">
          <div class="player-menu-label">${t('player.uuidLabel')}</div>
          <div class="player-menu-inline">
            <div class="player-menu-value text-mono">${playerId || playerUuid}</div>
            <button
              type="button"
              class="player-menu-action player-menu-action-icon"
              id="player-copy-uuid"
              data-player-uuid="${playerId || playerUuid}"
              aria-label="${escapeHTML(t('player.copyUuid'))}"
              title="${escapeHTML(t('player.copyUuid'))}"
            >
              <i data-lucide="copy" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        ${createdAt ? `
          <div class="player-menu-section">
            <div class="player-menu-label">${t('player.accountCreated')}</div>
            <div class="player-menu-value">${escapeHTML(createdAt)}</div>
          </div>
        ` : ''}
        <div class="player-menu-actions">
          <button type="button" class="player-menu-action player-menu-action-danger" id="header-player-clear">
            ${t('player.close')}
          </button>
        </div>
      </div>
    </div>
  `;
}

function getHeaderLocale() {
  const language = getCurrentLanguage();
  if (language === 'id') return 'id-ID';
  if (language === 'zh') return 'zh-CN';
  return 'en-US';
}

function formatHeaderPlayerDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString(getHeaderLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function togglePlayerMenu(forceOpen) {
  const playerDropdown = document.getElementById('player-dropdown');
  const playerTrigger = document.getElementById('player-trigger');
  const playerMenu = document.getElementById('player-menu');
  if (!playerDropdown || !playerTrigger || !playerMenu) return;

  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : playerMenu.classList.contains('hidden');

  playerDropdown.classList.toggle('open', shouldOpen);
  playerMenu.classList.toggle('hidden', !shouldOpen);
  playerTrigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function toggleLanguageMenu(forceOpen) {
  const languageDropdown = document.getElementById('language-dropdown');
  const languageTrigger = document.getElementById('language-trigger');
  const languageMenu = document.getElementById('language-menu');
  if (!languageDropdown || !languageTrigger || !languageMenu) return;

  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : languageMenu.classList.contains('hidden');

  languageDropdown.classList.toggle('open', shouldOpen);
  languageMenu.classList.toggle('hidden', !shouldOpen);
  languageTrigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
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
async function renderPage(route, params, path) {
  const container = document.getElementById('page-container');
  const requestId = ++activeRenderRequestId;

  // Update SEO with defaults from route
  window.updateMetadata({
    title: t(route.metaTitleKey),
    description: t(route.metaDescriptionKey)
  });

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    const page = item.dataset.page;
    const isActive = path.startsWith(`/${page}`);
    item.classList.toggle('active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  // Animate transition
  container.style.animation = 'none';
  container.offsetHeight; // force reflow
  container.style.animation = 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

  // Clear and render
  container.innerHTML = '';
  await route.render(container, params);
  if (requestId !== activeRenderRequestId) return;

  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function closeMarketItemOverlay() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  const { closeMarketItemOverlay: closeOverlay } = await import('./pages/market.js');
  closeOverlay();
}

// Global click interceptor for Clean URLs
document.addEventListener('click', (e) => {
  if (appMaintenanceActive) {
    const link = e.target.closest('a');
    if (link && link.href && link.href.startsWith(window.location.origin) && !link.target && !link.hasAttribute('download')) {
      e.preventDefault();
      router();
      return;
    }
  }

  const languageDropdown = document.getElementById('language-dropdown');
  const playerDropdown = document.getElementById('player-dropdown');
  const languageOption = e.target.closest('[data-language-option]');
  if (languageOption) {
    e.preventDefault();
    const nextLanguage = languageOption.dataset.languageOption;
    if (nextLanguage && nextLanguage !== getCurrentLanguage()) {
      setCurrentLanguage(nextLanguage);
    }
    toggleLanguageMenu(false);
    return;
  }

  const languageTrigger = e.target.closest('#language-trigger');
  if (languageTrigger) {
    e.preventDefault();
    togglePlayerMenu(false);
    toggleLanguageMenu();
    return;
  }

  if (languageDropdown && !languageDropdown.contains(e.target)) {
    toggleLanguageMenu(false);
  }

  const playerTrigger = e.target.closest('#player-trigger');
  if (playerTrigger) {
    e.preventDefault();
    toggleLanguageMenu(false);
    togglePlayerMenu();
    return;
  }

  if (playerDropdown && !playerDropdown.contains(e.target)) {
    togglePlayerMenu(false);
  }

  const copyUuidButton = e.target.closest('#player-copy-uuid');
  if (copyUuidButton) {
    e.preventDefault();
    const playerUuid = copyUuidButton.dataset.playerUuid || '';
    if (playerUuid) {
      navigator.clipboard?.writeText(playerUuid).catch(() => {});
      copyUuidButton.dataset.copied = 'true';
      copyUuidButton.innerHTML = '<i data-lucide="check" aria-hidden="true"></i>';
      if (window.lucide) {
        window.lucide.createIcons();
      }
      window.setTimeout(() => {
        if (copyUuidButton.isConnected) {
          copyUuidButton.dataset.copied = 'false';
          copyUuidButton.innerHTML = '<i data-lucide="copy" aria-hidden="true"></i>';
          if (window.lucide) {
            window.lucide.createIcons();
          }
        }
      }, 1600);
    }
    return;
  }

  const clearActivePlayerButton = e.target.closest('#header-player-clear');
  if (clearActivePlayerButton) {
    e.preventDefault();
    clearActivePlayerContext();
    toggleLanguageMenu(false);
    togglePlayerMenu(false);
    closeMarketItemOverlay();
    if (window.location.pathname !== '/player') {
      navigateTo('/player');
    } else {
      router();
    }
    return;
  }

  const dismissStorageNoticeButton = e.target.closest('#storage-notice-dismiss');
  if (dismissStorageNoticeButton) {
    e.preventDefault();
    localStorage.setItem(STORAGE_NOTICE_KEY, 'true');
    updateStorageNoticeVisibility();
    return;
  }

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
    toggleLanguageMenu(false);
    togglePlayerMenu(false);
    closeMarketItemOverlay();
  }
});

// Initial render
window.addEventListener('DOMContentLoaded', () => {
  initializeLanguage();
  updateStaticLanguageUI();
  updateStorageNoticeVisibility();
  updateAppShellForMaintenance();

  window.addEventListener('app:language-change', () => {
    toggleLanguageMenu(false);
    closeMarketItemOverlay();
    updateStaticLanguageUI();
    updateStorageNoticeVisibility();
    router();
  });

  window.addEventListener('app:maintenance-detected', () => {
    activateGlobalMaintenanceMode();
  });

  window.addEventListener('app:active-player-change', () => {
    renderActivePlayerHeader();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  verifyGlobalMaintenanceStatus().then((isMaintenance) => {
    if (!isMaintenance) {
      router();
    }
  });
});
