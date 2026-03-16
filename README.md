# DFtracker

DFtracker adalah dashboard web untuk:

- melihat statistik player Delta Force
- melihat wealth atau stash value player
- memantau market item Delta Force

Project ini fokus pada pengalaman baca data yang cepat, ringkas, dan enak dipakai, bukan sekadar menampilkan response mentah dari API.

## Scope

Saat ini analisis player difokuskan untuk:

- Delta Force Steam
- Operations mode

## Tech Stack

- Vite
- Vanilla JavaScript (SPA)
- Chart.js
- Lucide icons
- CSS custom styling
- Vitest + jsdom untuk smoke test
- ESLint untuk linting
- Vercel rewrites untuk proxy API dan SPA routing

## Core Features

### Player Stats

- cari player dengan player ID, UUID, atau nickname
- auto search dengan debounce
- fallback otomatis ke `All Time` jika season aktif tidak punya data
- recent searches tersimpan di browser
- active player dipertahankan di header

### Wealth

- halaman terpisah dari stats
- tetap memakai player aktif terakhir
- menampilkan stash summary dan wealth history

### Market

- list item market
- detail item dalam modal overlay
- chart harga market
- harga umum per range waktu
- dukungan bahasa UI tanpa memaksa nama item market ikut bahasa Indonesia

### Localization

- EN
- ID
- ZH

UI text memakai sistem i18n internal, dan endpoint API yang mendukung `language` ikut menyesuaikan bahasa aktif.

## Project Structure

```text
src/
  api/
    client.js        # wrapper API DeltaForceAPI
  pages/
    player.js        # Stats + Wealth page logic
    market.js        # Market page + item modal
    info.js          # Privacy, Terms, Support, Version
  styles/
    index.css        # seluruh styling utama
  utils/
    security.js      # escaping + sanitize error message
  i18n.js            # dictionary dan language helpers
  main.js            # SPA router, shell app, nav, header state

public/
  sitemap.xml
  robots.txt
  favicon.*

tests/
  player-smoke.test.js
  market-modal.test.js
  app-flow.test.js
```

## How It Works

### 1. SPA Router

Router utama ada di `src/main.js`.

App memakai History API dan route berikut:

- `/player`
- `/wealth`
- `/market`
- `/privacy`
- `/terms`
- `/support`
- `/version`

`/market`, `/privacy`, `/terms`, `/support`, dan `/version` di-load secara lazy agar bundle awal lebih ringan.

### 2. Active Player Context

State player aktif disimpan dan dibaca ulang dari browser storage.

Tujuannya:

- user tidak perlu input ulang saat pindah dari `Stats` ke `Wealth`
- header bisa selalu menampilkan player aktif terakhir
- flow app tetap terasa nyambung

Logic utama ada di `src/pages/player.js` dan sinkronisasi header ada di `src/main.js`.

### 3. API Layer

Semua request API dibungkus lewat `src/api/client.js`.

App tidak memanggil domain API langsung dari browser route biasa, tetapi melalui rewrite:

- `/api/*` -> `https://api.deltaforceapi.com/*`

Konfigurasi ini ada di `vercel.json`.

Endpoint utama yang dipakai:

- `GetPlayer`
- `GetPlayerOperationStats`
- `GetPlayerOperationStashValue`
- `GetPlayerOperationHistoricalStashValue`
- `ListAuctionItems`
- `GetAuctionItem`
- `GetAuctionItemPrices`
- `GetAuctionItemPriceSeries`
- `ListSeasons`

### 4. Caching and Retry Behavior

Beberapa resource player memakai cache memori sementara agar:

- pindah halaman terasa cepat
- request API tidak terlalu boros
- flow `Stats -> Wealth -> Stats` tetap responsif

Ada juga retry atau polling ringan untuk resource yang kadang belum siap saat player baru pertama kali diproses.

### 5. Charts

Chart tidak ikut dimuat di bundle awal.

`Chart.js` sekarang di-load secara lazy saat chart benar-benar dibutuhkan:

- radar score breakdown
- wealth history
- market price chart

Ini membantu mengurangi beban initial load.

## Localization

File utama i18n ada di `src/i18n.js`.

Di sana ada:

- dictionary per bahasa
- helper `t()`
- helper language storage
- helper mapping bahasa UI ke parameter bahasa API

Kalau menambah teks baru:

1. tambahkan key di `src/i18n.js`
2. pakai `t('path.key')` di UI
3. hindari hardcoded string langsung di page logic

## Testing

Project ini sudah punya smoke test ringan untuk flow penting:

- player search
- season fallback
- market modal
- active player context antar halaman

Jalankan:

```bash
npm run test
```

Lint:

```bash
npm run lint
```

Cek lengkap:

```bash
npm run check
```

## Local Development

Install dependency:

```bash
npm install
```

Jalankan dev server:

```bash
npm run dev
```

Build production:

```bash
npm run build
```

Preview build:

```bash
npm run preview
```

## Deployment

Project ini cocok untuk deploy di Vercel.

Yang perlu diperhatikan:

- SPA routing sudah ditangani oleh rewrite ke `/index.html`
- proxy API juga sudah ditangani oleh rewrite `/api/*`

File penting deploy:

- `vercel.json`
- `public/robots.txt`
- `public/sitemap.xml`

## Developer Notes

### Saat mengubah Player flow

Perhatikan area ini:

- active player context
- recent searches
- season fallback
- cache stats/stash/history

Semua itu saling berhubungan.

### Saat mengubah Market flow

Perhatikan area ini:

- item list search
- detail modal
- chart range
- market common price logic

### Saat menambah fitur baru

Sebaiknya tetap jalankan:

```bash
npm run check
```

karena logic state project ini sudah cukup banyak dan regressions mudah terjadi.

## Current Quality Snapshot

Audit lokal terakhir untuk route `/player` menghasilkan:

- Accessibility: 100
- Best Practices: 100
- SEO: 100
- Performance: sekitar 95 pada audit lokal Lighthouse

Skor performance bisa berbeda tergantung environment deploy, throttling, dan kondisi jaringan.
