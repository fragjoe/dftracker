/**
 * Informational Pages for DFtracker
 * Privacy Policy, Terms of Service, Support, and Version History
 */
import { getCurrentLanguage, t } from '../i18n.js';

function renderLegalSections(sections, updatedAt) {
  return `
    <div class="card">
      <div style="line-height: 1.8; color: var(--text-secondary); text-align: left;">
        ${sections.map((section, index) => `
          <h2 style="color: var(--text-primary); ${index === 0 ? 'margin-bottom' : 'margin-top'}: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">${section.title}</h2>
          <p style="margin-bottom: var(--space-md);">${section.body}</p>
        `).join('')}

        <div class="mt-lg" style="padding-top: var(--space-md); border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted); text-align: center;">
          ${updatedAt}
        </div>
      </div>
    </div>
  `;
}

export function renderPrivacyPage(container) {
  const language = getCurrentLanguage();
  const privacyContent = {
    id: {
      updatedAt: 'Terakhir diperbarui: 16 Maret 2026',
      sections: [
        {
          title: '1. Privasi Pengguna',
          body: 'DFtracker dirancang untuk membantu pemain melihat data akun, market, dan riwayat yang tersedia dengan cara yang lebih mudah dipahami. Kami berupaya menjaga pengalaman ini tetap aman dan sesederhana mungkin bagi pengguna.',
        },
        {
          title: '2. Data yang Disimpan di Perangkat',
          body: 'Riwayat pencarian player, preferensi bahasa, dan beberapa konteks tampilan disimpan secara lokal di browser Anda. Data ini dipakai agar pencarian terakhir, player aktif, dan preferensi antarmuka tetap tersambung saat Anda berpindah halaman.',
        },
        {
          title: '3. Data yang Ditampilkan',
          body: 'DFtracker menampilkan data statistik player, market, dan kekayaan berdasarkan data yang tersedia di sistem. Kami tidak meminta kata sandi akun game, token login, atau akses langsung ke akun Delta Force Anda.',
        },
        {
          title: '4. Penggunaan Preferensi Teknis',
          body: 'Beberapa preferensi teknis seperti bahasa, riwayat pencarian, dan state player aktif digunakan untuk meningkatkan kenyamanan penggunaan. Preferensi ini tidak dimaksudkan untuk pelacakan iklan atau profiling perilaku pengguna.',
        },
        {
          title: '5. Tanggung Jawab Pengguna',
          body: 'Karena sebagian preferensi disimpan langsung di browser, pengguna tetap bertanggung jawab atas keamanan perangkat yang digunakan. Jika memakai perangkat bersama atau publik, kami menyarankan untuk membersihkan data situs setelah selesai.',
        },
      ],
    },
    en: {
      updatedAt: 'Last updated: March 16, 2026',
      sections: [
        {
          title: '1. User Privacy',
          body: 'DFtracker is built to help players view account data, market information, and available history in a clearer way. We aim to keep that experience safe and as simple as possible for users.',
        },
        {
          title: '2. Data Stored on Your Device',
          body: 'Recent player searches, language preference, and some view context are stored locally in your browser. This allows the app to preserve your latest search, active player, and interface preference while you move across pages.',
        },
        {
          title: '3. Data Shown in the App',
          body: 'DFtracker shows player stats, market information, and wealth data based on what is currently available in the system. We do not ask for your game password, login token, or direct access to your Delta Force account.',
        },
        {
          title: '4. Technical Preferences',
          body: 'Certain technical preferences such as language, recent searches, and active player state are used only to improve usability. These preferences are not intended for ad tracking or behavioral profiling.',
        },
        {
          title: '5. User Responsibility',
          body: 'Because some preferences are stored directly in your browser, users remain responsible for the security of the device they use. If you are using a shared or public device, we recommend clearing site data after use.',
        },
      ],
    },
    zh: {
      updatedAt: '最后更新：2026年3月16日',
      sections: [
        {
          title: '1. 用户隐私',
          body: 'DFtracker 旨在帮助玩家以更清晰的方式查看账号数据、市场信息和可用历史记录。我们希望让这项体验尽可能安全、直接并易于使用。',
        },
        {
          title: '2. 存储在设备上的数据',
          body: '最近搜索的玩家、语言偏好以及部分界面上下文会保存在你的浏览器本地。这样可以在页面之间切换时保留最近搜索、当前活跃玩家和界面偏好。',
        },
        {
          title: '3. 应用中显示的数据',
          body: 'DFtracker 会根据系统当前可用的数据展示玩家统计、市场信息和财富数据。我们不会要求你的游戏密码、登录令牌，也不会直接访问你的 Delta Force 账号。',
        },
        {
          title: '4. 技术偏好的使用',
          body: '语言、最近搜索和活跃玩家状态等技术偏好仅用于提升使用体验。这些偏好并不用于广告追踪或用户行为画像。',
        },
        {
          title: '5. 用户责任',
          body: '由于部分偏好会直接保存在浏览器中，设备本身的安全仍由用户负责。如果你使用的是共享或公共设备，我们建议在结束后清除站点数据。',
        },
      ],
    },
  };
  const content = privacyContent[language] || privacyContent.en;

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="shield-check" style="width: 32px; height: 32px; color: var(--accent-primary);"></i>
        ${t('info.privacy.title')}
      </h1>
      <p class="page-subtitle">${t('info.privacy.subtitle')}</p>
    </div>
    ${renderLegalSections(content.sections, content.updatedAt)}
  `;
}

export function renderTermsPage(container) {
  const language = getCurrentLanguage();
  const termsContent = {
    id: {
      updatedAt: 'Terakhir diperbarui: 16 Maret 2026',
      sections: [
        {
          title: '1. Penggunaan Layanan',
          body: 'Dengan menggunakan DFtracker, Anda setuju memakai aplikasi ini untuk melihat data player, market, dan informasi pendukung lain yang tersedia. Layanan ini disediakan untuk membantu pemain membaca data dengan lebih nyaman.',
        },
        {
          title: '2. Ketersediaan Data',
          body: 'Beberapa data dapat berubah, terlambat muncul, atau belum tersedia sepenuhnya untuk player tertentu, season tertentu, atau riwayat tertentu. DFtracker menampilkan data sesuai kondisi yang tersedia saat itu dan tidak menjamin seluruh data selalu lengkap.',
        },
        {
          title: '3. Batasan Penggunaan',
          body: 'Pengguna tidak diperkenankan menyalahgunakan aplikasi untuk aktivitas yang mengganggu layanan, termasuk percobaan otomatisasi berlebihan, penyalahgunaan antarmuka, atau pola akses yang dapat merusak pengalaman pengguna lain.',
        },
        {
          title: '4. Hak & Kepemilikan',
          body: 'DFtracker adalah proyek komunitas independen. Nama game, aset visual, dan elemen yang terkait dengan Delta Force tetap merupakan milik pemegang hak masing-masing. Aplikasi ini tidak dimaksudkan untuk menggantikan layanan resmi.',
        },
        {
          title: '5. Perubahan Layanan',
          body: 'Fitur, tampilan, dan isi data di DFtracker dapat berubah dari waktu ke waktu. Kami dapat memperbarui, menyesuaikan, atau menghentikan bagian tertentu dari layanan bila diperlukan untuk menjaga kualitas penggunaan.',
        },
      ],
    },
    en: {
      updatedAt: 'Last updated: March 16, 2026',
      sections: [
        {
          title: '1. Service Use',
          body: 'By using DFtracker, you agree to use the app to view player data, market information, and related supporting details that are available. The service is provided to help players read that information more comfortably.',
        },
        {
          title: '2. Data Availability',
          body: 'Some data may change, appear late, or remain unavailable for certain players, seasons, or history ranges. DFtracker shows information based on what is currently available and does not guarantee that every dataset will always be complete.',
        },
        {
          title: '3. Usage Limits',
          body: 'Users may not misuse the app for activities that disrupt the service, including excessive automation attempts, interface abuse, or access patterns that could harm the experience for other users.',
        },
        {
          title: '4. Rights & Ownership',
          body: 'DFtracker is an independent community project. The game name, visual assets, and Delta Force related elements remain the property of their respective rights holders. This app is not intended to replace official services.',
        },
        {
          title: '5. Service Changes',
          body: 'Features, presentation, and available data in DFtracker may change over time. We may update, adjust, or discontinue parts of the service when needed to keep the experience usable and maintainable.',
        },
      ],
    },
    zh: {
      updatedAt: '最后更新：2026年3月16日',
      sections: [
        {
          title: '1. 服务使用',
          body: '使用 DFtracker 即表示你同意通过本应用查看当前可用的玩家数据、市场信息以及相关辅助内容。该服务旨在帮助玩家更方便地理解这些信息。',
        },
        {
          title: '2. 数据可用性',
          body: '部分数据可能会变化、延迟出现，或在某些玩家、赛季或历史范围内暂时不可用。DFtracker 会按照当时可用的数据进行展示，但不保证所有数据始终完整。',
        },
        {
          title: '3. 使用限制',
          body: '用户不得以会干扰服务的方式滥用本应用，包括过度自动化尝试、界面滥用或可能影响其他用户体验的访问行为。',
        },
        {
          title: '4. 权利与归属',
          body: 'DFtracker 是一个独立的社区项目。游戏名称、视觉素材以及与 Delta Force 相关的元素仍归各自权利方所有。本应用并不旨在替代官方服务。',
        },
        {
          title: '5. 服务变更',
          body: 'DFtracker 的功能、展示方式和可用数据可能会随着时间而变化。为了保持服务可用性与整体体验，我们可能会更新、调整或停止其中的部分内容。',
        },
      ],
    },
  };
  const content = termsContent[language] || termsContent.en;

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="scroll" style="width: 32px; height: 32px; color: var(--accent-primary);"></i>
        ${t('info.terms.title')}
      </h1>
      <p class="page-subtitle">${t('info.terms.subtitle')}</p>
    </div>
    ${renderLegalSections(content.sections, content.updatedAt)}
  `;
}

export function renderSupportPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="heart" style="width: 32px; height: 32px; color: var(--accent-red);"></i>
        ${t('info.support.title')}
      </h1>
      <p class="page-subtitle">${t('info.support.subtitle')}</p>
    </div>
    <div style="max-width: 600px; margin: 0 auto; text-align: center;">
      <div style="margin-bottom: var(--space-xl); padding: var(--space-lg); background: transparent;">
        <p style="color: var(--text-secondary); margin-bottom: var(--space-lg); line-height: 1.8;">
          ${t('info.support.intro')}
        </p>
        
        <div style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="padding: var(--space-md); background: rgba(255, 255, 255, 0.05); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-sm);">${t('info.support.localSupport')}</p>
            <a href="https://tiptap.gg/@fragjoe" target="_blank" rel="noopener noreferrer" style="font-family: var(--font-mono); color: var(--accent-primary); font-weight: 700; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px;">
              tiptap.gg/@fragjoe
              <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
            </a>
          </div>
          
          <div style="padding: var(--space-md); background: rgba(255, 255, 255, 0.05); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-sm);">${t('info.support.internationalSupport')}</p>
            <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
              <p id="paypal-email" style="font-family: var(--font-mono); color: var(--accent-primary); font-weight: 700; margin: 0;">scrawlxz@gmail.com</p>
              <button id="copy-paypal" class="btn btn-sm" style="padding: 4px; min-width: auto; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-secondary);" title="${t('info.support.copyTitle')}" aria-label="${t('info.support.copyTitle')}">
                <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Define the copyToClipboard function once
  window.copyToClipboard = function (text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = `<i data-lucide="check" style="width: 14px; height: 14px;"></i>`;
      btn.classList.add('active');
      if (window.lucide) window.lucide.createIcons();

      setTimeout(() => {
        btn.innerHTML = `<i data-lucide="copy" style="width: 14px; height: 14px;"></i>`;
        btn.classList.remove('active');
        if (window.lucide) window.lucide.createIcons();
      }, 2000);
    });
  };

  // Attach event listener for copying email
  const copyBtn = container.querySelector('#copy-paypal');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      window.copyToClipboard('scrawlxz@gmail.com', copyBtn);
    });
  }
}

// Re-run lucide to render the icon
if (window.lucide) {
  window.lucide.createIcons();
}

export function renderVersionPage(container) {
  const language = getCurrentLanguage();
  const versionContent = {
    id: [
      {
        tag: 'v1.3.0',
        date: '16 Maret 2026',
        changes: [
          'Player aktif sekarang tampil di header, lengkap dengan detail akun singkat, salin ID, dan tombol ganti player.',
          'Halaman Wealth dipisah dari Stats, tetapi tetap mengikuti player aktif terakhir yang kamu cari.',
          'Market item sekarang dibuka dalam modal di halaman yang sama, jadi lebih cepat pindah lihat detail tanpa keluar dari daftar item.',
          'Pencarian player dibuat lebih praktis: mendukung UUID, ID player, dan nickname dengan auto-search yang lebih aman.',
          'Pilihan bahasa ditambahkan untuk EN, ID, dan ZH dengan label antarmuka yang lebih konsisten.'
        ]
      },
      {
        tag: 'v1.2.0',
        date: '15 Maret 2026',
        changes: [
          'Header dan navigasi diperbarui agar kontrol utama terasa lebih ringkas dan seragam.',
          'Tampilan market dirapikan agar grafik harga dan status murah/mahal lebih mudah dibaca.',
          'Halaman stats menampilkan fallback ke All Time secara otomatis jika season aktif belum punya data.',
          'Riwayat pencarian player dan pemuatan data dibuat lebih stabil saat data belum siap sepenuhnya.'
        ]
      },
      {
        tag: 'v1.1.0',
        date: '14 Maret 2026',
        changes: [
          'Riwayat kekayaan dan ringkasan stash mulai ditampilkan sebagai bagian dari profil player.',
          'Recent Searches ditambahkan untuk memudahkan membuka ulang player yang baru dicari.',
          'Navigasi aplikasi disederhanakan agar perpindahan antar halaman terasa lebih cepat.'
        ]
      },
      {
        tag: 'v1.0.0',
        date: '10 Maret 2026',
        changes: [
          'Player stats, market item, dan grafik harga historis tersedia dalam satu aplikasi.',
          'Halaman informasi dasar seperti privacy, terms, support, dan version history ditambahkan.',
          'DFtracker pertama kali dirilis dengan halaman Stats dan Market.'
        ]
      }
    ],
    en: [
      {
        tag: 'v1.3.0',
        date: 'March 16, 2026',
        changes: [
          'The active player now appears in the header with quick account details, ID copy, and a player switch action.',
          'The Wealth page is now separate from Stats while still following the last active player you searched.',
          'Market items now open in an in-page modal, so checking details feels faster without leaving the list.',
          'Player search is easier to use with support for UUID, player ID, and nickname plus safer auto-search.',
          'Language options are now available for EN, ID, and ZH with more consistent interface labels.'
        ]
      },
      {
        tag: 'v1.2.0',
        date: 'March 15, 2026',
        changes: [
          'The header and navigation were updated to feel cleaner and more consistent.',
          'The market view was refined so price charts and cheap/expensive status are easier to read.',
          'The Stats page now falls back to All Time automatically when the active season has no data.',
          'Player loading and retry behavior is more stable when data is not fully ready yet.'
        ]
      },
      {
        tag: 'v1.1.0',
        date: 'March 14, 2026',
        changes: [
          'Wealth history and stash summary began appearing as part of the player experience.',
          'Recent Searches was added to make it easier to reopen recently searched players.',
          'Navigation was simplified to make moving between pages feel faster.'
        ]
      },
      {
        tag: 'v1.0.0',
        date: 'March 10, 2026',
        changes: [
          'Player stats, market items, and historical price charts became available in one app.',
          'Core informational pages such as privacy, terms, support, and version history were included.',
          'DFtracker launched with dedicated Stats and Market pages.'
        ]
      }
    ],
    zh: [
      {
        tag: 'v1.3.0',
        date: '2026年3月16日',
        changes: [
          '当前玩家现在会显示在页眉中，并提供账号摘要、ID 复制和切换玩家操作。',
          '财富页面已从 Stats 中独立出来，但仍会跟随你最后一次搜索的玩家。',
          '市场物品详情现在通过页内弹窗打开，无需离开列表也能更快查看内容。',
          '玩家搜索现在支持 UUID、玩家 ID 和昵称，并加入了更稳妥的自动搜索。',
          '现已支持 EN、ID 和 ZH 三种语言，界面标签也更加统一。'
        ]
      },
      {
        tag: 'v1.2.0',
        date: '2026年3月15日',
        changes: [
          '页眉与导航已更新，整体观感更简洁一致。',
          '市场页面已优化，价格图表和便宜/偏高状态更容易理解。',
          '当当前赛季没有数据时，Stats 页面会自动切换到全部时间。',
          '当数据尚未完全准备好时，玩家加载与重试流程更加稳定。'
        ]
      },
      {
        tag: 'v1.1.0',
        date: '2026年3月14日',
        changes: [
          '财富历史和仓库摘要开始成为玩家页面的一部分。',
          '新增最近搜索，方便重新打开刚刚查询过的玩家。',
          '导航结构被简化，页面切换更顺手。'
        ]
      },
      {
        tag: 'v1.0.0',
        date: '2026年3月10日',
        changes: [
          '玩家数据、市场物品和历史价格图表在同一应用中可用。',
          '隐私、条款、支持和版本历史等基础信息页面同步上线。',
          'DFtracker 首次发布，带来 Stats 与 Market 两个核心页面。'
        ]
      }
    ],
  };
  const versions = versionContent[language] || versionContent.en;

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="history" style="width: 32px; height: 32px; color: var(--accent-primary);"></i>
        ${t('info.version.title')}
      </h1>
      <p class="page-subtitle">${t('info.version.subtitle')}</p>
    </div>
    <div class="list-compact" style="max-width: 700px; margin: 0 auto;">
      ${versions.map(v => `
        <div class="card" style="margin-bottom: var(--space-md); text-align: left;">
          <div class="flex-between" style="margin-bottom: var(--space-md);">
            <div class="card-badge badge-green">${v.tag}</div>
            <div class="text-muted" style="font-size: 0.85rem;">${v.date}</div>
          </div>
          <ul style="color: var(--text-secondary); padding-left: var(--space-lg); line-height: 1.8;">
            ${v.changes.map(change => `<li>${change}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;
}
