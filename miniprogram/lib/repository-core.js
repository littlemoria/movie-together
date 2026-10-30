/**
 * Supabase 数据仓储核心（平台无关）。
 * 只负责传输、认证头和数据契约，不依赖 fetch/DOM/wx 等具体环境。
 * 网页版与小程序共用本文件；transport 由各自注入（浏览器用 fetch，小程序用 wx.request）。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else if (root) {
        const exported = factory();
        root.SupabaseRepository = exported.SupabaseRepository;
        root.DataError = exported.DataError;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Domain 依赖：浏览器全局或 CommonJS。
    const Domain = (typeof require === 'function')
        ? require('./domain.js')
        : (typeof globalThis !== 'undefined' ? globalThis.MovieDomain : null);

    class DataError extends Error {
        constructor(message, code, options = {}) {
            super(message);
            this.name = 'DataError';
            this.code = code;
            this.status = options.status || 0;
            this.details = options.details || null;
            this.cause = options.cause;
        }
    }

    function errorCodeForStatus(status) {
        if (status === 401) return 'AUTH_EXPIRED';
        if (status === 403) return 'PERMISSION_DENIED';
        if (status === 404) return 'NOT_FOUND';
        if (status === 409) return 'CONFLICT';
        if (status === 400 || status === 422) return 'INVALID_REQUEST';
        return 'HTTP_ERROR';
    }

    async function parseResponseBody(response) {
        if (response.status === 204) return null;
        const text = await response.text();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new DataError('服务返回了无法解析的数据', 'INVALID_RESPONSE', {
                status: response.status,
                cause: error,
            });
        }
    }

    class SupabaseRepository {
        constructor(options) {
            if (!options || !options.baseUrl || !options.anonKey) {
                throw new DataError('Supabase 配置不完整', 'CONFIG_ERROR');
            }
            if (!options.transport) {
                throw new DataError('缺少 transport 适配器', 'CONFIG_ERROR');
            }
            this.baseUrl = options.baseUrl.replace(/\/$/, '');
            this.anonKey = options.anonKey;
            this.getAccessToken = options.getAccessToken || (async () => null);
            this.transport = options.transport;
        }

        async request(path, options = {}) {
            let token = null;
            try {
                token = await this.getAccessToken();
            } catch (error) {
                throw new DataError('无法读取登录状态', 'AUTH_UNAVAILABLE', { cause: error });
            }
            if (!token) throw new DataError('请先登录', 'AUTH_REQUIRED');

            const headers = {
                apikey: this.anonKey,
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                ...(options.headers || {}),
            };
            const request = {
                url: `${this.baseUrl}/rest/v1${path}`,
                method: options.method || 'GET',
                headers,
            };
            if (options.body !== undefined) {
                headers['Content-Type'] = 'application/json';
                request.body = JSON.stringify(options.body);
            }
            if (options.prefer) headers.Prefer = options.prefer;

            let response;
            try {
                response = await this.transport(request);
            } catch (error) {
                if (error instanceof DataError) throw error;
                throw new DataError('网络连接失败', 'NETWORK_ERROR', { cause: error });
            }

            let data;
            try {
                data = await parseResponseBody(response);
            } catch (error) {
                if (!response.ok) data = null;
                else throw error;
            }
            if (!response.ok) {
                throw new DataError(
                    (data && (data.message || data.error_description || data.hint)) || `请求失败（${response.status}）`,
                    errorCodeForStatus(response.status),
                    { status: response.status, details: data }
                );
            }
            return data;
        }

        async listMovies() {
            const data = await this.request('/movies?select=*&order=watch_date.desc');
            if (!Array.isArray(data)) throw new DataError('电影列表格式无效', 'INVALID_RESPONSE');
            return data.map(Domain.normalizeMovie);
        }

        async saveMovie(input, id = null) {
            const payload = Domain.toMoviePayload(input);
            const isUpdate = id !== null && id !== undefined && id !== '';
            const path = isUpdate ? `/movies?id=eq.${encodeURIComponent(id)}` : '/movies';
            const data = await this.request(path, {
                method: isUpdate ? 'PATCH' : 'POST',
                body: payload,
                prefer: 'return=representation',
            });
            const movie = Array.isArray(data) ? data[0] : data;
            if (!movie) {
                throw new DataError('记录不存在或已被删除', 'NOT_FOUND', { status: 404 });
            }
            return Domain.normalizeMovie(movie);
        }

        async deleteMovie(id) {
            if (id === null || id === undefined || id === '') {
                throw new DataError('缺少要删除的记录 ID', 'VALIDATION_ERROR');
            }
            await this.request(`/movies?id=eq.${encodeURIComponent(id)}`, {
                method: 'DELETE',
                prefer: 'return=minimal',
            });
            return true;
        }

        async getSettings() {
            const data = await this.request('/settings?key=eq.global&select=value&limit=1');
            if (!Array.isArray(data)) throw new DataError('云端设置格式无效', 'INVALID_RESPONSE');
            return data.length ? Domain.parseSettingsValue(data[0].value) : Domain.normalizeSettings();
        }

        async saveSettings(input) {
            const settings = Domain.normalizeSettings(input);
            await this.request('/settings', {
                method: 'POST',
                body: { key: 'global', value: JSON.stringify(settings) },
                prefer: 'resolution=merge-duplicates,return=minimal',
            });
            return settings;
        }
    }

    return { SupabaseRepository, DataError };
});
