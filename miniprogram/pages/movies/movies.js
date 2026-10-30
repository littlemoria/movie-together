const { Store } = require('../../lib/store.js');
const Domain = require('../../lib/domain.js');
const { loadMovies, fetchSettings, saveMovie, deleteMovie, addToWishlist, removeFromWishlist } = require('../../lib/service.js');
const { formatDate, getPosterUrl, getLargePosterUrl, getGenreNames, getGenreName, debounce } = require('../../lib/utils.js');
const { searchMovies, getMovieDetail } = require('../../lib/tmdb.js');

const EMPTY_FORM = {
    movie_name: '',
    watch_date: '',
    duration_minutes: '',
    genre: '',
    created_by: '',
    rating: '',
    director: '',
    cast: '',
};

Page({
    data: {
        mode: 'watched',
        search: '',
        groups: [],
        wishlist: [],
        filterOptions: [],
        filterIndex: 0,
        activeFilter: null,
        loading: false,
        showModal: false,
        editingId: null,
        saving: false,
        formError: '',
        form: { ...EMPTY_FORM },
        tmdbKeyword: '',
        tmdbResults: [],
        tmdbLoading: false,
        showDetail: false,
        detail: {},
    },

    onLoad(options) {
        if (options && options.mode === 'wishlist') {
            this.setData({ mode: 'wishlist' });
            Store.setMovieListMode('wishlist');
        }
        if (options && options.editId) {
            this.pendingEditId = options.editId;
        }
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

            // 从首页跳转过来时直接打开编辑弹层。
            if (this.pendingEditId) {
                const id = this.pendingEditId;
                this.pendingEditId = null;
                this.openEditById(id);
            }
        } catch (err) {
            wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },

    // ---------- 渲染 ----------

    renderFromStore() {
        const customGenres = Store.state.customGenres;
        const search = this.data.search.trim().toLowerCase();
        const filter = this.data.activeFilter;

        // allWatched 是未筛选的完整列表：筛选项需基于它构建，
        // 否则筛选一次后选项会收窄，无法再切换到其它类型（对齐网页版）。
        const allWatched = Store.getWatched().sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date));
        let watched = allWatched;

        if (search) {
            watched = watched.filter((m) => (m.movie_name || '').toLowerCase().includes(search));
        }
        if (filter && filter.type === 'genre') {
            watched = watched.filter((m) => (m.genre || '').includes(filter.value));
        }
        if (filter && filter.type === 'year') {
            watched = watched.filter((m) => new Date(m.watch_date).getFullYear().toString() === filter.value);
        }
        if (filter && filter.type === 'month') {
            watched = watched.filter((m) => (new Date(m.watch_date).getMonth() + 1).toString() === filter.value);
        }

        const groups = this.groupByMonth(watched, customGenres);
        const wishlist = Store.getWishlist().map((item) => ({
            id: item.id,
            movie_name: item.movie_name,
            poster: getPosterUrl(item),
            year: item.year || '',
            rating: item.rating || null,
        }));

        // 筛选项基于完整列表构建，并保持当前选中项的下标。
        const filterOptions = this.buildFilterOptions(allWatched);
        const filterIndex = filter
            ? Math.max(0, filterOptions.findIndex((o) => o.type === filter.type && o.value === filter.value))
            : 0;

        this.setData({ groups, wishlist, filterOptions, filterIndex });
    },

    // 按月份分组（对齐网页版 renderMoviesGroupedByMonth）
    groupByMonth(movies, customGenres) {
        const buckets = {};
        movies.forEach((movie) => {
            const date = new Date(movie.watch_date);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, '0')}`;
            if (!buckets[key]) {
                buckets[key] = {
                    key,
                    label: `${year}年${String(month).padStart(2, '0')}月`,
                    movies: [],
                };
            }
            buckets[key].movies.push({
                id: movie.id,
                movie_name: movie.movie_name,
                poster: getPosterUrl(movie),
                dateText: formatDate(movie.watch_date),
                durationText: movie.duration_minutes ? `${movie.duration_minutes}分钟` : '时长未知',
                genreText: getGenreNames(movie.genre, customGenres),
                created_by: movie.created_by,
            });
        });
        return Object.values(buckets);
    },

    // 筛选项：类型 + 年份 + 月份（对齐网页版的三个下拉）
    buildFilterOptions(movies) {
        const customGenres = Store.state.customGenres;
        const options = [{ label: '全部', type: 'all', value: '' }];

        const genreSet = new Set();
        movies.forEach((m) => (m.genre || '').split(',').filter(Boolean).forEach((g) => genreSet.add(g)));
        [...genreSet].sort().forEach((genre) => {
            options.push({ label: getGenreName(genre, customGenres), type: 'genre', value: genre });
        });

        const yearSet = new Set();
        movies.forEach((m) => yearSet.add(new Date(m.watch_date).getFullYear()));
        [...yearSet].sort((a, b) => b - a).forEach((year) => {
            options.push({ label: `${year}年`, type: 'year', value: String(year) });
        });

        const monthSet = new Set();
        movies.forEach((m) => monthSet.add(new Date(m.watch_date).getMonth() + 1));
        [...monthSet].sort((a, b) => a - b).forEach((month) => {
            options.push({ label: `${month}月`, type: 'month', value: String(month) });
        });

        return options;
    },

    // ---------- 模式与筛选 ----------

    switchMode(e) {
        const mode = e.currentTarget.dataset.mode;
        Store.setMovieListMode(mode);
        this.setData({ mode, activeFilter: null, filterIndex: 0 });
        this.renderFromStore();
    },

    onSearchInput(e) {
        this.setData({ search: e.detail.value });
        debounce(() => this.renderFromStore(), 300)();
    },

    onFilterChange(e) {
        const index = Number(e.detail.value);
        const option = this.data.filterOptions[index];
        if (!option) return;
        this.setData({
            filterIndex: index,
            activeFilter: option.type === 'all' ? null : option,
        });
        this.renderFromStore();
    },

    clearFilter() {
        this.setData({ activeFilter: null, filterIndex: 0 });
        this.renderFromStore();
    },

    // ---------- 添加与编辑 ----------

    openAdd() {
        this.setData({
            showModal: true,
            editingId: null,
            formError: '',
            form: { ...EMPTY_FORM, watch_date: new Date().toISOString().split('T')[0] },
            tmdbKeyword: '',
            tmdbResults: [],
        });
    },

    openEditById(id) {
        const movie = Store.state.movies.find((m) => String(m.id) === String(id));
        if (!movie) return;
        this.setData({
            showModal: true,
            editingId: id,
            formError: '',
            tmdbKeyword: '',
            tmdbResults: [],
            form: {
                movie_name: movie.movie_name,
                watch_date: movie.watch_date,
                duration_minutes: movie.duration_minutes === null ? '' : String(movie.duration_minutes),
                genre: movie.genre,
                created_by: movie.created_by,
                rating: movie.rating === null ? '' : String(movie.rating),
                director: movie.director,
                cast: movie.cast,
            },
        });
    },

    closeModal() {
        this.setData({ showModal: false, formError: '', tmdbResults: [], tmdbKeyword: '' });
    },

    noop() {},

    onFieldInput(e) {
        const field = e.currentTarget.dataset.field;
        this.setData({ [`form.${field}`]: e.detail.value, formError: '' });
    },

    async handleSave() {
        const { form, editingId } = this.data;
        const input = {
            movie_name: form.movie_name,
            watch_date: form.watch_date,
            duration_minutes: form.duration_minutes === '' ? null : Number(form.duration_minutes),
            genre: form.genre,
            created_by: form.created_by,
            rating: form.rating === '' ? null : Number(form.rating),
            director: form.director,
            cast: form.cast,
        };

        const errors = Domain.validateMovie(input);
        if (errors.length) {
            this.setData({ formError: errors.join('；') });
            return;
        }

        this.setData({ saving: true });
        try {
            const result = await saveMovie(input, editingId);
            if (!result.ok) {
                this.setData({ formError: result.error.message || '保存失败' });
                return;
            }
            this.setData({ showModal: false, tmdbResults: [], tmdbKeyword: '' });
            this.renderFromStore();
            wx.showToast({ title: editingId ? '已更新' : '已添加', icon: 'success' });
        } finally {
            this.setData({ saving: false });
        }
    },

    // ---------- TMDB 搜索 ----------

    onTmdbKeywordInput(e) {
        this.setData({ tmdbKeyword: e.detail.value });
    },

    async handleTmdbSearch() {
        const keyword = this.data.tmdbKeyword.trim();
        if (!keyword) {
            wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
            return;
        }
        this.setData({ tmdbLoading: true });
        try {
            const results = await searchMovies(keyword);
            this.setData({
                tmdbResults: results.map((item) => ({
                    ...item,
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : '',
                })),
            });
            if (!results.length) {
                wx.showToast({ title: '没有找到相关电影', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: err.message || '搜索失败', icon: 'none' });
        } finally {
            this.setData({ tmdbLoading: false });
        }
    },

    // 选用搜索结果：填充表单并补齐元数据
    async handleTmdbPick(e) {
        const index = Number(e.currentTarget.dataset.index);
        const movie = this.data.tmdbResults[index];
        if (!movie) return;

        this.setData({
            'form.movie_name': movie.title,
            'form.watch_date': this.data.form.watch_date || new Date().toISOString().split('T')[0],
            'form.genre': movie.genre || '',
            'form.rating': movie.rating === null || movie.rating === undefined ? '' : String(movie.rating),
            'form.director': movie.director || '',
            'form.cast': movie.cast || '',
            tmdbResults: [],
            tmdbKeyword: '',
        });

        // 补充导演、主演与准确时长。
        try {
            const detail = await getMovieDetail(movie.id);
            this.setData({
                'form.director': detail.director || this.data.form.director,
                'form.cast': detail.cast || this.data.form.cast,
                'form.genre': detail.genre || this.data.form.genre,
                'form.duration_minutes': detail.duration_minutes || this.data.form.duration_minutes,
            });
        } catch (e) {
            // 详情获取失败不影响主流程。
        }
    },

    // 加入想看清单
    async handleTmdbWish(e) {
        const index = Number(e.currentTarget.dataset.index);
        const movie = this.data.tmdbResults[index];
        if (!movie) return;
        const result = await addToWishlist(movie);
        wx.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' });
        if (result.ok) {
            this.setData({ tmdbResults: [], tmdbKeyword: '' });
            this.renderFromStore();
        }
    },

    // ---------- 想看清单 ----------

    // 想看 → 已看：打开添加弹层预填（对齐网页版 wishlistToWatched）
    promoteToWatched(e) {
        const id = e.currentTarget.dataset.id;
        const item = Store.getWishlist().find((m) => String(m.id) === String(id));
        if (!item) return;

        this.setData({
            showModal: true,
            editingId: null,
            formError: '',
            tmdbKeyword: '',
            tmdbResults: [],
            form: {
                movie_name: item.movie_name,
                watch_date: new Date().toISOString().split('T')[0],
                duration_minutes: '',
                genre: item.genre || '',
                created_by: '',
                rating: item.rating === null || item.rating === undefined ? '' : String(item.rating),
                director: item.director || '',
                cast: item.cast || '',
            },
        });

        // 从想看清单移除，保存时会作为新的已看记录写入 movies 表。
        removeFromWishlist(id).then(() => this.renderFromStore());
    },

    async handleRemoveWishlist(e) {
        const id = e.currentTarget.dataset.id;
        const result = await removeFromWishlist(id);
        wx.showToast({ title: result.message, icon: 'info' });
        this.renderFromStore();
    },

    // ---------- 详情与删除 ----------

    openDetail(e) {
        const id = e.currentTarget.dataset.id;
        const movie = Store.state.movies.find((m) => String(m.id) === String(id));
        if (!movie) return;
        const customGenres = Store.state.customGenres;
        this.setData({
            showDetail: true,
            detail: {
                id: movie.id,
                movie_name: movie.movie_name,
                poster: getLargePosterUrl(movie),
                dateText: formatDate(movie.watch_date),
                durationText: movie.duration_minutes ? `${movie.duration_minutes}分钟` : '未知',
                genreText: getGenreNames(movie.genre, customGenres),
                created_by: movie.created_by,
                rating: movie.rating,
                director: movie.director,
                cast: movie.cast,
            },
        });
    },

    closeDetail() {
        this.setData({ showDetail: false });
    },

    goHome() {
        wx.reLaunch({ url: '/pages/home/home' });
    },

    goAchievements() {
        wx.navigateTo({ url: '/pages/achievements/achievements' });
    },

    goStats() {
        wx.navigateTo({ url: '/pages/stats/stats' });
    },

    goSettings() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },

    handleLogout() {
        wx.showModal({
            title: '退出登录',
            content: '确定要退出登录吗？',
            success: (res) => {
                if (!res.confirm) return;
                const app = getApp();
                app.onLogout();
                wx.reLaunch({ url: '/pages/login/login' });
            },
        });
    },

    handleEditFromDetail() {
        const id = this.data.detail.id;
        this.setData({ showDetail: false });
        this.openEditById(id);
    },

    handleDelete() {
        const id = this.data.detail.id;
        wx.showModal({
            title: '删除确认',
            content: '确定删除这条观影记录吗？',
            confirmColor: '#d93026',
            success: async (res) => {
                if (!res.confirm) return;
                const result = await deleteMovie(id);
                if (!result.ok) {
                    wx.showToast({ title: result.error.message || '删除失败', icon: 'none' });
                    return;
                }
                this.setData({ showDetail: false });
                this.renderFromStore();
                wx.showToast({ title: '已删除', icon: 'success' });
            },
        });
    },
});
