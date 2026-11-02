'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../js/store.js');

test('登录状态统一维护认证含义和旧字段兼容', () => {
  const store = createStore();
  assert.equal(store.isAuthenticated(), false);
  store.setSession({ user: { id: 'user-1' } });
  assert.equal(store.isAuthenticated(), true);
  assert.equal(store.state.isAdmin, true);
  assert.equal(store.state.userId, 'user-1');
  store.setSession(null);
  assert.equal(store.state.isAdmin, false);
  assert.equal(store.state.userId, null);
});

test('电影写入集中去重并递增数据版本', () => {
  const store = createStore();
  let events = 0;
  store.subscribe((_state, type) => { if (type === 'movies') events++; });
  store.setMovies([{ id: 'a', movie_name: 'A', watch_date: '2026-01-01' }]);
  store.upsertMovie({ id: 'a', movie_name: 'A2', watch_date: '2026-01-02' });
  store.upsertMovie({ id: 'b', movie_name: 'B', watch_date: '2026-01-03' });
  assert.equal(store.state.movies.length, 2);
  assert.equal(store.state.movies[0].id, 'b');
  assert.equal(store.state.movies.find(movie => movie.id === 'a').movie_name, 'A2');
  assert.equal(store.state._dataVersion, 3);
  assert.equal(events, 3);
  store.removeMovie('a');
  assert.deepEqual(store.state.movies.map(movie => movie.id), ['b']);
});

test('离线新增与批量导入遵守 prepend 追加语义并保留待同步标记', () => {
  const store = createStore();
  store.setMovies([{ id: 'a', movie_name: 'A', watch_date: '2026-01-01' }]);

  // 默认前置：新记录排在前面（手动添加习惯）
  store.upsertMovie({ id: 'b', movie_name: 'B', watch_date: '2026-01-02' });
  assert.deepEqual(store.state.movies.map(movie => movie.id), ['b', 'a']);

  // prepend: false 追加到末尾（CSV 批量导入 / 离线恢复保持顺序）
  store.upsertMovie(
    { id: 'temp_x', movie_name: 'C', watch_date: '2026-01-03', _pending: true },
    { prepend: false }
  );
  assert.deepEqual(store.state.movies.map(movie => movie.id), ['b', 'a', 'temp_x']);
  assert.equal(store.state.movies[2]._pending, true);
});

// ---------- 想看清单：跨端同步的集合不变式 ----------

const WISHLIST_ITEM = {
  id: 'wl_1',
  movie_name: '想看一',
  tmdb_id: 11,
  added_at: '2026-10-01T00:00:00.000Z'
};

test('settings 携带的想看清单会合并进 movies，并且标记为已读取云端设置', () => {
  const store = createStore();
  assert.equal(store.state.settingsHydrated, false);

  store.setSettings({ wishlist: [WISHLIST_ITEM] });

  assert.equal(store.state.settingsHydrated, true);
  assert.deepEqual(store.getWishlist().map(movie => movie.id), ['wl_1']);
  assert.equal(store.getWishlist()[0].status, 'wishlist');
  assert.equal(store.getWishlist()[0].watch_date, '2026-10-01', '缺少 watch_date 时回退 added_at');
});

test('movies 表刷新不会清空想看清单', () => {
  const store = createStore();
  store.setSettings({ wishlist: [WISHLIST_ITEM] });

  // 模拟定时同步：云端 movies 表只含已看记录
  store.setMovies([
    { id: 'm1', movie_name: '已看一', watch_date: '2026-09-01' },
    { id: 'm2', movie_name: '已看二', watch_date: '2026-09-02' }
  ]);

  assert.deepEqual(store.getWatched().map(movie => movie.id).sort(), ['m1', 'm2']);
  assert.deepEqual(store.getWishlist().map(movie => movie.id), ['wl_1'], '想看项必须保留');
});

test('合并云端数据时，已看过的同 tmdb_id 想看项会被剔除', () => {
  const store = createStore();
  store.setSettings({ wishlist: [WISHLIST_ITEM, { ...WISHLIST_ITEM, id: 'wl_2', tmdb_id: 12 }] });

  store.mergeData(
    [{ id: 'm1', movie_name: '已看一', watch_date: '2026-09-01', tmdb_id: 12 }],
    store.getWishlist()
  );

  assert.deepEqual(store.getWishlist().map(movie => movie.id), ['wl_1']);
});

test('setWishlist 以传入清单为准，并保留已看记录', () => {
  const store = createStore();
  store.setMovies([{ id: 'm1', movie_name: '已看一', watch_date: '2026-09-01' }]);

  store.setWishlist([WISHLIST_ITEM]);
  assert.deepEqual(store.getWishlist().map(movie => movie.id), ['wl_1']);
  assert.equal(store.getWatched().length, 1);

  // 另一端的清单只剩一项时，本地旧的想看项应被替换掉
  store.setWishlist([{ ...WISHLIST_ITEM, id: 'wl_9', tmdb_id: 99 }]);
  assert.deepEqual(store.getWishlist().map(movie => movie.id), ['wl_9']);
});

test('登出后清空私有数据并重置设置读取标记', () => {
  const store = createStore();
  store.setSettings({ wishlist: [WISHLIST_ITEM], theme: 'dark' });
  store.setSession(null);
  store.resetPrivateData();

  assert.deepEqual(store.state.movies, []);
  assert.equal(store.state.settingsHydrated, false);
  assert.equal(store.state.settings.theme, 'light');
});
