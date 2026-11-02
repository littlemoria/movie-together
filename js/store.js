/**
 * 轻量状态容器。可订阅但不主动操作 DOM，保留 appState 作为网页端兼容别名。
 *
 * 关键不变式：想看清单（status='wishlist'）不由 movies 表承载，而是随
 * settings 同步。因此任何「用 movies 表刷新集合」的操作都必须保留已有的
 * 想看项，否则下一次设置写入会把被清空的清单回写云端，抹掉另一端的记录。
 * 本实现与 miniprogram/lib/store.js 保持同一套语义。
 */
(function (root, factory) {
  const domain = typeof module === 'object' && module.exports
    ? require('./domain.js')
    : root.MovieDomain;
  const exported = factory(domain);
  if (typeof module === 'object' && module.exports) module.exports = exported;
  if (root) root.Store = exported.Store;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Domain) {
  'use strict';

  function isWishlist(movie) {
    return movie.status === Domain.MOVIE_STATUS.WISHLIST;
  }

  function createStore() {
    const listeners = new Set();
    const state = {
      movies: [],
      isAuthenticated: false,
      isAdmin: false, // 兼容旧网页代码，含义等同 isAuthenticated，不再代表角色。
      userId: null,
      customGenres: [],
      currentTrackIndex: -1,
      musicMuted: true,
      musicPaused: true,
      musicPanelOpen: false,
      currentTmdbResults: [],
      selectedTmdbMovie: null,
      movieListMode: 'watched',
      unlockedAchievements: [],
      settings: Domain.normalizeSettings(),
      // 云端 settings 是否已成功读取：未读取前禁止回写设置，避免用空清单覆盖云端。
      settingsHydrated: false,
      _dataVersion: 0
    };

    function emit(type) {
      listeners.forEach(listener => listener(state, type));
    }

    function touchData() {
      state._dataVersion += 1;
      emit('movies');
    }

    // 用一份想看清单同步 state：已看记录保留，想看项以传入清单为准。
    function applyWishlist(items) {
      const watchedOnly = state.movies.filter(movie => !isWishlist(movie));
      // 传入的清单可能来自旧版本本地缓存（没有 status 字段），统一标注为想看。
      const normalized = (Array.isArray(items) ? items : []).map(item =>
        Domain.normalizeMovie({ ...item, status: Domain.MOVIE_STATUS.WISHLIST })
      );
      state.movies = Domain.mergeMovies(watchedOnly, normalized, []);
    }

    return {
      state,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      isAuthenticated() {
        return state.isAuthenticated && !!state.userId;
      },
      setSession(session) {
        state.isAuthenticated = !!(session && session.user && session.user.id);
        state.isAdmin = state.isAuthenticated;
        state.userId = state.isAuthenticated ? session.user.id : null;
        emit('auth');
      },
      setMovies(movies) {
        // 保留当前想看项：movies 表只含已看记录，直接替换会丢掉想看清单。
        const wishlist = state.movies.filter(isWishlist);
        state.movies = Domain.mergeMovies(
          (Array.isArray(movies) ? movies : []).map(Domain.normalizeMovie),
          wishlist,
          []
        );
        touchData();
      },
      upsertMovie(input, options = {}) {
        const movie = Domain.normalizeMovie(input);
        const key = String(movie.id);
        const remaining = state.movies.filter(item => String(item.id) !== key);
        state.movies = options.prepend === false ? [...remaining, movie] : [movie, ...remaining];
        touchData();
        return movie;
      },
      removeMovie(id) {
        state.movies = state.movies.filter(movie => String(movie.id) !== String(id));
        touchData();
      },
      // 合并云端记录与想看清单：云端已看记录为权威，想看项以传入清单为准。
      mergeData(cloudMovies, wishlistItems) {
        state.movies = Domain.mergeMovies(cloudMovies, wishlistItems, []);
        touchData();
      },
      setWishlist(items) {
        applyWishlist(items);
        touchData();
      },
      getWishlist() {
        return state.movies.filter(isWishlist);
      },
      getWatched() {
        return Domain.getWatchedMovies(state.movies);
      },
      setSettings(settings) {
        state.settings = Domain.normalizeSettings(settings);
        state.customGenres = state.settings.customGenres;
        state.unlockedAchievements = state.settings.unlockedAchievements;
        state.settingsHydrated = true;
        // 云端设置携带想看清单，需要同步进 movies 以便统一展示。
        applyWishlist(state.settings.wishlist);
        touchData();
        emit('settings');
      },
      resetPrivateData() {
        state.movies = [];
        state.unlockedAchievements = [];
        state.customGenres = [];
        state.settings = Domain.normalizeSettings();
        state.settingsHydrated = false;
        touchData();
      },
      touchData
    };
  }

  const Store = createStore();
  return { Store, createStore };
});

// 现有网页脚本仍使用 appState；新逻辑优先通过 Store 修改共享状态。
const appState = Store.state;
