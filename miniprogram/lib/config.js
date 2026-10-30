/**
 * 小程序全局配置。
 * 与网页版共用同一个 Supabase 项目，数据天然互通。
 */
const Config = {
    // Supabase 项目地址与 anon key（公开信息，有 RLS 保护，非密钥）。
    SUPABASE_URL: 'https://zbghffgydxzufzfuozwq.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZ2hmZmd5ZHh6dWZ6ZnVvendxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzI1MDAsImV4cCI6MjA5MDQ0ODUwMH0.9_v1GjPo1ISkGCyvyAsqwhvkfRMsvR_OfgZVStxhVRc',

    // TMDB 电影元数据（搜索、海报、评分），免费 key。
    TMDB_BASE_URL: 'https://api.themoviedb.org/3',
    TMDB_IMAGE_URL: 'https://image.tmdb.org/t/p',
    TMDB_API_KEY: 'cd1951025c510fc9bf0a0523bfc31b6b',
};

module.exports = { Config };
