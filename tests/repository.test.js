'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseRepository, DataError } = require('../js/repository.js');

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => data === null ? '' : JSON.stringify(data)
  };
}

function createRepository(handler, token = 'user-token') {
  return new SupabaseRepository({
    baseUrl: 'https://example.supabase.co/',
    anonKey: 'anon-key',
    getAccessToken: async () => token,
    transport: handler
  });
}

test('未登录的数据请求在发送前被拒绝', async () => {
  let called = false;
  const repository = createRepository(async () => { called = true; }, null);
  await assert.rejects(repository.listMovies(), error => {
    assert.ok(error instanceof DataError);
    assert.equal(error.code, 'AUTH_REQUIRED');
    return true;
  });
  assert.equal(called, false);
});

test('电影请求自动附带用户令牌并使用统一载荷', async () => {
  let captured;
  const repository = createRepository(async request => {
    captured = request;
    return response(201, [{ id: 'movie-1', movie_name: '测试', watch_date: '2026-10-29' }]);
  });
  const movie = await repository.saveMovie({
    movie_name: '测试',
    watch_date: '2026-10-29',
    _pending: true,
    status: 'watched'
  });

  assert.equal(captured.url, 'https://example.supabase.co/rest/v1/movies');
  assert.equal(captured.headers.Authorization, 'Bearer user-token');
  assert.equal(captured.headers.apikey, 'anon-key');
  const body = JSON.parse(captured.body);
  assert.equal(body.movie_name, '测试');
  assert.equal('_pending' in body, false);
  assert.equal('status' in body, false);
  assert.equal(movie.id, 'movie-1');
});

test('服务端错误映射为稳定错误码', async () => {
  const repository = createRepository(async () => response(403, { message: 'forbidden' }));
  await assert.rejects(repository.listMovies(), error => {
    assert.equal(error.code, 'PERMISSION_DENIED');
    assert.equal(error.status, 403);
    assert.equal(error.message, 'forbidden');
    return true;
  });
});

test('设置读取兼容旧字符串，保存采用原子 upsert', async () => {
  const requests = [];
  const repository = createRepository(async request => {
    requests.push(request);
    if (request.method === 'GET') {
      return response(200, [{ value: JSON.stringify({ theme: 'dark', cardOpacity: 80 }) }]);
    }
    return response(201, null);
  });

  const settings = await repository.getSettings();
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.schemaVersion, 1);
  await repository.saveSettings(settings);
  assert.equal(requests[1].method, 'POST');
  assert.match(requests[1].headers.Prefer, /merge-duplicates/);
  assert.equal(JSON.parse(requests[1].body).key, 'global');
});
