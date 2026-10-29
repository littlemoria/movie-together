'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Domain = require('../js/domain.js');

test('电影输入统一规范化，云端载荷剔除本地字段', () => {
  const payload = Domain.toMoviePayload({
    id: 'temp_local',
    movie_name: '  花束般的恋爱  ',
    watch_date: '2026-10-29T12:00:00Z',
    duration_minutes: '124',
    genre: ['romance', 'drama'],
    status: 'watched',
    _pending: true,
    cached_at: '2026-10-29T12:00:00Z'
  });

  assert.equal(payload.movie_name, '花束般的恋爱');
  assert.equal(payload.watch_date, '2026-10-29');
  assert.equal(payload.duration_minutes, 124);
  assert.equal(payload.genre, 'romance,drama');
  assert.equal('id' in payload, false);
  assert.equal('_pending' in payload, false);
  assert.equal('status' in payload, false);
  assert.equal('cached_at' in payload, false);
});

test('无效电影在数据边界被拒绝', () => {
  assert.throws(() => Domain.toMoviePayload({ movie_name: '', watch_date: '' }), error => {
    assert.equal(error.name, 'DomainError');
    assert.equal(error.code, 'VALIDATION_ERROR');
    return true;
  });
  assert.throws(() => Domain.toMoviePayload({ movie_name: '测试', watch_date: '2026-01-01', duration_minutes: -1 }));
});

test('云端设置兼容 JSON 字符串与对象并补齐默认值', () => {
  const fromString = Domain.parseSettingsValue(JSON.stringify({
    bgType: 'video',
    cardOpacity: 180,
    wishlist: [{ id: 'wl_1', movie_name: '测试', added_at: '2026-10-29T08:00:00Z' }]
  }));
  assert.equal(fromString.schemaVersion, 1);
  assert.equal(fromString.bgType, 'video');
  assert.equal(fromString.cardOpacity, 100);
  assert.equal(fromString.wishlist[0].status, 'wishlist');
  assert.equal(fromString.wishlist[0].watch_date, '2026-10-29');
  assert.deepEqual(Domain.parseSettingsValue(null).customGenres, []);
});

test('云端记录为权威，本地待同步与想看记录按 ID 合并去重', () => {
  const merged = Domain.mergeMovies(
    [{ id: 'cloud-1', movie_name: '云端版', watch_date: '2026-01-01', tmdb_id: 10 }],
    [{ id: 'temp-1', movie_name: '离线新增', watch_date: '2026-01-02', _pending: true }],
    [
      { id: 'cloud-1', movie_name: '旧界面缓存', watch_date: '2025-01-01' },
      { id: 'wl-1', movie_name: '想看', status: 'wishlist', tmdb_id: 11 },
      { id: 'wl-2', movie_name: '重复想看', status: 'wishlist', tmdb_id: 10 }
    ]
  );

  assert.equal(merged.length, 3);
  assert.equal(merged.find(movie => movie.id === 'cloud-1').movie_name, '云端版');
  assert.ok(merged.find(movie => movie.id === 'temp-1')._pending);
  assert.ok(merged.some(movie => movie.id === 'wl-1'));
  assert.ok(!merged.some(movie => movie.id === 'wl-2'));
});

test('统计只计算已看记录，月份窗口保持稳定', () => {
  const movies = [
    { id: 1, movie_name: 'A', watch_date: '2026-10-01', duration_minutes: 100, genre: 'drama,romance' },
    { id: 2, movie_name: 'B', watch_date: '2026-10-02', duration_minutes: 80, genre: 'drama' },
    { id: 3, movie_name: 'C', status: 'wishlist', duration_minutes: 999, genre: 'action' }
  ];
  assert.equal(Domain.getTotalMinutes(movies), 180);
  assert.deepEqual(Domain.getGenreStats(movies), { drama: 2, romance: 1 });
  const stats = Domain.getMonthlyStats(movies, 3, new Date(2026, 11, 15));
  assert.deepEqual(stats.monthKeys, ['2026-10', '2026-11', '2026-12']);
  assert.equal(stats.monthlyCounts['2026-10'], 2);
});

test('本地临时 ID 前缀稳定且唯一', () => {
  const a = Domain.createLocalId();
  const b = Domain.createLocalId();
  assert.match(a, /^temp_\d+_[a-z0-9]+$/);
  assert.notEqual(a, b);
});
