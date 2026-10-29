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
