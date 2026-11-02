/**
 * 小程序应用服务：协调仓储、状态与设置同步。
 * 对应网页版 js/api.js 的职责划分，差异在于无离线队列（小程序无 IndexedDB）。
 */
const { getRepository, DataError } = require('./repository.js');
const { Store } = require('./store.js');
const Domain = require('./domain.js');
const { STORAGE_KEYS } = require('./constants.js');

// ---------- 本地存储辅助 ----------

function readLocal(key, fallback) {
    try {
        const value = wx.getStorageSync(key);
        return value === '' || value === null || value === undefined ? fallback : value;
    } catch (e) {
        return fallback;
    }
}

function writeLocal(key, value) {
    try {
        wx.setStorageSync(key, value);
    } catch (e) {
        // 存储失败不阻断主流程。
    }
}

// ---------- 设置同步 ----------

/**
 * 读取云端设置并写入 Store，同时缓存到本地。
 */
async function fetchSettings() {
    if (!Store.isAuthenticated()) return null;
    const repo = getRepository();
    const settings = await repo.getSettings();
    Store.setSettings(settings);
    writeLocal(STORAGE_KEYS.CONFIG, settings);
    writeLocal(STORAGE_KEYS.WISHLIST, settings.wishlist);
    writeLocal(STORAGE_KEYS.ACHIEVEMENTS, settings.unlockedAchievements);
    return settings;
}

/**
 * 组装要上传的设置：云端配置 + 本地状态（想看清单、成就、自定义类型）。
 * @param {Object} [base] - 作为底稿的云端设置，缺省读 Store 中的快照
 */
function buildSettings(base) {
    const current = base || Store.state.settings || Domain.normalizeSettings();
    return Domain.normalizeSettings({
        ...current,
        customGenres: Store.state.customGenres,
        wishlist: Store.getWishlist(),
        unlockedAchievements: Store.state.unlockedAchievements,
    });
}

/**
 * 保存设置到云端。
 *
 * 若云端设置尚未读取过，先读一次再写：否则会把默认的背景/主题写入云端，
 * 并用本地可能为空的想看清单覆盖另一端的记录。
 */
async function saveSettings() {
    if (!Store.isAuthenticated()) {
        return { ok: false, status: 'failed', error: new DataError('请先登录后再同步设置', 'AUTH_REQUIRED') };
    }

    let base = Store.state.settingsHydrated ? Store.state.settings : null;
    if (!base) {
        try {
            base = await getRepository().getSettings();
        } catch (error) {
            return { ok: false, status: 'failed', error };
        }
    }

    try {
        const repo = getRepository();
        const settings = await repo.saveSettings(buildSettings(base));
        Store.setSettings(settings);
        writeLocal(STORAGE_KEYS.CONFIG, settings);
        writeLocal(STORAGE_KEYS.WISHLIST, settings.wishlist);
        writeLocal(STORAGE_KEYS.ACHIEVEMENTS, settings.unlockedAchievements);
        return { ok: true, status: 'synced', settings };
    } catch (error) {
        return { ok: false, status: 'failed', error };
    }
}

// ---------- 观影记录 ----------

/**
 * 拉取云端记录，并合并想看清单。
 *
 * 已看记录来自 movies 表；想看清单只存在于云端 settings，
 * 因此以「已读取的云端设置」为准，未读取时才回退本地缓存，
 * 避免把本地过期的清单当成权威数据覆盖云端。
 */
async function loadMovies() {
    if (!Store.isAuthenticated()) return [];
    const repo = getRepository();
    const cloudMovies = await repo.listMovies();
    const localWishlist = readLocal(STORAGE_KEYS.WISHLIST, []);
    const wishlistItems = Store.state.settingsHydrated
        ? Store.state.settings.wishlist
        : localWishlist;
    Store.mergeData(cloudMovies, wishlistItems);
    writeLocal(STORAGE_KEYS.WISHLIST, Store.getWishlist());
    return Store.state.movies;
}

/**
 * 保存一条观影记录（新增或更新）。
 */
async function saveMovie(input, id = null) {
    if (!Store.isAuthenticated()) {
        return { ok: false, status: 'failed', error: new DataError('请先登录后再保存', 'AUTH_REQUIRED') };
    }
    try {
        const repo = getRepository();
        const movie = await repo.saveMovie(input, id);
        Store.upsertMovie(movie);
        return { ok: true, status: 'synced', movie };
    } catch (error) {
        return { ok: false, status: 'failed', error };
    }
}

/**
 * 删除一条观影记录。
 */
async function deleteMovie(id) {
    if (!Store.isAuthenticated()) {
        return { ok: false, status: 'failed', error: new DataError('请先登录后再删除', 'AUTH_REQUIRED') };
    }
    try {
        const repo = getRepository();
        await repo.deleteMovie(id);
        Store.removeMovie(id);
        return { ok: true, status: 'synced' };
    } catch (error) {
        return { ok: false, status: 'failed', error };
    }
}

// ---------- 想看清单 ----------

/**
 * 将电影加入想看清单（仅存云端 settings，不进 movies 表）。
 */
async function addToWishlist(tmdbMovie) {
    if (!tmdbMovie) return { ok: false, message: '无效的电影' };

    const existsInWishlist = Store.getWishlist().find((m) => m.tmdb_id === tmdbMovie.id);
    if (existsInWishlist) return { ok: false, message: '已经在想看列表中' };

    const existsWatched = Store.getWatched().find((m) => m.tmdb_id === tmdbMovie.id);
    if (existsWatched) return { ok: false, message: '这部电影已经在已看列表中' };

    // 搜索结果使用 TMDB 的 vote_average，两个字段名都兼容
    const rawRating = tmdbMovie.rating !== undefined && tmdbMovie.rating !== null
        ? tmdbMovie.rating
        : tmdbMovie.vote_average;

    const item = {
        id: `wl_${Date.now()}`,
        movie_name: tmdbMovie.title,
        tmdb_id: tmdbMovie.id,
        poster_path: tmdbMovie.poster_path || null,
        year: tmdbMovie.year || '',
        rating: rawRating === null || rawRating === undefined
            ? null
            : Math.round(rawRating * 10) / 10,
        added_at: new Date().toISOString(),
        watch_date: new Date().toISOString().split('T')[0],
        duration_minutes: null,
        genre: tmdbMovie.genre || '',
        created_by: '',
        director: tmdbMovie.director || '',
        cast: tmdbMovie.cast || '',
        status: Domain.MOVIE_STATUS.WISHLIST,
    };

    Store.upsertMovie(item, { prepend: false });
    writeLocal(STORAGE_KEYS.WISHLIST, Store.getWishlist());
    const result = await saveSettings();
    return { ok: true, message: `「${item.movie_name}」已加入想看`, result };
}

/**
 * 从想看清单移除。
 */
async function removeFromWishlist(id) {
    const item = Store.getWishlist().find((m) => String(m.id) === String(id));
    Store.removeMovie(id);
    writeLocal(STORAGE_KEYS.WISHLIST, Store.getWishlist());
    await saveSettings();
    return { ok: true, message: item ? `「${item.movie_name}」已从想看移除` : '已移除' };
}

module.exports = {
    readLocal,
    writeLocal,
    fetchSettings,
    saveSettings,
    buildSettings,
    loadMovies,
    saveMovie,
    deleteMovie,
    addToWishlist,
    removeFromWishlist,
};
