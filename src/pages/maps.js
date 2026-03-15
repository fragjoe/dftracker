/**
 * Maps & Seasons Page
 * Browse Delta Force maps and season information
 */
import { listMaps, getSeasonCurrent, listSeasons } from '../api/client.js';
import { escapeHTML } from '../utils/security.js';

const MAP_EMOJIS = ['🏔️', '🏙️', '🌲', '🏜️', '🌊', '🏢', '⛰️', '🌾', '🏗️', '❄️', '🌋', '🏛️'];

export function renderMapsPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">🗺️ Maps & Seasons</h1>
      <p class="page-subtitle">Jelajahi peta dan informasi season Delta Force</p>
    </div>

    <div id="season-section">
      <div class="loading-container">
        <div class="spinner"></div>
        <span class="loading-text">Memuat info season...</span>
      </div>
    </div>

    <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: var(--space-lg); margin-top: var(--space-xl); color: var(--text-primary)">
      🗺️ Daftar Peta
    </h2>

    <div id="maps-grid" class="grid-auto">
      <div class="loading-container" style="grid-column: 1/-1">
        <div class="spinner"></div>
        <span class="loading-text">Memuat daftar peta...</span>
      </div>
    </div>

    <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: var(--space-lg); margin-top: var(--space-xl); color: var(--text-primary)">
      📅 Semua Season
    </h2>

    <div id="seasons-list">
      <div class="loading-container">
        <div class="spinner"></div>
        <span class="loading-text">Memuat daftar season...</span>
      </div>
    </div>
  `;

  loadCurrentSeason(container);
  loadMaps(container);
  loadAllSeasons(container);
}

async function loadCurrentSeason(container) {
  const section = container.querySelector('#season-section');

  try {
    const data = await getSeasonCurrent();
    const season = data.season || data;

    const name = season.name || season.title || 'Unknown Season';
    const startDate = season.startTime || season.startDate || '';
    const endDate = season.endTime || season.endDate || '';
    const id = season.id || '';

    section.innerHTML = `
      <div class="season-banner">
        <div class="card-badge badge-green" style="margin-bottom: var(--space-md); display: inline-block">
          🟢 SEASON AKTIF
        </div>
        <div class="season-title">${escapeHTML(name)}</div>
        <div class="season-meta">
          ${id ? `<span class="text-mono text-muted">ID: ${escapeHTML(id)}</span>` : ''}
          ${startDate || endDate ? `
            <div style="margin-top: var(--space-sm)">
              ${startDate ? `📅 Mulai: <strong>${formatDate(startDate)}</strong>` : ''}
              ${endDate ? ` — Berakhir: <strong>${formatDate(endDate)}</strong>` : ''}
            </div>
          ` : ''}
          ${getRemainingDays(endDate)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Season error:', err);
    section.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-hint">⚠️ Gagal memuat info season: ${err.message}</div>
        </div>
      </div>
    `;
  }
}

async function loadMaps(container) {
  const grid = container.querySelector('#maps-grid');

  try {
    const data = await listMaps();
    const maps = data.maps || [];

    if (maps.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1">
          <div class="empty-icon">🗺️</div>
          <div class="empty-text">Belum ada data peta</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = maps.map((map, i) => {
      const emoji = MAP_EMOJIS[i % MAP_EMOJIS.length];
      const name = map.name || map.title || `Map ${i + 1}`;
      const id = map.id || '';

      return `
        <div class="map-card">
          <div class="map-card-img">${emoji}</div>
          <div class="map-card-body">
            <div class="map-card-name">${escapeHTML(name)}</div>
            <div class="map-card-desc text-mono text-muted">${escapeHTML(id)}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Maps error:', err);
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">Gagal memuat daftar peta</div>
        <div class="empty-hint">${err.message}</div>
      </div>
    `;
  }
}

async function loadAllSeasons(container) {
  const list = container.querySelector('#seasons-list');

  try {
    const data = await listSeasons();
    const seasons = data.seasons || [];

    if (seasons.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-hint">Belum ada data season</div></div>';
      return;
    }

    list.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Season</th>
              <th>ID</th>
              <th>Mulai</th>
              <th>Berakhir</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${seasons.map(s => {
      const name = s.name || s.title || 'Unknown';
      const start = s.startTime || s.startDate || '';
      const end = s.endTime || s.endDate || '';
      const now = new Date();
      const isActive = start && end && new Date(start) <= now && now <= new Date(end);
      const isPast = end && new Date(end) < now;

      return `
                <tr>
                  <td><strong>${escapeHTML(name)}</strong></td>
                  <td class="text-mono text-muted">${escapeHTML(s.id || '-')}</td>
                  <td>${formatDate(start)}</td>
                  <td>${formatDate(end)}</td>
                  <td>
                    ${isActive
          ? '<span class="card-badge badge-green">🟢 Aktif</span>'
          : isPast
            ? '<span class="card-badge" style="background: rgba(92,104,96,0.2); color: var(--text-muted)">Selesai</span>'
            : '<span class="card-badge badge-blue">Mendatang</span>'}
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('Seasons error:', err);
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-hint">⚠️ Gagal memuat daftar season: ${err.message}</div>
      </div>
    `;
  }
}

function getRemainingDays(endDate) {
  if (!endDate) return '';
  const end = new Date(endDate);
  const now = new Date();
  const diff = end - now;
  if (diff <= 0) return '<div style="margin-top: var(--space-sm)" class="text-red">Season telah berakhir</div>';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `<div style="margin-top: var(--space-sm)" class="text-green">⏳ ${days} hari tersisa</div>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
}
