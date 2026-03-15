/**
 * Informational Pages for DFtracker
 * Privacy Policy, Terms of Service, Support, and Version History
 */

export function renderPrivacyPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="shield-check" style="width: 32px; height: 32px; color: var(--accent-primary);"></i>
        Privacy Policy
      </h1>
      <p class="page-subtitle">Kebijakan privasi dan transparansi data pengguna</p>
    </div>
    <div class="card">
      <div style="line-height: 1.8; color: var(--text-secondary); text-align: left;">
        <h2 style="color: var(--text-primary); margin-bottom: var(--space-md); font-size: 1.2rem;">1. Komitmen Privasi</h2>
        <p style="margin-bottom: var(--space-md);">DFtracker memprioritaskan privasi Anda. Kami berkomitmen untuk melindungi informasi yang mungkin dikumpulkan saat Anda mengoperasikan aplikasi kami. Kami percaya bahwa privasi adalah hak fundamental setiap pengguna.</p>
        
        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">2. Penyimpanan Lokal (Local Storage)</h2>
        <p style="margin-bottom: var(--space-md);">Seluruh data riwayat pencarian pemain (<b>Recent Searches</b>) disimpan secara eksklusif dalam penyimpanan lokal perangkat Anda (browser storage). Kami tidak memiliki akses ke data ini, tidak mengirimkannya ke server mana pun, dan tidak membagikannya kepada pihak ketiga.</p>
        
        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">3. Integrasi API & Kredensial</h2>
        <p style="margin-bottom: var(--space-md);">Aplikasi ini mengambil data dari API publik resmi Delta Force secara real-time. DFtracker bersifat <i>read-only</i>; kami tidak memerlukan, tidak meminta, dan tidak menyimpan kata sandi atau kredensial akun game Anda. Penggunaan data terbatas pada informasi statistik publik pemain.</p>
        
        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">4. Cookies & Preferensi</h2>
        <p style="margin-bottom: var(--space-md);">Kami menggunakan cookies teknis dasar untuk mengingat preferensi tampilan Anda (seperti filter pencarian atau mode tema). Kami tidak menggunakan cookies untuk tujuan pelacakan iklan atau pembuatan profil perilaku pengguna.</p>
        
        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">5. Keamanan Perangkat</h2>
        <p style="margin-bottom: var(--space-md);">Karena data Anda disimpan secara lokal, keamanan informasi Anda bergantung pada keamanan perangkat dan browser yang Anda gunakan. Kami menyarankan pengguna untuk selalu menggunakan versi browser terbaru dan membersihkan data situs jika menggunakan perangkat publik.</p>

        <div class="mt-lg" style="padding-top: var(--space-md); border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted); text-align: center;">
          Terakhir diperbarui: 15 Maret 2026
        </div>
      </div>
    </div>
  `;
}

export function renderTermsPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="scroll" style="width: 32px; height: 32px; color: var(--accent-primary);"></i>
        Terms of Service
      </h1>
      <p class="page-subtitle">Ketentuan penggunaan layanan DFtracker</p>
    </div>
    <div class="card">
       <div style="line-height: 1.8; color: var(--text-secondary); text-align: left;">
        <h2 style="color: var(--text-primary); margin-bottom: var(--space-md); font-size: 1.2rem;">1. Penerimaan Ketentuan</h2>
        <p style="margin-bottom: var(--space-md);">Dengan mengakses dan menggunakan DFtracker, Anda dianggap telah membaca dan menyetujui seluruh ketentuan layanan ini. Aplikasi ini disediakan "apa adanya" tanpa jaminan dalam bentuk apa pun.</p>
        
        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">2. Batasan Tanggung Jawab</h2>
        <p style="margin-bottom: var(--space-md);">DFtracker mengambil data pasar dan statistik dari sumber pihak ketiga. Kami tidak bertanggung jawab atas ketidakterlangsungan layanan, keterlambatan pembaruan harga, atau ketidakakuratan data statistik. Segala keputusan strategis atau ekonomi di dalam game yang diambil berdasarkan data dari aplikasi ini merupakan tanggung jawab penuh pengguna.</p>
        
        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">3. Hak Kekayaan Intelektual</h2>
        <p style="margin-bottom: var(--space-md);">Seluruh aset grafis, logo, merek dagang, dan data terkait game Delta Force adalah milik eksklusif Team Jade dan TiMi Studio Group. DFtracker adalah proyek komunitas independen (fan-made) yang bertujuan untuk memberikan kemudahan bagi sesama pemain tanpa niat melanggar hak kekayaan intelektual.</p>
        
        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">4. Aturan Penggunaan</h2>
        <p style="margin-bottom: var(--space-md);">Pengguna dilarang menyalahgunakan platform ini untuk aktivitas otomatisasi (scraping massal) yang dapat membebani infrastruktur API resmi. Penggunaan aplikasi ini harus mematuhi kode etik komunitas game yang berlaku.</p>

        <h2 style="color: var(--text-primary); margin-top: var(--space-lg); margin-bottom: var(--space-md); font-size: 1.2rem;">5. Perubahan Layanan</h2>
        <p style="margin-bottom: var(--space-md);">Kami berhak untuk mengubah, menonaktifkan, atau memperbarui fitur-fitur di dalam DFtracker secara berkala demi pemeliharaan sistem atau penyesuaian dengan kebijakan pengembang game resmi.</p>
      </div>
    </div>
  `;
}

export function renderSupportPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="heart" style="width: 32px; height: 32px; color: var(--accent-red);"></i>
        Support Project
      </h1>
      <p class="page-subtitle">Dukung pengembangan berkelanjutan DFtracker</p>
    </div>
    <div style="max-width: 600px; margin: 0 auto; text-align: center;">
      <div style="margin-bottom: var(--space-xl); padding: var(--space-lg); background: transparent;">
        <p style="color: var(--text-secondary); margin-bottom: var(--space-lg); line-height: 1.8;">
          Dukungan Anda membantu kami untuk tetap bisa menyewa server API dan mendedikasikan waktu untuk pengembangan fitur-fitur baru di DFtracker. Setiap kontribusi sangat berarti bagi kelangsungan proyek ini.
        </p>
        
        <div style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="padding: var(--space-md); background: rgba(255, 255, 255, 0.05); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-sm);">Local Support (Indonesia)</p>
            <a href="https://tiptap.gg/@fragjoe" target="_blank" style="font-family: var(--font-mono); color: var(--accent-primary); font-weight: 700; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px;">
              tiptap.gg/@fragjoe
              <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
            </a>
          </div>
          
          <div style="padding: var(--space-md); background: rgba(255, 255, 255, 0.05); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-sm);">International Support (PayPal)</p>
            <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
              <p id="paypal-email" style="font-family: var(--font-mono); color: var(--accent-primary); font-weight: 700; margin: 0;">scrawlxz@gmail.com</p>
              <button id="copy-paypal" class="btn btn-sm" style="padding: 4px; min-width: auto; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-secondary);" title="Salin Email">
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
      const originalHtml = btn.innerHTML;
      const width = btn.offsetWidth;
      btn.style.width = `${width}px`; // Maintain width to prevent layout shift
      btn.innerHTML = '<i data-lucide="check" style="width: 16px; margin-right: 4px;"></i>Tersalin!';
      btn.classList.add('active'); // Add a class for styling if needed
      if (window.lucide) window.lucide.createIcons();

      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.classList.remove('active');
        btn.style.width = ''; // Reset width
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
  const versions = [
    {
      tag: 'v1.2.0',
      date: '15 Maret 2026',
      changes: [
        'Migrasi sistem navigasi ke Clean URLs (History API)',
        'Optimasi SEO: Meta Dynamic Title, Meta Description, & Open Graph',
        'Implementasi Logika Tren Harga (Red/Up & Green/Down Indicator)',
        'Konsolidasi Data Statistik Pertandingan & Ekstraksi'
      ]
    },
    {
      tag: 'v1.1.0',
      date: '14 Maret 2026',
      changes: [
        'Fitur "Recent Searches" untuk profil pemain',
        'Penyederhanaan UI (Minimalist Navigation)',
        'Penambahan Grafik Histori Kekayaan (Wealth History)'
      ]
    },
    {
      tag: 'v1.0.0',
      date: '10 Maret 2026',
      changes: [
        'Rilis Awal DFtracker',
        'Fitur Market Tracker & Price History',
        'Fitur Pencarian Statistik Pemain',
        'Informasi Maps & Performa Musim'
      ]
    }
  ];

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <i data-lucide="history" style="width: 32px; height: 32px; color: var(--accent-primary);"></i>
        Version History
      </h1>
      <p class="page-subtitle">Catatan pembaruan dan histori pengembangan</p>
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
