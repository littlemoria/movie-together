const { Store } = require('../../lib/store.js');
const Domain = require('../../lib/domain.js');
const { loadMovies, fetchSettings } = require('../../lib/service.js');
const { formatDate, getPosterUrl, getGenreNames } = require('../../lib/utils.js');
const { Music } = require('../../lib/music.js');

Page({

    // ---------- 背景音乐 ----------

    /**
     * 首次触摸兜底：在手势的同步调用栈内解锁音频播放。
     * 全局 wx.onTouchStart 为主触发路径，这里保证页面级触摸同样能触发。
     */
    onFirstTouch() {
        Music.unlock();
    },    data: {
        totalCount: 0,
        totalHours: 0,
        totalMinutes: 0,
        recent: [],
        loading: false,
    },

    onShow() {
        if (!Store.isAuthenticated()) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        this.refresh();
    },

    async refresh() {
        this.setData({ loading: true });
        try {
            await loadMovies();
            await fetchSettings().catch(() => null);
            this.renderFromStore();
        } catch (err) {
            wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },

    renderFromStore() {
        const watched = Store.getWatched();
        const totalMinutes = Domain.getTotalMinutes(watched);
        const customGenres = Store.state.customGenres;

        const recent = [...watched]
            .sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date))
            .slice(0, 3)
            .map((movie) => ({
                id: movie.id,
                movie_name: movie.movie_name,
                poster: getPosterUrl(movie),
                dateText: formatDate(movie.watch_date),
                durationText: movie.duration_minutes ? `${movie.duration_minutes}分钟` : '时长未知',
                genreText: getGenreNames(movie.genre, customGenres),
            }));

        this.setData({
            totalCount: watched.length,
            totalHours: Math.floor(totalMinutes / 60),
            totalMinutes: totalMinutes % 60,
            recent,
        });
    },

    openDetail(e) {
        const id = e.currentTarget.dataset.id;
        const movie = Store.state.movies.find((m) => String(m.id) === String(id));
        if (!movie) return;
        wx.showModal({
            title: movie.movie_name,
            content: [
                `观影日期：${formatDate(movie.watch_date)}`,
                `时长：${movie.duration_minutes || '?'}分钟`,
                `类型：${getGenreNames(movie.genre, Store.state.customGenres) || '未分类'}`,
                `记录人：${movie.created_by || 'TA'}`,
                movie.rating ? `评分：${movie.rating}/10` : '',
                movie.director ? `导演：${movie.director}` : '',
                movie.cast ? `主演：${movie.cast}` : '',
            ].filter(Boolean).join('\n'),
            confirmText: '编辑',
            cancelText: '关闭',
            success: (res) => {
                if (res.confirm) {
                    wx.navigateTo({ url: `/pages/movies/movies?editId=${id}` });
                }
            },
        });
    },

    goMovies() {
        wx.reLaunch({ url: '/pages/movies/movies' });
    },

    goWishlist() {
        wx.reLaunch({ url: '/pages/movies/movies?mode=wishlist' });
    },

    goAchievements() {
        wx.navigateTo({ url: '/pages/achievements/achievements' });
    },

    goStats() {
        wx.navigateTo({ url: '/pages/stats/stats' });
    },
});
