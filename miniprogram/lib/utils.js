/**
 * 小程序工具函数：迁移自网页版 js/utils.js 的平台无关部分。
 * 海报返回 URL（小程序用 <image> 标签），不含 DOM 操作。
 */
const { Config } = require('./config.js');
const { DEFAULT_GENRES } = require('./constants.js');

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getGenreName(id, customGenres = []) {
    const all = [...DEFAULT_GENRES, ...customGenres];
    const found = all.find((g) => g.id === id);
    return found ? found.name : id;
}

function getGenreNames(genres, customGenres = []) {
    if (!genres) return '';
    return genres
        .split(',')
        .filter(Boolean)
        .map((g) => getGenreName(g, customGenres))
        .join('、');
}

const GENRE_COLORS = ['#7B68CE', '#00B894', '#FDCB6E', '#E17055', '#74B9FF', '#A29BFE', '#FD79A8', '#FF6B6B'];
function getGenreColor(index) {
    return GENRE_COLORS[index % GENRE_COLORS.length];
}

// 海报 URL（w200 小图）
function getPosterUrl(movie) {
    if (!movie || !movie.poster_path) return '';
    return `${Config.TMDB_IMAGE_URL}/w200${movie.poster_path}`;
}

// 海报 URL（w500 大图）
function getLargePosterUrl(movie) {
    if (!movie || !movie.poster_path) return '';
    return `${Config.TMDB_IMAGE_URL}/w500${movie.poster_path}`;
}

function debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// TMDB 搜索结果 → 内部类型 id 列表
function mapTmdbGenres(genreIds, TMDB_GENRE_MAP) {
    if (!Array.isArray(genreIds)) return '';
    return [...new Set(genreIds.map((id) => TMDB_GENRE_MAP[id]).filter(Boolean))].join(',');
}

module.exports = {
    formatDate,
    getGenreName,
    getGenreNames,
    getGenreColor,
    getPosterUrl,
    getLargePosterUrl,
    debounce,
    mapTmdbGenres,
};
