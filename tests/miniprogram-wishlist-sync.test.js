/**
 * 想看清单跨端同步测试（小程序侧）。
 *
 * 关注点：想看清单不属于 movies 表，而是随 settings.wishlist 同步。
 * - 小程序新增想看后，写进云端的结构必须与网页版读取的结构一致（含 status）
 * - 云端已有的想看清单必须能进入 Store，并且与已看记录共存
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const MINI_ROOT = path.join(__dirname, '..', 'miniprogram');
const SESSION_KEY = 'cinememo_session';
const STORAGE = {
    [SESSION_KEY]: { access_token: 'token', user: { id: 'user-1' } },
};

// ---------- wx mock ----------
const cloud = {
    settings: {},
    movies: [],
    requests: [],
};

global.wx = {
    request(options) {
        cloud.requests.push({ url: options.url, method: options.method || 'GET', data: options.data });
        const url = options.url;

        if (url.includes('/rest/v1/settings')) {
            if ((options.method || 'GET') === 'GET') {
                options.success({
                    statusCode: 200,
                    data: Object.keys(cloud.settings).length
                        ? [{ value: JSON.stringify(cloud.settings) }]
                        : [],
                });
            } else {
                const body = JSON.parse(options.data);
                cloud.settings = JSON.parse(body.value);
                options.success({ statusCode: 201, data: null });
            }
            return;
        }

        if (url.includes('/rest/v1/movies')) {
            options.success({ statusCode: 200, data: cloud.movies });
            return;
        }

        options.success({ statusCode: 200, data: [] });
    },
    getStorageSync(key) { return STORAGE[key] === undefined ? '' : STORAGE[key]; },
    setStorageSync(key, value) { STORAGE[key] = value; },
    removeStorageSync(key) { delete STORAGE[key]; },
    showToast() {},
};

const { Store } = require(path.join(MINI_ROOT, 'lib', 'store.js'));
const service = require(path.join(MINI_ROOT, 'lib', 'service.js'));

function signIn() {
    Store.setSession({ user: { id: 'user-1' } });
}

function resetStore() {
    Store.resetPrivateData();
    signIn();
}

test('新增想看后写入云端的结构可被网页版直接消费', async () => {
    resetStore();
    cloud.settings = {};
    cloud.requests = [];

    const result = await service.addToWishlist({
        id: 603,
        title: '黑客帝国',
        poster_path: '/poster.jpg',
        year: '1999',
        vote_average: 8.2,
        genre: 'action,sci-fi',
    });

    assert.equal(result.ok, true);

    const saved = cloud.settings.wishlist;
    assert.equal(saved.length, 1);
    assert.match(String(saved[0].id), /^wl_/, '需带本地唯一 id，网页版按 id 合并去重');
    assert.equal(saved[0].movie_name, '黑客帝国');
    assert.equal(saved[0].tmdb_id, 603);
    assert.equal(saved[0].status, 'wishlist', '网页版按 status 区分已看/想看');
    assert.equal(saved[0].rating, 8.2, '评分取自 TMDB vote_average');
    assert.ok(saved[0].added_at, '需保留加入时间供网页版回退 watch_date');

    // 本地状态同步
    assert.deepEqual(Store.getWishlist().map((item) => item.movie_name), ['黑客帝国']);
});

test('云端想看清单能进入 Store 并与已看记录共存', async () => {
    resetStore();
    cloud.movies = [
        { id: 'm1', movie_name: '已看一', watch_date: '2026-09-01', genre: 'drama' },
    ];
    cloud.settings = {
        wishlist: [{
            id: 'wl_1',
            movie_name: '想看一',
            tmdb_id: 11,
            added_at: '2026-10-01T00:00:00.000Z',
            status: 'wishlist',
        }],
    };

    await service.loadMovies();
    await service.fetchSettings();

    assert.deepEqual(Store.getWatched().map((movie) => movie.movie_name), ['已看一']);
    assert.deepEqual(Store.getWishlist().map((movie) => movie.movie_name), ['想看一']);
});

test('重新拉取 movies 表不会丢掉云端想看清单', async () => {
    resetStore();
    cloud.movies = [{ id: 'm1', movie_name: '已看一', watch_date: '2026-09-01' }];
    cloud.settings = {
        wishlist: [{ id: 'wl_1', movie_name: '想看一', tmdb_id: 11, status: 'wishlist' }],
    };

    await service.fetchSettings();
    await service.loadMovies();

    assert.equal(Store.getWishlist().length, 1);
    assert.equal(Store.getWatched().length, 1);
});

test('云端设置为空时不会凭本地缓存臆造想看项', async () => {
    resetStore();
    cloud.movies = [];
    cloud.settings = { wishlist: [] };
    STORAGE.cinememo_wishlist = [{ id: 'wl_old', movie_name: '过期项', status: 'wishlist' }];

    await service.fetchSettings();
    await service.loadMovies();

    assert.deepEqual(Store.getWishlist(), [], '云端已清空时应以云端为准');
    delete STORAGE.cinememo_wishlist;
});
