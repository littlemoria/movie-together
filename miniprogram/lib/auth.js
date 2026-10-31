/**
 * 小程序认证：沿用 Supabase 邮箱 + 密码登录。
 * 直接调 Supabase Auth 的 REST 端点（/auth/v1/token），与网页版 signInWithPassword 走同一套账号。
 * 会话缓存在 wx 本地存储，冷启动可恢复。
 */
const { Config } = require('./config.js');
const { describeAuthError } = require('./auth-errors.js');

const SESSION_KEY = 'cinememo_session';

function requestAuth(path, body) {
    return new Promise((resolve, reject) => {
        // Supabase GoTrue 的 grant_type 必须通过 URL query 传递（?grant_type=password），
        // body 只放 email/password。Content-Type 为 JSON 时 wx.request 自动序列化对象 data。
        const separator = path.includes('?') ? '&' : '?';
        const url = `${Config.SUPABASE_URL}/auth/v1/${path}${separator}grant_type=password`;
        wx.request({
            url,
            method: 'POST',
            header: {
                apikey: Config.SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
            },
            data: body,
            success(res) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res.data);
                } else {
                    // 统一转成可读中文提示，原始错误码保留在 error.code 上便于排查
                    const payload = res.data || {};
                    const message = describeAuthError({
                        error_code: payload.error_code || payload.code,
                        msg: payload.msg || payload.error_description || payload.message,
                    });
                    const error = new Error(message);
                    error.code = payload.error_code || payload.code || '';
                    reject(error);
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '网络请求失败'));
            },
        });
    });
}

function getSession() {
    try {
        return wx.getStorageSync(SESSION_KEY) || null;
    } catch (e) {
        return null;
    }
}

function setSession(session) {
    try {
        if (session) {
            wx.setStorageSync(SESSION_KEY, session);
        } else {
            wx.removeStorageSync(SESSION_KEY);
        }
    } catch (e) {
        // 存储失败不影响内存会话。
    }
}

async function login(email, password) {
    const data = await requestAuth('token', {
        email,
        password,
        gotrue_meta: {},
    });
    const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        user: data.user,
    };
    setSession(session);
    return session;
}

async function logout() {
    setSession(null);
}

module.exports = { getSession, setSession, login, logout };
