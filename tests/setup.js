import { afterEach, beforeEach, vi } from 'vitest';

function createStorageMock() {
  let store = {};

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
}

beforeEach(() => {
  if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== 'function') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  }

  if (!globalThis.sessionStorage || typeof globalThis.sessionStorage.clear !== 'function') {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  }

  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  document.title = 'DFtracker';
  window.lucide = {
    createIcons: vi.fn(),
  };
  window.updateMetadata = vi.fn();
  window.history.pushState({}, '', '/player');
  window.requestAnimationFrame = (callback) => {
    callback();
    return 0;
  };
  window.cancelAnimationFrame = () => {};

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      createLinearGradient: () => ({
        addColorStop: vi.fn(),
      }),
    }),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});
