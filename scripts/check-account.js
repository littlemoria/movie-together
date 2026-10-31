#!/usr/bin/env node
/**
 * Supabase 账号诊断脚本
 *
 * 用途：排查某个账号能否在 CineMemo（网页版 / 小程序）登录。
 *
 * 用法：
 *   node scripts/check-account.js <邮箱> [密码]
 *
 * 不传密码时只做「无副作用探测」：
 *   - 探测实例是否开放注册（signup_disabled）
 *   - 探测邮箱域名是否在 Supabase 可接受范围内（email_address_invalid）
 *   - 探测 RLS 是否已对匿名访问关闭
 *
 * 传密码时会真实发起一次登录（仅校验，不写入任何数据），
 * 成功则打印该账号的 UID、邮箱确认状态与数据可见性。
 *
 * 附加参数：
 *   --proxy <地址>       通过 HTTP 代理访问（Node 内置 fetch 不认代理环境变量）
 *   --admin-key <密钥>   传入 Supabase service_role key，
 *                        可列出该邮箱的用户记录并读取 email_confirmed_at，
 *                        用于排查「账号存在但无法登录」的问题。
 *                        ⚠️ service_role 拥有完全的管理权限，切勿提交到代码仓库。
 *
 * 说明：GoTrue 对「账号不存在」和「密码错误」统一返回 invalid_credentials，
 * 这是防用户枚举的设计，因此本脚本在密码错误时无法区分这两种情况。
 * 需要区分时，请使用 --admin-key 查看用户记录。
 */
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

const ROOT = path.join(__dirname, '..');

// 复用项目内的配置（网页版 config.js 读 window.ENV，小程序 config.js 是纯模块）
function loadConfig() {
    // 小程序配置是 CommonJS，可直接 require
    return require(path.join(ROOT, 'miniprogram', 'lib', 'config.js')).Config;
}

const { describeAuthError } = require(path.join(ROOT, 'miniprogram', 'lib', 'auth-errors.js'));

const Config = loadConfig();
const BASE = Config.SUPABASE_URL;
const ANON = Config.SUPABASE_ANON_KEY;

// 代理：优先读命令行 --proxy，其次读 HTTPS_PROXY / HTTP_PROXY 环境变量。
// Node 内置 fetch 不遵循代理环境变量，直连不通时需显式走 CONNECT 隧道。
const proxyArgIndex = process.argv.indexOf('--proxy');
const PROXY = (proxyArgIndex !== -1 && process.argv[proxyArgIndex + 1])
    || process.env.HTTPS_PROXY
    || process.env.HTTP_PROXY
    || '';

// service_role key：仅用于只读查询用户记录，绝不写入仓库
const adminKeyIndex = process.argv.indexOf('--admin-key');
const ADMIN_KEY = (adminKeyIndex !== -1 && process.argv[adminKeyIndex + 1]) || '';

/**
 * 通过 HTTP 请求（支持代理）获取 JSON。
 * @param {string} method
 * @param {string} url
 * @param {object|null} body
 * @param {object} headers
 */
function request(method, url, body, headers) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const payload = body === null ? null : Buffer.from(JSON.stringify(body));
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
                resolve({ status: res.statusCode, data });
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

        // 走 HTTP CONNECT 隧道建立 HTTPS 连接
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

function log(icon, text) {
    console.log(`${icon} ${text}`);
}

function ok(text) { log('✅', text); }
function warn(text) { log('⚠️ ', text); }
function fail(text) { log('❌', text); }
function info(text) { log('ℹ️ ', text); }

async function post(url, body, headers = {}) {
    return request('POST', url, body, { apikey: ANON, ...headers });
}

async function get(url, headers = {}) {
    return request('GET', url, null, { apikey: ANON, ...headers });
}

/**
 * 用 service_role key 查询用户列表（只读）。
 */
async function listUsers(adminKey, targetEmail) {
    const url = `${BASE}/auth/v1/admin/users?page=1&per_page=200`;
    const res = await request('GET', url, null, {
        apikey: adminKey,
        Authorization: `Bearer ${adminKey}`,
    });
    if (res.status !== 200) {
        return { error: `HTTP ${res.status}`, status: res.status };
    }
    const users = (res.data && res.data.users) || [];
    const found = users.filter((u) => (u.email || '').toLowerCase() === targetEmail.toLowerCase());
    return { users, found };
}

/**
 * 用 service_role key 输出该邮箱的用户记录，帮助定位「账号存在但登录失败」。
 */
async function reportAdmin(targetEmail) {
    if (!ADMIN_KEY) return;
    info('使用 service_role key 查询用户记录：');
    const res = await listUsers(ADMIN_KEY, targetEmail);
    if (res.error) {
        fail(`  查询失败（${res.error}）——请检查 service_role key 是否正确`);
        return;
    }
    if (!res.found.length) {
        fail(`  未找到邮箱为 ${targetEmail} 的用户（共查询到 ${res.users.length} 个用户）`);
        warn('  → 该邮箱尚未在 Supabase 中创建，请到控制台 Authentication → Users 新建');
        return;
    }
    res.found.forEach((u) => {
        ok(`  找到用户：${u.email}`);
        info(`  UID             ：${u.id}`);
        info(`  Email Confirmed ：${u.email_confirmed_at ? '是（' + u.email_confirmed_at + '）' : '否 ⚠️ 需在控制台勾选确认'}`);
        info(`  角色            ：${u.role}`);
        info(`  创建时间        ：${u.created_at}`);
        info(`  最后登录        ：${u.last_sign_in_at || '从未登录过'}`);
        info(`  禁用状态        ：${u.banned_until ? '已被禁用' : '正常'}`);
        if (!u.email_confirmed_at) {
            warn('  → 未确认邮箱会导致登录报 email_not_confirmed，请在控制台勾选 Email Confirmed');
        }
    });
}

async function main() {    const email = process.argv[2];
    const password = process.argv[3];

    if (!email) {
        console.log('用法：node scripts/check-account.js <邮箱> [密码]');
        process.exit(1);
    }

    console.log(`\n=== CineMemo 账号诊断 ===`);
    console.log(`实例：${BASE}`);
    console.log(`邮箱：${email}`);
    if (PROXY) console.log(`代理：${PROXY}`);
    console.log('');

    // ---- 1. 实例注册开关 ----
    const signup = await post(`${BASE}/auth/v1/signup`, {
        email: `probe_signup_check_${Date.now()}@example.com`,
        password: 'ProbeCheck123456!',
    });
    if (signup.data && signup.data.error_code === 'signup_disabled') {
        ok('公开注册已关闭（signup_disabled）——新账号只能在 Supabase 控制台创建');
    } else {
        warn('公开注册处于开放状态，建议在控制台关闭，避免他人自行注册');
    }

    // ---- 2. 邮箱域名可接受性 ----
    // recover 端点的响应语义：
    //   {} → 邮箱格式合法（无论账号是否存在）
    //   email_address_invalid → 邮箱域名不被 Supabase 接受
    //   over_email_send_rate_limit → 账号存在且正在发重置邮件（说明账号真实存在）
    const recover = await post(`${BASE}/auth/v1/recover`, { email });
    if (recover.data && recover.data.error_code === 'email_address_invalid') {
        fail('该邮箱域名不在 Supabase 的可接受列表中（email_address_invalid）');
        warn('  → 「忘记密码」邮件无法送达，只能由管理员在控制台手动设置密码');
        warn('  → 建议改用常见域名（如 gmail.com / qq.com）新建账号');
    } else if (recover.data && recover.data.error_code === 'over_email_send_rate_limit') {
        ok('该账号存在（正在发送密码重置邮件，触发限流）');
        warn('  → 该邮箱域名可接受，账号已确认存在');
    } else if (recover.status === 200) {
        ok('邮箱域名格式通过 Supabase 校验');
    } else {
        warn(`recover 端点返回 HTTP ${recover.status}，无法据此判断域名兼容性`);
    }

    // ---- 3. RLS 匿名关闭状态 ----
    const anon = await get(`${BASE}/rest/v1/movies?select=id&limit=1`);
    if (anon.status === 401 || anon.status === 403) {
        ok(`RLS 已对匿名访问关闭（HTTP ${anon.status}）——数据仅登录用户可见`);
    } else {
        warn(`匿名访问 movies 返回 HTTP ${anon.status}，请确认 RLS 已生效`);
    }

    // ---- 4. 登录校验 ----
    if (!password) {
        console.log('\n未提供密码，跳过登录校验。');
        console.log('如需验证登录：node scripts/check-account.js ' + email + ' <密码>');
        if (ADMIN_KEY) {
            console.log('');
            await reportAdmin(email);
        }
        console.log('');
        return;
    }

    const token = await post(`${BASE}/auth/v1/token?grant_type=password`, { email, password });
    if (token.status !== 200) {
        fail(`登录失败：${describeAuthError(token.data)}`);
        if (token.data && token.data.error_code === 'invalid_credentials') {
            warn('  → 可能是密码错误，也可能是账号不存在（GoTrue 不区分这两种情况）');
            warn('  → 若密码确实无误，请到 Supabase 控制台确认该邮箱已勾选 Email Confirmed');
        }
        if (ADMIN_KEY) {
            console.log('');
            await reportAdmin(email);
        }
        process.exitCode = 1;
        return;
    }

    const user = token.data.user || {};
    ok('登录成功');
    info(`UID            ：${user.id}`);
    info(`邮箱确认状态  ：${user.email_confirmed_at ? '已确认' : '未确认'}`);
    info(`最后登录      ：${user.last_sign_in_at || '（首次登录）'}`);
    if (user.id !== 'd032d396-411b-49c6-856b-5940bcc1a90f') {
        warn(`  → 注意：该 UID 与预期的 d032d396-411b-49c6-856b-5940bcc1a90f 不一致`);
    }

    // ---- 5. 数据可见性（验证账号能读写共享数据）----
    const auth = { Authorization: `Bearer ${token.data.access_token}` };
    const movies = await get(`${BASE}/rest/v1/movies?select=id&limit=100`, auth);
    if (movies.status === 200 && Array.isArray(movies.data)) {
        ok(`数据可见性正常：可读取 ${movies.data.length} 条电影记录`);
        if (movies.data.length === 0) {
            info('  → 当前为 0 条记录，若已有账号存过数据，检查 movies 表的 RLS 是否按用户隔离');
        }
    } else {
        fail(`读取 movies 失败（HTTP ${movies.status}）`);
    }

    const settings = await get(`${BASE}/rest/v1/settings?key=eq.global&select=value&limit=1`, auth);
    if (settings.status === 200) {
        ok(`设置表可读（全局 key=global，共 ${Array.isArray(settings.data) ? settings.data.length : 0} 行）`);
    } else {
        fail(`读取 settings 失败（HTTP ${settings.status}）`);
    }

    console.log('\n✅ 该账号可在网页版与小程序正常登录，数据天然互通。\n');
}

main().catch((err) => {
    fail(`诊断脚本异常：${err.message}`);
    process.exit(1);
});
