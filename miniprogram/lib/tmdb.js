/**
 * TMDB 电影元数据搜索：迁移自网页版 js/api.js 的 searchTmdb / 相关逻辑。
 */
const { Config } = require('./config.js');
const { TMDB_GENRE_MAP } = require('./constants.js');
const { mapTmdbGenres } = require('./utils.js');

function requestTmdb(path) {
    return new Promise((resolve, reject) => {
        wx.request({
            url: `${Config.TMDB_BASE_URL}${path}`,
            method: 'GET',
            header: { 'Content-Type': 'application/json' },
            success(res) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res.data);
                } else {
                    reject(new Error(res.data && res.data.status_message ? res.data.status_message : 'TMDB 请求失败'));
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || 'TMDB 网络请求失败'));
            },
        });
    });
}

/**
 * 搜索电影，返回标准化结果列表。
 */
async function searchMovies(keyword) {
    const query = String(keyword || '').trim();
    if (!query) return [];

    const data = await requestTmdb(
        `/search/movie?api_key=${Config.TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=zh-CN&include_adult=false`
    );

    const results = Array.isArray(data.results) ? data.results : [];
    return results.map((item) => ({
        id: item.id,
        title: item.title || item.original_title || '',
        poster_path: item.poster_path || null,
        vote_average: item.vote_average || null,
        release_date: item.release_date || null,
        year: item.release_date ? item.release_date.split('-')[0] : '',
        overview: item.overview || '',
        director: '',
        cast: '',
        genre: mapTmdbGenres(item.genre_ids, TMDB_GENRE_MAP),
    }));
}

/**
 * 获取电影详情（补齐导演与主演）。
 */
async function getMovieDetail(tmdbId) {
    const data = await requestTmdb(
        `/movie/${tmdbId}?api_key=${Config.TMDB_API_KEY}&language=zh-CN`
    );
    const credits = data.credits || {};
    const director = (credits.crew || []).find((c) => c.job === 'Director');
    const cast = (credits.cast || []).slice(0, 5).map((c) => c.name).join('、');
    return {
        director: director ? director.name : '',
        cast,
        genre: mapTmdbGenres((data.genres || []).map((g) => g.id), TMDB_GENRE_MAP),
        duration_minutes: data.runtime ? Math.round(data.runtime / 60) : null,
        overview: data.overview || '',
    };
}

module.exports = { searchMovies, getMovieDetail };
