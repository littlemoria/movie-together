'use strict';

/**
 * 网页版初始化冒烟测试。
 *
 * 目的：App.init 的云端外观应用逻辑已抽取为 applyCloudAppearance，
 * 这里用最小 DOM 桩跑完整初始化，确保没有漏改的引用、顺序错乱或异常中断。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { Store } = require('../js/store.js');
const MovieDomain = require('../js/domain.js');

const STORAGE = {};

function createElement(id) {
  const element = {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertBefore() {},
    contains() { return false; },
    querySelector() { return createElement('child'); },
    querySelectorAll() { return []; },
    setAttribute() {},
  };
  Object.defineProperty(element, 'valueAsDate', {
    set() {},
    get() { return null; },
  });
  return element;
}

test('App.init 能完整执行并渲染首屏', async () => {
  const rendered = [];
  const documentStub = {
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector === '.settings-btn') return createElement('settings-btn');
      return createElement(selector);
    },
    getElementById(id) { return createElement(id); },
    body: { setAttribute() {} },
  };

  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Store,
    MovieDomain,
    DataError: class extends Error {},
    document: documentStub,
    window: { addEventListener() {}, location: { reload() {} } },
    navigator: { onLine: true },
    localStorage: {
      getItem: (key) => (STORAGE[key] === undefined ? null : STORAGE[key]),
      setItem: (key, value) => { STORAGE[key] = value; },
      removeItem: (key) => { delete STORAGE[key]; },
    },
    Config: {
      STORAGE_KEYS: {
        MOVIES: 'movies',
        WISHLIST: 'movie-together-wishlist',
        CONFIG: 'cfg',
        GENRES: 'genres',
        ACHIEVEMENTS: 'ach',
      },
      MUSIC_TRACKS: [{ name: 'track', url: 'https://example.com/a.mp3' }],
      PAGE_TITLES: { home: { title: 'CineMemo', subtitle: '' } },
      ACHIEVEMENTS: [],
    },
    config: { theme: 'light', bgImage: '', bgGif: '', bgVideo: '', bgMaskOpacity: 30, cardOpacity: 100 },
    cloudSettings: { bgType: 'image', bgImage: '', bgGif: '', bgVideo: '', bgMaskOpacity: 30, cardOpacity: 100 },
    appState: Store.state,
    Logger: { init() {}, info() {}, error() {} },
    Utils: { loadConfig() {}, loadCustomGenres() {}, showToast() {}, confirm: async () => true },
    Auth: { init: async () => {} },
    LazyLoad: { init() {} },
    Offline: { init() {}, onStatusChange() {} },
    Sync: { init: async () => {}, loadFromCache: async () => null },
    Toast: {},
    Backup: {},
    Cache: undefined,
    API: {
      async fetchCloudSettingsWithRetry() {
        Store.setSettings({ theme: 'dark', wishlist: [{ id: 'wl_1', movie_name: '想看', tmdb_id: 9, status: 'wishlist' }] });
        return true;
      },
      async fetchMovies() {
        return [{ id: 'm1', movie_name: '已看', watch_date: '2026-09-01' }];
      },
    },
    Components: {
      applyOpacitySettings() {},
      loadUnlockedAchievements() {},
      updateBgInputsFromConfig() {},
      renderGenreOptions() {},
      renderFilterOptions() {},
      renderHome() { rendered.push('home'); },
      renderMovies() {},
      renderAchievements() {},
      renderStats() {},
    },
  });

  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const App = vm.runInContext(`${code}\n;App;`, context);

  Store.resetPrivateData();
  await App.init();

  assert.ok(rendered.includes('home'), '首屏应被渲染');
  assert.equal(Store.getWatched().length, 1, '登录态下应加载到已看记录');
  assert.equal(Store.getWishlist().length, 1, '想看清单应一并进入状态');
  assert.equal(Store.state.settings.theme, 'dark', '外观应使用云端主题');
});
