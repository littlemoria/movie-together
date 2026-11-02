'use strict';

/**
 * 网页版设置同步（想看清单载体）测试。
 *
 * 关注点：settings.wishlist 是「想看」的唯一云端载体，
 * 任何回写都必须建立在「已读取过云端设置」的前提上，
 * 否则会把空清单写回云端，抹掉另一端的记录。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { Store } = require('../js/store.js');
const MovieDomain = require('../js/domain.js');

const STORAGE = {};

class FakeDataError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function loadAPI() {
  const context = vm.createContext({
    console,
    setTimeout,
    Promise,
    Store,
    MovieDomain,
    DataError: FakeDataError,
    SupabaseRepository: class {},
    Config: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_KEY: 'anon-key',
      STORAGE_KEYS: {
        CONFIG: 'movie-together-config',
        GENRES: 'movie-together-genres',
        MOVIES: 'movies',
        WISHLIST: 'movie-together-wishlist',
        ACHIEVEMENTS: 'movie-together-achievements',
      },
    },
    cloudSettings: {},
    config: { theme: 'light' },
    appState: Store.state,
    window: {},
    navigator: { onLine: true },
    localStorage: {
      getItem: (key) => (STORAGE[key] === undefined ? null : STORAGE[key]),
      setItem: (key, value) => { STORAGE[key] = value; },
    },
    fetch: async () => ({ ok: true, json: async () => ({ results: [] }) }),
    Cache: undefined,
    Backup: undefined,
    Sync: undefined,
    Utils: { showToast() {} },
  });

  // 顶层 const 不挂到全局对象上，用脚本完成值把它取出来
  return vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8')}\n;API;`, context);
}

function createRepository(overrides = {}) {
  const calls = { get: 0, save: [], savedPayload: null };
  const repository = {
    async getSettings() {
      calls.get += 1;
      if (overrides.getSettings) return overrides.getSettings();
      return MovieDomain.normalizeSettings({});
    },
    async saveSettings(settings) {
      calls.savedPayload = settings;
      calls.save.push(settings);
      return MovieDomain.normalizeSettings(settings);
    },
  };
  return { repository, calls };
}

function prepare(overrides) {
  Store.resetPrivateData();
  const api = loadAPI();
  const { repository, calls } = createRepository(overrides);
  api.repository = repository;
  return { api, calls };
}

const CLOUD_WISHLIST = {
  id: 'wl_cloud',
  movie_name: '云端想看',
  tmdb_id: 603,
  added_at: '2026-10-01T00:00:00.000Z',
  status: 'wishlist',
};

test('未登录时不写设置', async () => {
  const { api, calls } = prepare();
  Store.setSession(null);

  const result = await api.saveCloudSettings();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'AUTH_REQUIRED');
  assert.equal(calls.save.length, 0);
});

test('尚未读取云端设置时先读取再写入，避免覆盖另一端的想看清单', async () => {
  const { api, calls } = prepare({
    getSettings: () => MovieDomain.normalizeSettings({
      theme: 'dark',
      bgImage: 'https://example.com/bg.jpg',
      wishlist: [CLOUD_WISHLIST],
    }),
  });
  Store.setSession({ user: { id: 'user-1' } });
  Store.upsertMovie({ ...CLOUD_WISHLIST, id: 'wl_local', movie_name: '本地想看', tmdb_id: 604 });
  assert.equal(Store.state.settingsHydrated, false);

  const result = await api.saveCloudSettings();

  assert.equal(result.ok, true);
  assert.equal(calls.get, 1, '写入前必须先读取云端设置');
  assert.equal(calls.savedPayload.wishlist.length, 2, '云端与本地想看项都在');
  assert.equal(calls.savedPayload.bgImage, 'https://example.com/bg.jpg', '不得用默认值覆盖云端背景');
  assert.equal(calls.savedPayload.theme, 'dark', '外观以云端为准');
});

test('读取云端设置失败时不回写（宁可不同步也不清空）', async () => {
  const { api, calls } = prepare({
    getSettings: () => { throw new FakeDataError('网络连接失败', 'NETWORK_ERROR'); },
  });
  Store.setSession({ user: { id: 'user-1' } });

  const result = await api.saveCloudSettings();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SETTINGS_NOT_READY');
  assert.equal(calls.save.length, 0);
});

test('已读取云端设置后，回写内容包含 Store 中的想看清单', async () => {
  const { api, calls } = prepare();
  Store.setSession({ user: { id: 'user-1' } });
  Store.setSettings({ theme: 'dark', wishlist: [CLOUD_WISHLIST] });

  await api.saveCloudSettings();

  assert.equal(calls.get, 0, '已读取过设置时无需重复读取');
  assert.equal(calls.savedPayload.wishlist.length, 1);
  assert.equal(calls.savedPayload.wishlist[0].tmdb_id, 603);
  assert.equal(calls.savedPayload.wishlist[0].status, 'wishlist');
});

test('fetchCloudSettings 把云端想看清单合并进 Store', async () => {
  const { api } = prepare({
    getSettings: () => MovieDomain.normalizeSettings({
      theme: 'dark',
      wishlist: [CLOUD_WISHLIST],
    }),
  });
  Store.setSession({ user: { id: 'user-1' } });
  Store.setMovies([{ id: 'm1', movie_name: '已看一', watch_date: '2026-09-01' }]);

  await api.fetchCloudSettings();

  assert.equal(Store.state.settingsHydrated, true);
  assert.equal(Store.state.settings.theme, 'dark');
  assert.deepEqual(Store.getWishlist().map((item) => item.id), ['wl_cloud']);
  assert.equal(Store.getWatched().length, 1, '已看记录不受影响');
  assert.match(STORAGE['movie-together-wishlist'], /云端想看/);
});
