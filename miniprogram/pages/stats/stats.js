const { Store } = require('../../lib/store.js');
const Domain = require('../../lib/domain.js');
const { loadMovies, fetchSettings } = require('../../lib/service.js');
const { getGenreNames, getGenreColor } = require('../../lib/utils.js');
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
        avgMinutes: 0,
        genreStats: [],
        monthlyBars: [],
        monthCount: 12,
        monthDetail: [],
        calendar: [],
        calendarTitle: '',
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
        const movies = Store.getWatched();
        const totalMinutes = Domain.getTotalMinutes(movies);
        const customGenres = Store.state.customGenres;

        // 类型分布（对应网页版扇形图/雷达图的数据源）
        const genreCounts = Domain.getGenreStats(movies);
        const maxGenre = Math.max(1, ...Object.values(genreCounts));
        const genreStats = Object.entries(genreCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count], index) => ({
                name: getGenreNames(name, customGenres) || name,
                count,
                percent: Math.round((count / maxGenre) * 100),
                color: getGenreColor(index),
            }));

        // 月度分布（对应网页版趋势线图的数据源）
        const monthly = Domain.getMonthlyStats(movies, this.data.monthCount);
        const maxMonth = Math.max(1, ...Object.values(monthly.monthlyCounts));
        const monthlyBars = monthly.monthKeys
            .map((key, i) => ({
                key,
                label: monthly.monthLabels[i],
                count: monthly.monthlyCounts[key] || 0,
                percent: Math.round(((monthly.monthlyCounts[key] || 0) / maxMonth) * 100),
            }))
            .filter((item) => item.count > 0);

        // 月度明细（对应网页版 showMonthDetail）
        const monthDetail = monthly.monthKeys
            .map((key, i) => {
                const items = movies.filter((m) => Domain.getMonthKey(m.watch_date) === key);
                if (!items.length) return null;
                return {
                    key,
                    label: `${key.slice(0, 4)}年${Number(key.slice(5))}月`,
                    items: items.map((m) => ({
                        id: m.id,
                        movie_name: m.movie_name,
                        duration: m.duration_minutes || '?',
                    })),
                };
            })
            .filter(Boolean)
            .reverse();

        this.setData({
            totalCount: movies.length,
            totalHours: Math.floor(totalMinutes / 60),
            avgMinutes: movies.length ? Math.round(totalMinutes / movies.length) : 0,
            genreStats,
            monthlyBars,
            monthDetail,
            calendar: this.buildCalendar(movies),
            calendarTitle: this.buildCalendarTitle(),
        });
    },

    // 观影日历热力图（对应网页版 renderCalendarHeatmap）
    buildCalendar(movies) {
        const counts = {};
        movies.forEach((m) => {
            const key = m.watch_date;
            if (key) counts[key] = (counts[key] || 0) + 1;
        });

        const cells = [];
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const count = counts[key] || 0;
            cells.push({
                key,
                day,
                count,
                level: count === 0 ? 0 : Math.min(4, count),
            });
        }
        return cells;
    },

    buildCalendarTitle() {
        const now = new Date();
        return `${now.getFullYear()}年${now.getMonth() + 1}月`;
    },
});
