#!/usr/bin/env node
/**
 * 「想看列表」双端同步 —— 真实云端联调验证
 *
 * 为什么需要它：想看清单不进 movies 表，只存在 settings.value 的 wishlist 字段里，
 * 而且在 Supabase 里是**一行全局记录**（key='global'），RLS 只按「是否登录」放行。
 * 也就是说，写入会直接改动线上真实数据，必须「先快照、后验证、最后原样还原」。
 *
 * 验证内容（两端各用一个客户端，共享同一 Supabase 项目）：
 *   1. 小程序写入 → 网页读取（小程序 addToWishlist + saveSettings → 网页 fetchCloudSettings）
 *   2. 网页写入 → 小程序读取（网页 saveCloudSettings → 小程序 fetchSettings + loadMovies）
 *   3. 一端删除 → 另一端不再出现
 *   4. settings 表 key 是否有唯一约束（缺失会让 upsert 变成追加行，导致「想看永不更新」）
 *
 * 安全边界：
 *   - 不做任何 movies 表写操作，只在结束时比对条数未变。
 *   - 只动 settings 里本轮新增的条目，结束时把 settings 按快照逐行还原。
 *   - 不接收、不打印、不落盘 service_role key；密码只在本进程内存中使用。
 *
 * 用法：
 *   SYNC_EMAIL=you@example.com SYNC_PASSWORD='***' node scripts/verify-wishlist-sync.js
 *   node scripts/verify-wishlist-sync.js --email you@example.com --password '***'
 *   node scripts/verify-wishlist-sync.js ... --proxy http://127.0.0.1:7890
 *
 * 退出码：0 全部通过；1 有断言失败或还原失败。
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- 环境与参数

function argOf(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '';
}

const EMAIL = argOf('email') || process.env.SYNC_EMAIL || '';
const PASSWORD = argOf('password') || process.env.SYNC_PASSWORD || '';
const PROXY = argOf('proxy') || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';

const Config = require(path.join(ROOT, 'miniprogram', 'lib', 'config.js')).Config;
const BASE = Config.SUPABASE_URL;
const ANON = Config.SUPABASE_ANON_KEY;

// ---------------------------------------------------------------- HTTP 传输
// 与 scripts/check-account.js 相同的实现：Node 内置 fetch 不认代理环境变量，
// 直连不通时需要显式 CONNECT 隧道，故这里用 https 模块手写。

function requestOnce(method, url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        // 允许传入已序列化的字符串体（wx.request 适配器就是这种用法），避免二次转义。
        const payload = body === null || body === undefined
            ? null
            : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
        const finalHeaders = { ...headers };
        if (payload) {
            finalHeaders['Content-Type'] = 'application/json';
            finalHeaders['Content-Length'] = payload.length;
        }

        const handleResponse = (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
                resolve({ status: res.statusCode, data, text });
            });
        };

        if (!PROXY) {
            const mod = target.protocol === 'https:' ? https : http;
            const req = mod.request(url, { method, headers: finalHeaders }, handleResponse);
            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
            return;
        }

        const proxy = new URL(PROXY);
        const proxyReq = http.request({
            host: proxy.hostname,
            port: proxy.port || 80,
            method: 'CONNECT',
            path: `${target.hostname}:${target.port || 443}`,
            headers: { Host: `${target.hostname}:${target.port || 443}` },
        });

        proxyReq.on('connect', (res, socket) => {
            if (res.statusCode !== 200) {
                socket.destroy();
                reject(new Error(`代理 CONNECT 失败：HTTP ${res.statusCode}`));
                return;
            }
            const req = https.request({
                socket,
                agent: false,
                method,
                path: target.pathname + target.search,
                hostname: target.hostname,
                // 走隧道时必须显式给 SNI，否则握手会被服务端直接断开
                servername: target.hostname,
                // 实测本机代理对 TLS1.3 会偶发在握手阶段断连（CONNECT 已 200 后 socket 被关），
                // 固定 TLS1.2 后连续 6 次全部成功；Supabase 也支持 1.2。
                maxVersion: 'TLSv1.2',
                headers: { ...finalHeaders, Host: target.host },
            }, handleResponse);
            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });

        proxyReq.on('error', reject);
        proxyReq.end();
    });
}

// 本机代理出口到 Supabase 会偶发在 TLS 握手阶段被断开（CONNECT 已 200，随后 socket 被对端关闭）。
// 这类失败发生在请求发出之前，重试是安全的；HTTP 层的错误响应一律不重试。
const TRANSIENT = /socket disconnected|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|handshake|socket hang up/i;
const DEBUG = process.argv.includes('--debug');

async function request(method, url, body, headers = {}) {
    const maxAttempts = 6;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const res = await requestOnce(method, url, body, headers);
            if (DEBUG) {
                const short = url.replace(BASE, '').slice(0, 90);
                console.log(`   · ${method} ${short} → ${res.status}`);
            }
            return res;
        } catch (error) {
            lastError = error;
            if (DEBUG) console.log(`   · ${method} ${url.replace(BASE, '').slice(0, 90)} ✗ 第 ${attempt} 次：${error.message}`);
            if (!TRANSIENT.test(String(error && error.message)) || attempt === maxAttempts) throw error;
            await new Promise((r) => setTimeout(r, 250 * attempt));
        }
    }
    throw lastError;
}

function log(icon, text) { console.log(`${icon} ${text}`); }
const ok = (t) => log('✅', t);
const bad = (t) => log('❌', t);
const info = (t) => log('ℹ️ ', t);
const warn = (t) => log('⚠️ ', t);

// ---------------------------------------------------------------- 断言

const failures = [];
let checked = 0;
function check(condition, label, detail) {
    checked += 1;
    if (condition) {
        ok(label);
        return true;
    }
    bad(label + (detail === undefined ? '' : `　→ ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
    failures.push(label);
    return false;
}

// ---------------------------------------------------------------- Supabase 直连

let TOKEN = null;

async function signIn(email, password) {
    const res = await request(
        'POST',
        `${BASE}/auth/v1/token?grant_type=password`,
        { email, password, gotrue_meta: {} },
        { apikey: ANON }
    );
    if (res.status !== 200) {
        const payload = res.data || {};
        throw new Error(
            `登录失败（HTTP ${res.status}）：${payload.error_description || payload.msg || payload.error || '未知错误'}`
        );
    }
    return res.data;
}

function rest(pathAndQuery, { method = 'GET', body = null, prefer } = {}) {
    const headers = { apikey: ANON, Authorization: `Bearer ${TOKEN}` };
    if (prefer) headers.Prefer = prefer;
    return request(method, `${BASE}/rest/v1/${pathAndQuery}`, body, headers);
}

async function readSettingsRows() {
    const res = await rest('settings?select=key,value');
    if (res.status !== 200) throw new Error(`读取 settings 失败：HTTP ${res.status} ${String(res.text).slice(0, 200)}`);
    return Array.isArray(res.data) ? res.data : [];
}

/**
 * 取「实际生效」的那一行：读取端用 limit=1，PostgREST 未指定排序，
 * 所以只要出现多行就可能读到任意一行——这正是「写了但读不到」的成因。
 */
function describeRows(rows) {
    return rows.map((r, i) => {
        let wishlist = [];
        try { wishlist = JSON.parse(r.value).wishlist || []; } catch (e) { /* ignore */ }
        return `#${i + 1} key=${r.key} value=${String(r.value).length}字符 想看=${wishlist.length}条 ${wishlist.map((w) => w.movie_name).join('、')}`;
    });
}

async function countMovies() {
    const res = await rest('movies?select=id');
    if (res.status !== 200) return null;
    return Array.isArray(res.data) ? res.data.length : null;
}

// ---------------------------------------------------------------- 小程序端（真实代码 + wx 适配）

function installWxShim() {    const storage = new Map();
    global.wx = {
        getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
        setStorageSync: (k, v) => { storage.set(k, v); },
        removeStorageSync: (k) => { storage.delete(k); },
        request({ url, method = 'GET', header = {}, data, success, fail }) {
            const hasBody = method !== 'GET' && data !== undefined && data !== null;
            const body = hasBody
                ? (typeof data === 'string' ? data : JSON.stringify(data))
                : null;
            // 复用带代理支持的 request()，body 已是字符串则按其原样发送。
            request(method, url, body, header)
                .then((res) => {
                    success && success({ statusCode: res.status, data: res.data });
                })
                .catch((err) => {
                    fail && fail({ errMsg: err.message });
                });
        },
        showToast() {},
        showModal() {},
        navigateTo() {},
        switchTab() {},
        reLaunch() {},
    };
    return storage;
}

// ---------------------------------------------------------------- 网页端（vm 加载真实 js/api.js）

/**
 * 网页仓储的默认 transport 是 `fetch(url, init)`，而 Node 内置 fetch 不认代理，
 * 本机直连 Supabase 又不通，所以这里用同一个 request() 包一层，保持 Response 形状。
 */
async function proxyFetch(url, init = {}) {
    const headers = init.headers || {};
    const res = await request(init.method || 'GET', url, init.body === undefined ? null : init.body, headers);
    return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        text: async () => (res.text === undefined || res.text === null ? '' : res.text),
        json: async () => res.data,
    };
}

function loadWebAPI(session) {
    // js/repository.js 在 host 领域被 require，它的默认 transport 用的是宿主全局 fetch，
    // vm 里传入的 fetch 管不到它。这里直接把宿主 fetch 换成走代理的版本。
    global.fetch = (url, init) => proxyFetch(url, init);

    const { Store } = require(path.join(ROOT, 'js', 'store.js'));
    const MovieDomain = require(path.join(ROOT, 'js', 'domain.js'));
    const repoModule = require(path.join(ROOT, 'js', 'repository.js'));
    const storage = {};

    const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        Promise,
        Store,
        MovieDomain,
        SupabaseRepository: repoModule.SupabaseRepository,
        DataError: repoModule.DataError,
        // api.js 只用到 client.auth.getSession()，用最小 shim 顶替 supabase-js
        window: {
            supabase: {
                createClient: () => ({
                    auth: {
                        getSession: async () => ({ data: { session }, error: null }),
                        signInWithPassword: async () => ({ data: { session }, error: null }),
                        signOut: async () => ({ error: null }),
                        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    },
                }),
            },
        },
        Config: {
            SUPABASE_URL: Config.SUPABASE_URL,
            SUPABASE_KEY: Config.SUPABASE_ANON_KEY,
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
        navigator: { onLine: true },
        localStorage: {
            getItem: (k) => (storage[k] === undefined ? null : storage[k]),
            setItem: (k, v) => { storage[k] = v; },
            removeItem: (k) => { delete storage[k]; },
        },
        fetch: proxyFetch,
        Cache: undefined,
        Sync: undefined,
        Backup: undefined,
        Utils: { showToast() {} },
        Logger: { info() {}, error() {}, warn() {} },
    });

    const API = vm.runInContext(
        `${fs.readFileSync(path.join(ROOT, 'js', 'api.js'), 'utf8')}\n;API;`,
        context
    );
    return { API, Store };
}

// ---------------------------------------------------------------- 主流程

const PROBE_TMDB_ID = 987654321;      // 明显是假 ID，绝不与真实影片冲突
const PROBE_NAME = '联调验证-请忽略A';
const PROBE_NAME_B = '联调验证-请忽略B';

async function main() {
    if (!EMAIL || !PASSWORD) {
        console.log('');
        console.log('缺少登录凭据。请用下面任一方式提供：');
        console.log('');
        console.log("  SYNC_EMAIL='you@example.com' SYNC_PASSWORD='***' node scripts/verify-wishlist-sync.js");
        console.log('');
        console.log("  node scripts/verify-wishlist-sync.js --email you@example.com --password '***'");
        console.log('');
        console.log('直连不通时加 --proxy http://127.0.0.1:7890（或设置 HTTPS_PROXY）。');
        process.exitCode = 2;
        return;
    }

    info(`Supabase 项目：${BASE}`);
    info(`使用账号：${EMAIL}`);

    // 1) 登录（原始 token 供直连与网页端 shim 共用）
    const session = await signIn(EMAIL, PASSWORD);
    TOKEN = session.access_token;
    ok(`登录成功（uid=${session.user && session.user.id}）`);

    // 2) 快照线上真实数据
    const snapshot = await readSettingsRows();
    global.__wbSnapshot = snapshot; // 供异常分支还原
    const moviesBefore = await countMovies();
    info(`settings 现有 ${snapshot.length} 行；movies 现有 ${moviesBefore === null ? '?' : moviesBefore} 条`);
    describeRows(snapshot).forEach((line) => info(`  ${line}`));
    if (snapshot.length > 1) {
        warn('settings 存在多行，读取端只取首行，可能已是脏数据（本轮会原样还原，不清理）。');
    }

    // 只读诊断：--dump 打印完现状就退出，不写任何数据
    if (process.argv.includes('--dump')) {
        info('只读诊断模式，未做任何写入。');
        return;
    }

    const snapshotKeys = new Set(snapshot.map((r) => r.key));
    const baselineWishlist = parseWishlist(snapshot);
    info(`云端当前想看 ${baselineWishlist.length} 条`);

    // 3) 小程序客户端
    installWxShim();
    const miniAuth = require(path.join(ROOT, 'miniprogram', 'lib', 'auth.js'));
    const miniService = require(path.join(ROOT, 'miniprogram', 'lib', 'service.js'));
    const { Store: MiniStore } = require(path.join(ROOT, 'miniprogram', 'lib', 'store.js'));

    // 小程序仓储从 wx 本地存储的 session 取 token，这里等价于 App.onLaunch 的登录态恢复。
    miniAuth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user,
    });
    MiniStore.setSession(session);
    await miniService.fetchSettings();
    ok('小程序端读取云端设置（fetchSettings）');

    // 4) 小程序加入想看 → 直连校验是否真的写进云端
    const addedMini = await miniService.addToWishlist({
        id: PROBE_TMDB_ID,
        title: PROBE_NAME,
        poster_path: null,
        year: '2001',
        vote_average: 8.1,
    });
    // addToWishlist 无论保存成败都返回 ok:true（真实代码如此），
    // 所以必须展开 result 才能看到 saveSettings 的真实结果。
    const miniSave = addedMini && addedMini.result;
    check(addedMini.ok === true, '小程序 addToWishlist 返回成功', addedMini.message);
    check(
        miniSave && miniSave.ok === true,
        '小程序 saveSettings 上传成功',
        miniSave && miniSave.error ? `${miniSave.error.code}: ${miniSave.error.message}` : miniSave
    );
    check(
        MiniStore.getWishlist().some((m) => m.tmdb_id === PROBE_TMDB_ID),
        '小程序本地清单已包含该片'
    );

    const afterMiniWrite = await readSettingsRows();
    describeRows(afterMiniWrite).forEach((line) => info(`  ${line}`));
    check(
        anyRowHas(afterMiniWrite, (w) => w.tmdb_id === PROBE_TMDB_ID),
        '【方向1】小程序写入后，云端 settings 中确实出现该片',
        `共 ${afterMiniWrite.length} 行`
    );
    check(
        parseWishlist(afterMiniWrite).some((w) => w.tmdb_id === PROBE_TMDB_ID),
        '【方向1】读取端（首行）能看到这条记录',
        `共 ${afterMiniWrite.length} 行`
    );

    // 5) 网页端读取（验证「小程序加 → 网页可见」）
    const web = loadWebAPI(session);
    web.Store.resetPrivateData();
    web.Store.setSession(session);
    const fetched = await web.API.fetchCloudSettings();
    check(!!fetched, '网页 fetchCloudSettings 返回设置');
    check(
        web.Store.getWishlist().some((m) => m.tmdb_id === PROBE_TMDB_ID),
        '【方向1】网页端能从云端读到小程序刚加的想看',
        web.Store.getWishlist().map((m) => m.movie_name)
    );

    // 6) 网页端加入想看 → 小程序重新拉取（验证「网页加 → 小程序可见」）
    web.Store.upsertMovie({
        id: `wl_web_${Date.now()}`,
        movie_name: PROBE_NAME_B,
        tmdb_id: PROBE_TMDB_ID + 1,
        poster_path: null,
        year: '2002',
        rating: 7.4,
        added_at: new Date().toISOString(),
        watch_date: new Date().toISOString().split('T')[0],
        status: 'wishlist',
    }, { prepend: false });
    const savedWeb = await web.API.saveCloudSettings();
    check(savedWeb && savedWeb.ok === true, '网页 saveCloudSettings 返回成功', savedWeb && savedWeb.error);

    MiniStore.resetPrivateData();
    MiniStore.setSession(session);
    await miniService.fetchSettings();
    await miniService.loadMovies();
    const miniWishlist = MiniStore.getWishlist();
    check(
        miniWishlist.some((m) => m.tmdb_id === PROBE_TMDB_ID + 1),
        '【方向2】小程序端能读到网页刚加的想看',
        miniWishlist.map((m) => m.movie_name)
    );
    check(
        miniWishlist.some((m) => m.tmdb_id === PROBE_TMDB_ID),
        '【方向2】小程序重新拉取后，先前那条想看没有被覆盖丢失'
    );

    // 7) 一端删除 → 另一端消失
    const probeLocal = MiniStore.getWishlist().find((m) => m.tmdb_id === PROBE_TMDB_ID);
    if (probeLocal) await miniService.removeFromWishlist(probeLocal.id);
    const afterDelete = parseWishlist(await readSettingsRows());
    check(
        !afterDelete.some((w) => w.tmdb_id === PROBE_TMDB_ID),
        '【方向3】小程序删除后，云端已无该片'
    );
    await web.API.fetchCloudSettings();
    check(
        !web.Store.getWishlist().some((m) => m.tmdb_id === PROBE_TMDB_ID),
        '【方向3】网页端刷新后同步消失'
    );
    check(
        web.Store.getWishlist().some((m) => m.tmdb_id === PROBE_TMDB_ID + 1),
        '【方向3】删除未误伤另一条想看'
    );

    // 8) 写设置契约探测：复刻 saveSettings 的请求（POST + on_conflict=key + merge-duplicates），
    //    连发两次同 key，确认被合并成一行而不是追加/报 409。
    const probeKey = `__wb_probe_${Date.now()}`;
    const probePrefer = 'resolution=merge-duplicates,return=minimal';
    const p1 = await rest('settings?on_conflict=key', {
        method: 'POST', body: { key: probeKey, value: '{}' }, prefer: probePrefer,
    });
    const p2 = await rest('settings?on_conflict=key', {
        method: 'POST', body: { key: probeKey, value: '{"n":2}' }, prefer: probePrefer,
    });
    const probeRows = await rest(`settings?key=eq.${encodeURIComponent(probeKey)}&select=key`);
    const probeCount = Array.isArray(probeRows.data) ? probeRows.data.length : -1;
    info(`写设置契约探测：第1次 HTTP ${p1.status}，第2次 HTTP ${p2.status}，同 key 现有 ${probeCount} 行`);
    check(
        probeCount === 1 && p2.status >= 200 && p2.status < 300,
        'settings upsert 契约正常（同 key 合并为一行，不再 409）',
        `probeCount=${probeCount}, HTTP ${p2.status} ${String(p2.text).slice(0, 120)}`
    );
    await rest(`settings?key=eq.${encodeURIComponent(probeKey)}`, { method: 'DELETE' });

    // 9) 还原线上数据
    await restore(snapshot);
    const restored = await readSettingsRows();
    check(
        JSON.stringify(normalizeRows(restored)) === JSON.stringify(normalizeRows(snapshot)),
        '线上 settings 已逐行还原到验证前状态',
        { before: normalizeRows(snapshot).map((r) => r.key), after: normalizeRows(restored).map((r) => r.key) }
    );
    const moviesAfter = await countMovies();
    check(moviesBefore === moviesAfter, 'movies 表条数未变化（本验证不写观影记录）', `${moviesBefore} → ${moviesAfter}`);

    // 10) 汇总
    console.log('');
    if (failures.length === 0) {
        ok(`全部 ${checked} 项断言通过。两端读写与删除方向均正常。`);
    } else {
        bad(`有 ${failures.length} 项未通过：`);
        failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        process.exitCode = 1;
    }
}

function parseWishlist(rows, index = 0) {
    const row = rows[index];
    if (!row) return [];
    try {
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed.wishlist) ? parsed.wishlist : [];
    } catch (e) {
        return [];
    }
}

// 任一行含有 → 至少写成功了；首行含有 → 读取端能看到。
function anyRowHas(rows, predicate) {
    return rows.some((r) => {
        try {
            const list = JSON.parse(r.value).wishlist || [];
            return list.some(predicate);
        } catch (e) {
            return false;
        }
    });
}

function normalizeRows(rows) {
    return [...rows]
        .map((r) => ({ key: r.key, value: r.value }))
        .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

async function restore(snapshot) {
    if (!TOKEN) return;
    const snapshotKeys = new Set(snapshot.map((r) => r.key));
    const current = await readSettingsRows();

    // 删掉本轮多出来的行
    for (const row of current) {
        if (!snapshotKeys.has(row.key)) {
            await rest(`settings?key=eq.${encodeURIComponent(row.key)}`, { method: 'DELETE' });
        }
    }
    // 逐行写回原值
    for (const row of snapshot) {
        await rest(`settings?key=eq.${encodeURIComponent(row.key)}`, {
            method: 'PATCH',
            body: { value: row.value },
            prefer: 'return=minimal',
        });
    }
    info('已将 settings 写回快照值');
}

main().catch(async (error) => {
    bad(`执行中断：${error && error.message}`);
    try {
        // 尽力还原，避免把验证数据留在线上
        const snapshot = global.__wbSnapshot;
        if (snapshot) await restore(snapshot);
    } catch (e) { /* ignore */ }
    process.exitCode = 1;
});
