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
      updatedAt: 'Terakhir diperbarui: 4 April 2026',
      sections: [
        {
          title: '1. Ringkasan Privasi',
          body: 'DFtracker adalah alat komunitas untuk membantu melihat statistik player, leaderboard internal, market, dan ringkasan stash Delta Force dengan tampilan yang lebih mudah dibaca. Kami tidak meminta kata sandi game, token login, atau akses langsung ke akun Delta Force Anda.',
        },
        {
          title: '2. Data yang Kami Simpan',
          body: 'Saat Anda memakai DFtracker, sistem dapat menyimpan profil player yang pernah dicari, data statistik, data stash, riwayat kekayaan, dan data market agar pemuatan berikutnya lebih cepat. Data ini disimpan sebagai data aplikasi, bukan sebagai akses ke akun pribadi Anda.',
        },
        {
          title: '3. Data yang Tetap Tersimpan di Browser',
          body: 'Riwayat Pencarian tetap disimpan di browser Anda agar daftar pencarian terakhir terasa cepat dan personal untuk perangkat itu. Beberapa preferensi ringan seperti bahasa atau player terakhir tersimpan agar tetap konsisten saat halaman dimuat ulang.',
        },
        {
          title: '4. Cookie dan Identifier Teknis',
          body: 'DFtracker dapat memakai cookie sederhana untuk mengaitkan preferensi antarmuka dengan browser Anda. Cookie ini dipakai untuk fungsi aplikasi seperti bahasa, player aktif, atau preferensi tampilan, dan tidak digunakan untuk iklan perilaku.',
        },
        {
          title: '5. Sumber Data Pihak Ketiga',
          body: 'Sebagian data yang ditampilkan berasal dari layanan pihak ketiga yang menyediakan data Delta Force. Akurasi, kelengkapan, keterlambatan update, atau ketersediaan data tertentu bergantung pada sumber tersebut dan dapat berubah sewaktu-waktu.',
        },
        {
          title: '6. Batasan Pelacakan',
          body: 'Kami tidak menjual data pencarian Anda, tidak membangun profil iklan personal, dan tidak memakai data aplikasi untuk pelacakan lintas situs. Data yang disimpan terutama dipakai untuk stabilitas dan kenyamanan penggunaan.',
        },
        {
          title: '7. Penghapusan dan Tanggung Jawab Pengguna',
          body: 'Karena sebagian data tetap tersimpan di browser, Anda dapat menghapus Riwayat Pencarian atau data situs dari browser kapan saja. Jika memakai perangkat bersama, kami menyarankan membersihkan data situs setelah selesai memakai aplikasi.',
        },
      ],
    },
    en: {
      updatedAt: 'Last updated: April 4, 2026',
      sections: [
        {
          title: '1. Privacy Summary',
          body: 'DFtracker is a community tool built to make Delta Force player stats, internal leaderboard data, market information, and stash summaries easier to read. We do not ask for your game password, login token, or direct access to your Delta Force account.',
        },
        {
          title: '2. Data We Store',
          body: 'When you use DFtracker, the app may store searched player profiles, stat data, stash data, wealth history, and market data so future loads are faster and more stable. This is application data, not private account access.',
        },
        {
          title: '3. Data Kept in Your Browser',
          body: 'Recent Searches remains stored in your browser so your most recent lookups stay fast and local to your device. Some lightweight preferences such as language or last active player are saved through app storage for a more consistent experience.',
        },
        {
          title: '4. Cookies',
          body: 'DFtracker may use simple cookies to associate interface preferences with your browser. This is used for app functionality such as language, active player state, or display preferences, not for behavioral advertising.',
        },
        {
          title: '5. Third-Party Data Sources',
          body: 'Some information shown in DFtracker comes from third-party services that expose Delta Force related data. Accuracy, completeness, timeliness, and availability of specific records depend on those sources and may change at any time.',
        },
        {
          title: '6. Tracking Limits',
          body: 'We do not sell your search activity, build advertising profiles from your usage, or use DFtracker data for cross-site ad tracking. Stored data is primarily used for stability and usability.',
        },
        {
          title: '7. Deletion and User Responsibility',
          body: 'Because some data remains in your browser, you can clear Recent Searches or site data from your browser at any time. If you use a shared or public device, we recommend clearing site data after you are done.',
        },
      ],
    },
    zh: {
      updatedAt: '最后更新：2026年4月4日',
      sections: [
        {
          title: '1. 隐私概览',
          body: 'DFtracker 是一个社区工具，用于更清晰地展示 Delta Force 玩家统计、内部排行榜、市场信息和仓库摘要。我们不会索取你的游戏密码、登录令牌，也不会直接访问你的 Delta Force 账号。',
        },
        {
          title: '2. 我们存储的数据',
          body: '当你使用 DFtracker 时，系统可能会保存已查询玩家的资料、统计数据、仓库数据、财富历史以及市场数据，以便后续加载更快、更稳定。这些是应用数据，并不代表对你的私人账号访问。',
        },
        {
          title: '3. 保留在浏览器中的数据',
          body: '最近搜索仍会保存在你的浏览器中，使最近查询更快且仅属于当前设备。某些轻量级偏好设置，例如语言或最近活跃玩家，也会通过应用存储进行保存，以获得更一致的体验。',
        },
        {
          title: '4. Cookie',
          body: 'DFtracker 可能使用简单的 cookie，将界面偏好与你的浏览器关联。这仅用于语言、当前玩家或显示偏好等应用功能，不用于行为广告。',
        },
        {
          title: '5. 第三方数据来源',
          body: 'DFtracker 中展示的部分信息来自提供 Delta Force 相关数据的第三方服务。具体记录的准确性、完整性、更新时效和可用性取决于这些来源，并可能随时变化。',
        },
        {
          title: '6. 跟踪范围限制',
          body: '我们不会出售你的搜索活动，不会基于使用情况建立广告画像，也不会将 DFtracker 数据用于跨站广告跟踪。已存储的数据主要用于缓存、稳定性和易用性。',
        },
        {
          title: '7. 删除与用户责任',
          body: '由于部分数据仍保留在你的浏览器中，你可以随时从浏览器中清除 Recent Searches 或站点数据。如果你使用共享或公共设备，我们建议在使用结束后清除站点数据。',
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
      updatedAt: 'Terakhir diperbarui: 4 April 2026',
      sections: [
        {
          title: '1. Penggunaan Layanan',
          body: 'Dengan memakai DFtracker, Anda setuju menggunakan layanan ini untuk melihat statistik player, leaderboard internal, market, dan informasi pendukung lain yang tersedia. Layanan ini disediakan sebagai alat bantu komunitas, bukan layanan resmi Delta Force.',
        },
        {
          title: '2. Ketersediaan Data',
          body: 'Sebagian data dapat berubah, tertunda, kosong, atau tidak tersedia untuk player tertentu, season tertentu, mode tertentu, atau periode tertentu. DFtracker menampilkan data sesuai kondisi sumber yang tersedia saat itu dan tidak menjamin seluruh dataset selalu lengkap atau mutakhir.',
        },
        {
          title: '3. Batasan Penggunaan',
          body: 'Pengguna tidak diperkenankan menyalahgunakan aplikasi untuk aktivitas yang mengganggu layanan, termasuk scraping berlebihan, percobaan otomatisasi agresif, penyalahgunaan antarmuka, atau pola akses yang berpotensi membebani layanan dan mengganggu pengguna lain.',
        },
        {
          title: '4. Hak & Kepemilikan',
          body: 'DFtracker adalah proyek komunitas independen. Nama game, aset visual, dan elemen yang terkait dengan Delta Force tetap merupakan milik pemegang hak masing-masing. Aplikasi ini tidak dimaksudkan untuk menggantikan layanan resmi.',
        },
        {
          title: '5. Data Tersimpan dan Leaderboard',
          body: 'Sebagian tampilan DFtracker bergantung pada data yang tersimpan atau hasil data sebelumnya. Leaderboard juga dibangun dari data player yang pernah tersimpan di aplikasi, sehingga urutan yang tampil tidak selalu merepresentasikan seluruh populasi player Delta Force.',
        },
        {
          title: '6. Perubahan Layanan',
          body: 'Fitur, tampilan, metode penyimpanan, serta cakupan data di DFtracker dapat berubah dari waktu ke waktu. Kami dapat memperbarui, menyesuaikan, membatasi, atau menghentikan bagian tertentu dari layanan bila diperlukan.',
        },
        {
          title: '7. Penyangkalan Jaminan',
          body: 'DFtracker disediakan sebagaimana adanya. Sepanjang diizinkan hukum yang berlaku, kami tidak memberikan jaminan bahwa layanan akan selalu bebas gangguan, selalu berjalan sempurna, atau selalu sesuai untuk kebutuhan tertentu.',
        },
      ],
    },
    en: {
      updatedAt: 'Last updated: April 4, 2026',
      sections: [
        {
          title: '1. Service Use',
          body: 'By using DFtracker, you agree to use the service to view player stats, internal leaderboard information, market data, and related supporting details that are available. DFtracker is a community utility and not an official Delta Force service.',
        },
        {
          title: '2. Data Availability',
          body: 'Some data may change, appear late, remain empty, or be unavailable for certain players, seasons, modes, or history ranges. DFtracker shows information based on what is available from its sources at the time and does not guarantee that every dataset will always be complete or current.',
        },
        {
          title: '3. Usage Limits',
          body: 'Users may not misuse the app for disruptive activity, including excessive scraping, aggressive automation, interface abuse, or access patterns that may overload the service or degrade the experience for others.',
        },
        {
          title: '4. Rights & Ownership',
          body: 'DFtracker is an independent community project. The game name, visual assets, and Delta Force related elements remain the property of their respective rights holders. This app is not intended to replace official services.',
        },
        {
          title: '5. Stored Data and Leaderboards',
          body: 'Parts of DFtracker rely on saved data or previously loaded data. The leaderboard is also built from player data that has been stored by the app, so displayed rankings do not necessarily represent the entire Delta Force player population.',
        },
        {
          title: '6. Service Changes',
          body: 'Features, presentation, storage methods, and data coverage in DFtracker may change over time. We may update, adjust, limit, or discontinue parts of the service when needed.',
        },
        {
          title: '7. Disclaimer of Warranty',
          body: 'DFtracker is provided as-is. To the extent permitted by applicable law, we do not guarantee that the service will always be uninterrupted, error-free, or fit for any particular purpose.',
        },
      ],
    },
    zh: {
      updatedAt: '最后更新：2026年4月4日',
      sections: [
        {
          title: '1. 服务使用',
          body: '使用 DFtracker 即表示你同意通过本服务查看当前可用的玩家统计、内部排行榜、市场信息以及相关辅助内容。DFtracker 是社区工具，并非官方 Delta Force 服务。',
        },
        {
          title: '2. 数据可用性',
          body: '部分数据可能会变化、延迟出现、保持为空，或在某些玩家、赛季、模式或历史范围内不可用。DFtracker 会根据当时可获取的来源数据进行展示，但不保证所有数据始终完整或最新。',
        },
        {
          title: '3. 使用限制',
          body: '用户不得以会干扰服务的方式滥用本应用，包括过度抓取、激进自动化、界面滥用或可能导致服务负载过高并影响他人体验的访问行为。',
        },
        {
          title: '4. 权利与归属',
          body: 'DFtracker 是一个独立的社区项目。游戏名称、视觉素材以及与 Delta Force 相关的元素仍归各自权利方所有。本应用并不旨在替代官方服务。',
        },
        {
          title: '5. 已存储数据与排行榜',
          body: 'DFtracker 的部分展示依赖已保存的数据或先前加载的数据。排行榜同样基于应用中已经保存过的玩家数据构建，因此显示的排名不一定代表全部 Delta Force 玩家。',
        },
        {
          title: '6. 服务变更',
          body: 'DFtracker 的功能、展示方式、存储方法和数据覆盖范围可能会随着时间而变化。为保持服务可用性，我们可能会更新、调整、限制或停止部分内容。',
        },
        {
          title: '7. 免责声明',
          body: 'DFtracker 按”现状”提供。在适用法律允许的范围内，我们不保证服务始终不中断、始终正常运作，或适用于任何特定目的。',
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
