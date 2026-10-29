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
      _dataVersion: 0
    };

    function emit(type) {
      listeners.forEach(listener => listener(state, type));
    }

    function touchData() {
      state._dataVersion += 1;
      emit('movies');
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
      resetPrivateData() {
        state.movies = [];
        state.unlockedAchievements = [];
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
