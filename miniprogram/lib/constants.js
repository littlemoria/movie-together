/**
 * 小程序常量：迁移自网页版 js/config.js 的非敏感部分。
 * 包含类型定义、TMDB 类型映射、成就定义、存储键。
 */

const DEFAULT_GENRES = [
    { id: 'action', name: '动作' },
    { id: 'romance', name: '爱情' },
    { id: 'comedy', name: '喜剧' },
    { id: 'thriller', name: '惊悚' },
    { id: 'sci-fi', name: '科幻' },
    { id: 'drama', name: '剧情' },
    { id: 'horror', name: '恐怖' },
    { id: 'animation', name: '动画' },
    { id: 'documentary', name: '纪录片' },
];

// TMDB 类型 ID → 内部类型 ID
const TMDB_GENRE_MAP = {
    28: 'action', 12: 'action', 37: 'action',
    35: 'comedy', 10749: 'romance',
    27: 'horror', 878: 'sci-fi', 14: 'sci-fi',
    18: 'drama', 36: 'drama', 10752: 'drama', 10402: 'drama', 10770: 'drama',
    53: 'thriller', 80: 'thriller', 9648: 'thriller',
    16: 'animation', 10751: 'animation',
    99: 'documentary',
};

// 成就定义（condition 接收已看电影数组）
const ACHIEVEMENTS = [
    { id: 'first_watch', name: '初遇', desc: '第1次一起看', icon: '🎬', type: 'count', threshold: 1 },
    { id: 'tenth_watch', name: '十次之约', desc: '第10次一起看', icon: '🎬', type: 'count', threshold: 10 },
    { id: 'twenty_five', name: '银色时光', desc: '第25次一起看', icon: '💕', type: 'count', threshold: 25 },
    { id: 'fifty', name: '半百之旅', desc: '第50次一起看', icon: '🌟', type: 'count', threshold: 50 },
    { id: 'hundred', name: '百次辉煌', desc: '第100次一起看', icon: '👑', type: 'count', threshold: 100 },
    { id: 'ten_hours', name: '十小时陪伴', desc: '累计10小时', icon: '⏰', type: 'minutes', threshold: 600 },
    { id: 'fifty_hours', name: '五十小时', desc: '累计50小时', icon: '⏰', type: 'minutes', threshold: 3000 },
    { id: 'hundred_hours', name: '百小时里程碑', desc: '累计100小时', icon: '⏰', type: 'minutes', threshold: 6000 },
];

const STORAGE_KEYS = {
    SESSION: 'cinememo_session',
    WISHLIST: 'cinememo_wishlist',
    ACHIEVEMENTS: 'cinememo_achievements',
    CONFIG: 'cinememo_config',
};

module.exports = {
    DEFAULT_GENRES,
    TMDB_GENRE_MAP,
    ACHIEVEMENTS,
    STORAGE_KEYS,
};
