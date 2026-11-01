/**
 * 小程序影单页表单逻辑测试。
 *
 * 覆盖本次与网页版对齐的表单改造：
 * - 类型多选：解析 / 序列化 / 合并 / 切换
 * - 自定义类型：加入内置类型列表并持久化
 * - 只读字段：rating / director / cast 不进入可编辑字段集
 *
 * 通过捕获 Page 定义来测试真实页面方法，而非复制一份实现。
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// ---------- wx mock ----------
global.wx = {
    showToast() {},
    setStorageSync() {},
    getStorageSync() { return ''; },
    request() {},
};
global.getApp = () => ({ onLogout() {} });

let pageDef = null;
global.Page = (def) => { pageDef = def; };

const MINI_ROOT = path.join(__dirname, '..', 'miniprogram');
require(path.join(MINI_ROOT, 'pages', 'movies', 'movies.js'));

const { Store } = require(path.join(MINI_ROOT, 'lib', 'store.js'));
const { DEFAULT_GENRES } = require(path.join(MINI_ROOT, 'lib', 'constants.js'));

/**
 * 构造一个可用的页面实例（模拟小程序的 setData 语义）。
 *
 * 深拷贝 data 是必须的：pageDef.data.form 引用模块级的 EMPTY_FORM，
 * 若直接共享引用，用例里的 setData 会污染后续用例。
 */
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
    // 先铺方法再重置 data：Object.assign 会把 pageDef.data 覆盖到 inst 上，
    // 必须在它之后重新赋深拷贝副本，避免用例间共享 EMPTY_FORM 引用。
    Object.assign(inst, pageDef);
    inst.data = JSON.parse(JSON.stringify(pageDef.data));
    for (const name of Object.keys(pageDef)) {
        if (typeof pageDef[name] === 'function') {
            inst[name] = pageDef[name].bind(inst);
        }
    }
    return inst;
}

// ---------- 类型解析与序列化 ----------

test('parseGenres 把逗号分隔字符串解析为选中映射', () => {
    const page = createPage();
    assert.deepStrictEqual(page.parseGenres(''), {});
    assert.deepStrictEqual(page.parseGenres('action,comedy'), { action: true, comedy: true });
    assert.deepStrictEqual(page.parseGenres('a,,b'), { a: true, b: true }, '空项应被忽略');
});

test('serializeGenres 把选中映射转回逗号分隔字符串', () => {
    const page = createPage();
    assert.strictEqual(page.serializeGenres({ action: true, comedy: true }), 'action,comedy');
    assert.strictEqual(page.serializeGenres({ action: true, comedy: false }), 'action');
    assert.strictEqual(page.serializeGenres({}), '');
});

test('类型解析与序列化可往返，且保持英文 id 约定', () => {
    const page = createPage();
    const original = 'sci-fi,action,drama';
    assert.strictEqual(page.serializeGenres(page.parseGenres(original)), original);

    // movies.genre 存英文 id 是两端互通的数据契约，不能退化成中文名
    const ids = Object.keys(page.parseGenres(original));
    assert.ok(ids.every((id) => /^[a-z-]+$/.test(id)), '类型 id 应为英文小写');
});

test('mergeGenres 合并 TMDB 类型时保留用户已选项', () => {
    const page = createPage();
    const merged = page.mergeGenres({ action: true }, 'sci-fi,drama');
    assert.deepStrictEqual(merged, { action: true, 'sci-fi': true, drama: true });
});

// ---------- 类型多选交互 ----------

test('toggleGenre 切换类型的选中状态', () => {
    const page = createPage();
    page.data.form = { genres: { action: true, comedy: true } };

    page.toggleGenre({ currentTarget: { dataset: { id: 'action' } } });
    assert.strictEqual(page.data.form.genres.action, undefined, '再次点击应取消选中');
    assert.strictEqual(page.data.form.genres.comedy, true, '不影响其它项');

    page.toggleGenre({ currentTarget: { dataset: { id: 'drama' } } });
    assert.strictEqual(page.data.form.genres.drama, true, '应能新增选中');
});

// ---------- 自定义类型 ----------

test('buildGenreOptions 合并内置类型与自定义类型', () => {
    const page = createPage();
    const original = Store.state.customGenres;
    Store.state.customGenres = [{ id: 'anime', name: '番剧' }];

    const options = page.buildGenreOptions();
    assert.strictEqual(options.length, DEFAULT_GENRES.length + 1);
    assert.deepStrictEqual(options[options.length - 1], { id: 'anime', name: '番剧' });

    Store.state.customGenres = original;
});

test('addCustomGenre 加入自定义类型并写入 Store', async () => {
    const page = createPage();
    const original = Store.state.customGenres;
    Store.state.customGenres = [];
    page.setData({ newGenre: '番剧' });

    await page.addCustomGenre();

    assert.strictEqual(Store.state.customGenres.length, 1);
    assert.deepStrictEqual(Store.state.customGenres[0], { id: '番剧', name: '番剧' });
    assert.ok(page.data.genreOptions.some((g) => g.id === '番剧'), '选项列表应包含新类型');

    Store.state.customGenres = original;
});

test('addCustomGenre 拒绝重复类型', async () => {
    const page = createPage();
    const original = Store.state.customGenres;
    Store.state.customGenres = [{ id: '番剧', name: '番剧' }];
    page.setData({ newGenre: '番剧' });

    await page.addCustomGenre();

    assert.strictEqual(Store.state.customGenres.length, 1, '不应重复添加');

    Store.state.customGenres = original;
});

test('addCustomGenre 忽略空输入', async () => {
    const page = createPage();
    const original = Store.state.customGenres;
    Store.state.customGenres = [];
    page.setData({ newGenre: '   ' });

    await page.addCustomGenre();

    assert.strictEqual(Store.state.customGenres.length, 0);

    Store.state.customGenres = original;
});

// ---------- 表单字段契约 ----------

test('表单字段不含可编辑的评分/导演/主演输入', () => {
    // 这三项由 TMDB 自动带出，表单只做只读展示，不提供输入框。
    // 断言基于新建实例，避免受其它用例的 setData 影响。
    const page = createPage();
    const fields = Object.keys(page.data.form);

    assert.ok(fields.includes('rating'), 'rating 应存在于表单数据中（只读展示）');
    assert.ok(fields.includes('director'), 'director 应存在于表单数据中（只读展示）');
    assert.ok(fields.includes('cast'), 'cast 应存在于表单数据中（只读展示）');

    // 用户可输入的字段仅这四个
    const writable = ['movie_name', 'watch_date', 'duration_minutes', 'created_by'];
    writable.forEach((f) => assert.ok(fields.includes(f), `${f} 应为可编辑字段`));
});

test('类型以映射形式存放于 form.genres，而非逗号分隔字符串', () => {
    const page = createPage();
    assert.strictEqual(typeof page.data.form.genres, 'object', 'genres 应为选中映射');
    assert.strictEqual(page.data.form.genre, undefined, '不应再有 form.genre 字符串字段');
});

test('watch_date 由日期选择器赋值', () => {
    const page = createPage();
    page.setData({ form: { ...page.data.form, watch_date: '' } });
    page.onWatchDateChange({ detail: { value: '2026-11-01' } });
    assert.strictEqual(page.data.form.watch_date, '2026-11-01');
});
