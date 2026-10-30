/**
 * 小程序数据仓储：复用网页版 SupabaseRepository 的传输、认证头与错误映射逻辑，
 * 仅将默认 transport 替换为 wx.request 适配器。
 */
const Domain = require('./domain.js');
const { Config } = require('./config.js');
const { getSession } = require('./auth.js');

// 复用网页版 repository.js 的 SupabaseRepository / DataError 类。
const repositoryFactory = require('./repository-core.js');
const { SupabaseRepository, DataError } = repositoryFactory;

/**
 * 将仓储的 fetch 风格请求转换为 wx.request。
 * 请求对象：{ url, method, headers, body }
 * 返回对象需满足 { ok, status, text() }。
 */
function wxTransport(request) {
    return new Promise((resolve, reject) => {
        wx.request({
            url: request.url,
            method: request.method || 'GET',
            header: request.headers,
            data: request.body,
            success(res) {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    text: () => Promise.resolve(
                        typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
                    ),
                });
            },
            fail(err) {
                reject(new DataError(err.errMsg || '网络请求失败', 'NETWORK_ERROR'));
            },
        });
    });
}

let repository = null;

function getRepository() {
    if (repository) return repository;

    if (!Config.SUPABASE_URL || !Config.SUPABASE_ANON_KEY) {
        throw new DataError('Supabase 配置不完整，请检查 lib/config.js', 'CONFIG_ERROR');
    }

    repository = new SupabaseRepository({
        baseUrl: Config.SUPABASE_URL,
        anonKey: Config.SUPABASE_ANON_KEY,
        getAccessToken: async () => {
            const session = getSession();
            return session && session.access_token ? session.access_token : null;
        },
        transport: wxTransport,
    });

    return repository;
}

module.exports = { getRepository, DataError, wxTransport };
