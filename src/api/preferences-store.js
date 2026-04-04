const TRACKER_API_BASE = '/tracker-api';

export const CLIENT_PREFERENCE_KEYS = {
  language: 'app_language',
  storageNoticeDismissed: 'storage_notice_acknowledged',
  activePlayerProfile: 'active_player_profile',
  lastPlayerQuery: 'lastPlayerQuery',
};

const LEGACY_LOCAL_STORAGE_PARSERS = {
  [CLIENT_PREFERENCE_KEYS.language]: (value) => String(value || '').trim() || null,
  [CLIENT_PREFERENCE_KEYS.storageNoticeDismissed]: (value) => value === 'true',
  [CLIENT_PREFERENCE_KEYS.activePlayerProfile]: (value) => {
    try {
      return JSON.parse(value || 'null');
    } catch (error) {
      return null;
    }
  },
  [CLIENT_PREFERENCE_KEYS.lastPlayerQuery]: (value) => String(value || '').trim() || null,
};

const preferenceCache = new Map();
let initializePromise = null;

function getTrackerUrl(path) {
  const baseOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';
  return new URL(`${TRACKER_API_BASE}${path}`, baseOrigin).toString();
}

function canUsePreferenceNetwork() {
  if (typeof fetch !== 'function') return false;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
    return false;
  }
  return true;
}

async function fetchPreferences(keys = []) {
  if (!canUsePreferenceNetwork()) {
    return [];
  }

  const params = new URLSearchParams();
  keys.forEach((key) => {
    if (key) {
      params.append('key', key);
    }
  });

  try {
    const response = await fetch(getTrackerUrl(`/preferences${params.toString() ? `?${params.toString()}` : ''}`));
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return Array.isArray(payload?.preferences) ? payload.preferences : [];
  } catch (error) {
    return [];
  }
}

async function postPreference(key, value, remove = false) {
  if (!canUsePreferenceNetwork()) {
    if (remove) {
      preferenceCache.delete(key);
      return null;
    }

    preferenceCache.set(key, value);
    return value;
  }

  try {
    const response = await fetch(getTrackerUrl('/preferences'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(remove ? { key, remove: true } : { key, value }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    return null;
  }
}

function readLegacyLocalStoragePreference(key) {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const rawValue = localStorage.getItem(key);
  if (rawValue === null) {
    return null;
  }

  const parser = LEGACY_LOCAL_STORAGE_PARSERS[key];
  return typeof parser === 'function' ? parser(rawValue) : rawValue;
}

function cleanupLegacyLocalStorage() {
  if (typeof localStorage === 'undefined') {
    return;
  }

  Object.values(CLIENT_PREFERENCE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}

export async function initializeClientPreferences() {
  if (!initializePromise) {
    initializePromise = (async () => {
      const serverPreferences = await fetchPreferences();
      const knownServerKeys = new Set();

      serverPreferences.forEach((entry) => {
        if (!entry?.key) return;
        knownServerKeys.add(entry.key);
        preferenceCache.set(entry.key, entry.value);
      });

      for (const key of Object.values(CLIENT_PREFERENCE_KEYS)) {
        if (knownServerKeys.has(key)) {
          continue;
        }

        const legacyValue = readLegacyLocalStoragePreference(key);
        if (legacyValue === null || typeof legacyValue === 'undefined') {
          continue;
        }

        preferenceCache.set(key, legacyValue);
        await postPreference(key, legacyValue, false);
      }

      cleanupLegacyLocalStorage();
    })();
  }

  await initializePromise;
}

export function getClientPreference(key, fallback = null) {
  return preferenceCache.has(key) ? preferenceCache.get(key) : fallback;
}

export async function setClientPreference(key, value) {
  preferenceCache.set(key, value);
  await postPreference(key, value, false);
  return value;
}

export async function removeClientPreference(key) {
  preferenceCache.delete(key);
  await postPreference(key, null, true);
}
