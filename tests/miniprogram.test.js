/**
 * 小程序数据层测试：验证 CSV 往返、工具函数、状态容器与想看清单合并逻辑。
 * 运行：node --test tests/miniprogram.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const MINI_LIB = path.join(__dirname, '..', 'miniprogram', 'lib');

// 小程序代码通过 require 相对路径引用模块，此处以小程序 lib 为基准解析。
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request.startsWith('./') && args[0] && args[0].filename && args[0].filename.includes('miniprogram')) {
        return originalResolve.call(this, path.join(MINI_LIB, request), ...args);
    }
    return originalResolve.call(this, request, ...args);
};

// 小程序使用 wx 存储，这里提供最小实现。
global.wx = {
    _storage: {},
    getStorageSync(k) {
        return this._storage[k] === undefined ? '' : this._storage[k];
    },
    setStorageSync(k, v) {
        this._storage[k] = v;
    },
    removeStorageSync(k) {
        delete this._storage[k];
    },
};

const csv = require(path.join(MINI_LIB, 'csv.js'));
const utils = require(path.join(MINI_LIB, 'utils.js'));
const constants = require(path.join(MINI_LIB, 'constants.js'));
const { Store } = require(path.join(MINI_LIB, 'store.js'));

test('CSV 生成与解析往返一致', () => {
    const movies = [
        { movie_name: '星际穿越', watch_date: '2026-10-01', duration_minutes: 169, genre: 'sci-fi,action', created_by: '我' },
        { movie_name: '爱, 在一起', watch_date: '2026-10-05', duration_minutes: 118, genre: 'romance', created_by: 'TA' },
        { movie_name: '带"引号"的', watch_date: '2026-09-12', duration_minutes: 125, genre: 'drama', created_by: '' },
    ];
    const parsed = csv.parseCSV(csv.toCSV(movies));
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].movie_name, '星际穿越');
    assert.equal(parsed[1].movie_name, '爱, 在一起');
    assert.equal(parsed[2].movie_name, '带"引号"的');
    assert.equal(parsed[0].duration_minutes, 169);
});

test('CSV 解析跳过表头并处理空行', () => {
    const text = '电影名称,观影日期\n\n某电影,2026-01-01\n';
    const parsed = csv.parseCSV(text);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].movie_name, '某电影');
});

test('类型 id 映射为中文名', () => {
    assert.equal(utils.getGenreName('sci-fi'), '科幻');
    assert.equal(utils.getGenreNames('sci-fi,action'), '科幻、动作');
    assert.equal(utils.getGenreName('unknown-id'), 'unknown-id');
});

test('海报 URL 按大小图规格拼接', () => {
    assert.equal(utils.getPosterUrl({ poster_path: '/a.jpg' }), 'https://image.tmdb.org/t/p/w200/a.jpg');
    assert.equal(utils.getLargePosterUrl({ poster_path: '/a.jpg' }), 'https://image.tmdb.org/t/p/w500/a.jpg');
    assert.equal(utils.getPosterUrl({ poster_path: null }), '');
});

test('成就定义覆盖次数与时长两类条件', () => {
    assert.ok(constants.ACHIEVEMENTS.length >= 8);
    assert.ok(constants.ACHIEVEMENTS.some((a) => a.type === 'count'));
    assert.ok(constants.ACHIEVEMENTS.some((a) => a.type === 'minutes'));
});

test('状态容器区分已看与想看', () => {
    Store.setMovies([
        { id: 1, movie_name: 'A', watch_date: '2026-10-01', status: 'watched' },
        { id: 'wl_1', movie_name: 'B', status: 'wishlist' },
    ]);
    assert.equal(Store.getWatched().length, 1);
    assert.equal(Store.getWishlist().length, 1);
    assert.equal(Store.getWishlist()[0].movie_name, 'B');
});

test('云端设置中的想看清单会合并进 movies', () => {
    Store.setMovies([{ id: 1, movie_name: 'A', watch_date: '2026-10-01', status: 'watched' }]);
    Store.setSettings({
        theme: 'dark',
        customGenres: [],
        unlockedAchievements: [],
        wishlist: [{ id: 'wl_9', movie_name: '沙丘', status: 'wishlist', year: '2021' }],
    });
    assert.equal(Store.getWatched().length, 1);
    assert.equal(Store.getWishlist().length, 1);
    assert.equal(Store.getWishlist()[0].movie_name, '沙丘');
    assert.equal(Store.state.settings.theme, 'dark');
});
