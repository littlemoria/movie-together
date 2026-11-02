/**
 * 小程序 TMDB 时长映射测试。
 *
 * 回归点：TMDB 的 runtime 字段单位是「分钟」，详情接口必须原样（取整）写入
 * duration_minutes；曾误按小时换算（runtime / 60），导致表单「时长（分钟）」
 * 显示为个位数。
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const MINI_ROOT = path.join(__dirname, '..', 'miniprogram');

const SEARCH_RESULT = {
    id: 603,
    title: '黑客帝国',
    poster_path: '/poster.jpg',
    vote_average: 8.2,
    release_date: '1999-03-31',
    genre_ids: [28, 878],
};

const DETAIL_RESULT = {
    runtime: 136,
    vote_average: 8.2,
    genres: [{ id: 28 }, { id: 878 }],
    credits: {
        crew: [{ job: 'Director', name: '莉莉·沃卓斯基' }],
        cast: [{ name: '基努·里维斯' }, { name: '凯瑞-安·莫斯' }],
    },
};

// ---------- wx mock ----------
global.wx = {
    request(options) {
        if (options.url.includes('/search/movie')) {
            options.success({ statusCode: 200, data: { results: [SEARCH_RESULT] } });
            return;
        }
        if (options.url.includes('/movie/603')) {
            options.success({ statusCode: 200, data: DETAIL_RESULT });
            return;
        }
        options.success({ statusCode: 200, data: {} });
    },
    showToast() {},
    setStorageSync() {},
    getStorageSync() { return ''; },
};

let pageDef = null;
global.Page = (def) => { pageDef = def; };
global.getApp = () => ({ onLogout() {} });

require(path.join(MINI_ROOT, 'pages', 'movies', 'movies.js'));

const { searchMovies, getMovieDetail } = require(path.join(MINI_ROOT, 'lib', 'tmdb.js'));

function createPage() {
    const inst = {
        data: JSON.parse(JSON.stringify(pageDef.data)),
        setData(patch) {
            for (const key of Object.keys(patch)) {
                if (key.includes('.')) {
                    const [outer, inner] = key.split('.');
                    this.data[outer] = { ...this.data[outer], [inner]: patch[key] };
                } else {
                    this.data[key] = patch[key];
                }
            }
        },
    };
    Object.assign(inst, pageDef);
    inst.data = JSON.parse(JSON.stringify(pageDef.data));
    for (const name of Object.keys(pageDef)) {
        if (typeof pageDef[name] === 'function') {
            inst[name] = pageDef[name].bind(inst);
        }
    }
    return inst;
}

test('getMovieDetail 将 TMDB runtime 按分钟返回，而不是换算成小时', async () => {
    const detail = await getMovieDetail(603);
    assert.strictEqual(detail.duration_minutes, 136, '136 分钟不应被折算为 2');
    assert.strictEqual(detail.director, '莉莉·沃卓斯基');
});

test('搜索结果的评分字段来自 TMDB vote_average', async () => {
    const results = await searchMovies('黑客帝国');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].vote_average, 8.2);
    assert.strictEqual(results[0].genre, 'action,sci-fi');
});

test('选用搜索结果后，表单时长与评分被正确填充', async () => {
    const page = createPage();
    const results = await searchMovies('黑客帝国');
    page.setData({
        tmdbResults: results.map((item) => ({
            ...item,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : '',
        })),
    });

    await page.handleTmdbPick({ currentTarget: { dataset: { index: 0 } } });

    assert.strictEqual(page.data.form.movie_name, '黑客帝国');
    assert.strictEqual(page.data.form.duration_minutes, '136', '时长应为分钟数');
    assert.strictEqual(page.data.form.rating, '8.2');
    assert.strictEqual(page.data.form.director, '莉莉·沃卓斯基');
    assert.ok(page.data.form.genres.action, '动作类型应被选中');
    assert.ok(page.data.form.genres['sci-fi'], '科幻类型应被选中');
});

test('详情接口缺少 runtime 时不清空用户已填写的时长', async () => {
    const page = createPage();
    page.setData({
        form: { ...page.data.form, duration_minutes: '118' },
        tmdbResults: [{
            id: 603,
            title: '黑客帝国',
            genre: '',
            rating: null,
        }],
    });

    // 让详情请求返回缺少 runtime 的数据
    const originalRequest = global.wx.request;
    global.wx.request = (options) => options.success({ statusCode: 200, data: { credits: {} } });
    try {
        await page.handleTmdbPick({ currentTarget: { dataset: { index: 0 } } });
    } finally {
        global.wx.request = originalRequest;
    }

    assert.strictEqual(page.data.form.duration_minutes, '118');
});
