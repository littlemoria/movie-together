'use strict';

/**
 * 网页版登录后刷新链路测试。
 *
 * 服务端 RLS 只允许登录用户读取 movies / settings，因此登录成功后必须重新
 * 拉取云端设置与电影列表并重绘，否则需要手动刷新页面才能看到列表。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { Store } = require('../js/store.js');
const MovieDomain = require('../js/domain.js');

const STORAGE = {};

function createDocument() {
  return {
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getElementById() {
      return {
        querySelector() { return null; },
        insertBefore() {},
        classList: { add() {}, remove() {}, toggle() {} },
        style: {},
        setAttribute() {},
      };
    },
    body: { setAttribute() {} },
  };
}

function loadScript(file, extra = {}) {
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Store,
    MovieDomain,
    DataError: class extends Error {},
    describeAuthError: () => '登录失败',
    document: createDocument(),
    window: { addEventListener() {}, location: { reload() {} } },
    navigator: { onLine: true },
    localStorage: {
      getItem: (key) => (STORAGE[key] === undefined ? null : STORAGE[key]),
      setItem: (key, value) => { STORAGE[key] = value; },
      removeItem: (key) => { delete STORAGE[key]; },
    },
    ...extra,
  });
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  return { context, run: (expr) => vm.runInContext(`${code}\n;${expr};`, context) };
}

test('登录成功后触发数据刷新', async () => {
  let reloadCalls = 0;

  const { run } = loadScript('auth.js', {
    API: {
      client: {
        auth: {
          signInWithPassword: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        },
      },
    },
    App: { reloadAfterAuth: async () => { reloadCalls += 1; } },
    Utils: { showToast() {} },
    Store,
  });

  const Auth = run('Auth');
  Store.setSession(null);

  const ok = await Auth.login('someone@example.com', 'secret');

  assert.equal(ok, true);
  assert.equal(reloadCalls, 1, '登录成功必须立即刷新云端数据');
  assert.equal(Store.isAuthenticated(), true);
});

test('登录失败不触发刷新', async () => {
  let reloadCalls = 0;

  const { run } = loadScript('auth.js', {
    API: {
      client: {
        auth: {
          signInWithPassword: async () => ({ data: { session: null }, error: { message: 'Invalid login credentials' } }),
        },
      },
    },
    App: { reloadAfterAuth: async () => { reloadCalls += 1; } },
    Utils: { showToast() {} },
    Store,
  });

  const Auth = run('Auth');
  const ok = await Auth.login('someone@example.com', 'wrong');

  assert.equal(ok, false);
  assert.equal(reloadCalls, 0);
});

test('reloadAfterAuth 先拉设置再拉电影，并重绘所有视图', async () => {
  const calls = [];
  const rendered = [];
  const cloudWishlist = [{ id: 'wl_1', movie_name: '想看一', tmdb_id: 11, status: 'wishlist' }];

  const { run } = loadScript('app.js', {
    Config: { STORAGE_KEYS: { MOVIES: 'movies', WISHLIST: 'movie-together-wishlist', CONFIG: 'cfg', GENRES: 'genres', ACHIEVEMENTS: 'ach' } },
    config: { theme: 'light', bgImage: '', bgGif: '', bgVideo: '', bgMaskOpacity: 30, cardOpacity: 100 },
    cloudSettings: { bgType: 'image', bgImage: '', bgGif: '', bgVideo: '', bgMaskOpacity: 30, cardOpacity: 100 },
    appState: Store.state,
    Logger: { init() {}, info() {}, error() {} },
    Sync: undefined,
    Offline: undefined,
    LazyLoad: undefined,
    Auth: {},
    Toast: {},
    Backup: {},
    Cache: undefined,
    API: {
      async fetchCloudSettingsWithRetry() {
        calls.push('fetchSettings');
        Store.setSettings({ theme: 'dark', wishlist: cloudWishlist });
        return true;
      },
      async fetchMovies() {
        calls.push('fetchMovies');
        return [{ id: 'm1', movie_name: '已看一', watch_date: '2026-09-01' }];
      },
    },
    Components: {
      applyOpacitySettings() {},
      loadUnlockedAchievements() {},
      updateBgInputsFromConfig() {},
      renderHome() { rendered.push('home'); },
      renderMovies() { rendered.push('movies'); },
      renderAchievements() { rendered.push('achievements'); },
      renderStats() { rendered.push('stats'); },
    },
    Utils: { showToast() {} },
  });

  const App = run('App');
  Store.resetPrivateData();

  await App.reloadAfterAuth();

  assert.deepEqual(calls, ['fetchSettings', 'fetchMovies'], '顺序：先设置（含想看）再电影列表');
  assert.deepEqual(rendered, ['home', 'movies', 'achievements', 'stats']);
  assert.equal(Store.state.settings.theme, 'dark');
  assert.deepEqual(Store.getWishlist().map((item) => item.id), ['wl_1']);
  assert.deepEqual(Store.getWatched().map((movie) => movie.id), ['m1']);
});

test('并发/重复的 reloadAfterAuth 会被合并，避免重复请求', async () => {
  let fetchCount = 0;

  const { run } = loadScript('app.js', {
    Config: { STORAGE_KEYS: { MOVIES: 'movies', WISHLIST: 'movie-together-wishlist', CONFIG: 'cfg', GENRES: 'genres', ACHIEVEMENTS: 'ach' } },
    config: { theme: 'light', bgImage: '', bgGif: '', bgVideo: '', bgMaskOpacity: 30, cardOpacity: 100 },
    cloudSettings: { bgType: 'image', bgImage: '', bgGif: '', bgVideo: '', bgMaskOpacity: 30, cardOpacity: 100 },
    appState: Store.state,
    Logger: { init() {}, info() {}, error() {} },
    Sync: undefined,
    Offline: undefined,
    LazyLoad: undefined,
    Auth: {},
    Toast: {},
    Backup: {},
    Cache: undefined,
    API: {
      async fetchCloudSettingsWithRetry() {
        fetchCount += 1;
        return true;
      },
      async fetchMovies() { return []; },
    },
    Components: {
      applyOpacitySettings() {},
      loadUnlockedAchievements() {},
      updateBgInputsFromConfig() {},
      renderHome() {},
      renderMovies() {},
      renderAchievements() {},
      renderStats() {},
    },
    Utils: { showToast() {} },
  });

  const App = run('App');
  Store.resetPrivateData();

  await Promise.all([App.reloadAfterAuth(), App.reloadAfterAuth()]);
  await App.reloadAfterAuth();

  assert.equal(fetchCount, 1, '短时间内重复调用只应拉取一次');
});
