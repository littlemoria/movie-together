'use strict';

/**
 * settings 写入契约回归测试。
 *
 * 真实库的结构是「主键不是 key，另有唯一约束 settings_key_key」。
 * PostgREST 的 resolution=merge-duplicates 默认按主键判断冲突，
 * 因此请求串必须带 ?on_conflict=key，否则每次保存设置都会 409，
 * 表现就是「已看能同步（走 movies 表），想看永远同步不过去（走 settings）」。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const webRepo = require('../js/repository.js');
const miniRepo = require(path.join(__dirname, '..', 'miniprogram', 'lib', 'repository-core.js'));

function makeRepo(mod, calls) {
  return new mod.SupabaseRepository({
    baseUrl: 'https://example.supabase.co',
    anonKey: 'anon-key',
    getAccessToken: async () => 'token',
    transport: async (request) => {
      calls.push(request);
      // GET 需要返回数组体，其余按 204 空体处理
      if ((request.method || 'GET') === 'GET') {
        return { ok: true, status: 200, text: async () => '[]' };
      }
      return { ok: true, status: 204, text: async () => '' };
    },
  });
}

const SETTINGS = {
  theme: 'light',
  wishlist: [{ id: 'wl_1', movie_name: '想看一片', tmdb_id: 603, status: 'wishlist' }],
};

for (const [label, mod] of [['网页版', webRepo], ['小程序', miniRepo]]) {
  test(`${label} saveSettings 用 on_conflict=key 做 upsert`, async () => {
    const calls = [];
    const repo = makeRepo(mod, calls);
    await repo.saveSettings(SETTINGS);

    assert.equal(calls.length, 1);
    const request = calls[0];
    assert.equal(request.method, 'POST');
    assert.match(
      request.url,
      /\/rest\/v1\/settings\?on_conflict=key$/,
      '缺少 on_conflict=key 会撞 settings_key_key 唯一约束返回 409'
    );
    assert.match(request.headers.Prefer, /resolution=merge-duplicates/);

    const body = JSON.parse(request.body);
    assert.equal(body.key, 'global');
    const stored = JSON.parse(body.value);
    assert.equal(stored.wishlist.length, 1);
    assert.equal(stored.wishlist[0].tmdb_id, 603);
  });
}

test('两端读取设置都只取 key=global 的首行', async () => {
  for (const mod of [webRepo, miniRepo]) {
    const calls = [];
    const repo = makeRepo(mod, calls);
    await repo.getSettings();
    assert.match(calls[0].url, /\/rest\/v1\/settings\?key=eq\.global/);
    assert.match(calls[0].url, /limit=1/);
  }
});
