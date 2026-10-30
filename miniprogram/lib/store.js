/**
 * 轻量状态容器。可订阅但不主动操作 DOM，保留 appState 作为网页端兼容别名。
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
      _dataVersion: 0
    };

    function emit(type) {
      listeners.forEach(listener => listener(state, type));
    }

    function touchData() {
      state._dataVersion += 1;
      emit('movies');
    }

    // 用想看清单同步 state：已看记录保留，想看项以传入清单为准。
    function applyWishlist(items) {
      const watchedOnly = state.movies.filter(
        (movie) => movie.status !== Domain.MOVIE_STATUS.WISHLIST
      );
      state.movies = Domain.mergeMovies(watchedOnly, items, []);
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
        state.movies = (Array.isArray(movies) ? movies : []).map(Domain.normalizeMovie);
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
      // 合并云端记录与本地想看清单：云端已看记录为权威，本地想看项保留。
      mergeData(cloudMovies, wishlistItems) {
        state.movies = Domain.mergeMovies(cloudMovies, wishlistItems, []);
        touchData();
      },
      // 用云端想看清单同步 state：已看记录保留，想看项以云端为准。
      setWishlist(items) {
        applyWishlist(items);
        touchData();
      },
      getWishlist() {
        return state.movies.filter(movie => movie.status === Domain.MOVIE_STATUS.WISHLIST);
      },
      getWatched() {
        return Domain.getWatchedMovies(state.movies);
      },
      setMovieListMode(mode) {
        state.movieListMode = mode === 'wishlist' ? 'wishlist' : 'watched';
        emit('mode');
      },
      setSettings(settings) {
        state.settings = Domain.normalizeSettings(settings);
        state.customGenres = state.settings.customGenres;
        state.unlockedAchievements = state.settings.unlockedAchievements;
        // 云端设置携带想看清单，需要同步进 movies 以便统一展示。
        applyWishlist(state.settings.wishlist);
        touchData();
        emit('settings');
      },
      setUnlockedAchievements(ids) {
        state.unlockedAchievements = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
        state.settings = { ...state.settings, unlockedAchievements: state.unlockedAchievements };
        emit('settings');
      },
      resetPrivateData() {
        state.movies = [];
        state.unlockedAchievements = [];
        state.settings = Domain.normalizeSettings();
        state.customGenres = [];
        touchData();
      },
      touchData
    };
  }

  const Store = createStore();
  return { Store, createStore };
});

