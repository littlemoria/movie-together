/**
 * 平台无关的数据契约与纯业务规则。
 * 不访问 DOM、localStorage、navigator 或任何网络 API。
 */
(function (root, factory) {
  const domain = factory();
  if (typeof module === 'object' && module.exports) module.exports = domain;
  if (root) root.MovieDomain = domain;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MOVIE_STATUS = Object.freeze({ WATCHED: 'watched', WISHLIST: 'wishlist' });
  const SYNC_POLICY = Object.freeze({
    INTERVAL_MS: 5 * 60 * 1000,
    AUTHORITY: 'cloud-with-pending-rebase',
    CONFLICT: 'last-write-wins'
  });

  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    bgType: 'image',
    bgImage: '',
    bgGif: '',
    bgVideo: '',
    bgMaskOpacity: 30,
    cardOpacity: 100,
    theme: 'light',
    customGenres: [],
    wishlist: [],
    unlockedAchievements: []
  });

  class DomainError extends Error {
    constructor(message, code = 'VALIDATION_ERROR') {
      super(message);
      this.name = 'DomainError';
      this.code = code;
    }
  }

  function objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function stringOrEmpty(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function nullableNumber(value, integer = false) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return integer ? Math.trunc(number) : number;
  }

  function normalizeDate(value) {
    const text = stringOrEmpty(value);
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  function normalizeMovie(input) {
    const movie = objectOrEmpty(input);
    const status = movie.status === MOVIE_STATUS.WISHLIST
      ? MOVIE_STATUS.WISHLIST
      : MOVIE_STATUS.WATCHED;
    const normalized = {
      id: movie.id !== undefined ? movie.id : null,
      movie_name: stringOrEmpty(movie.movie_name).trim(),
      watch_date: normalizeDate(movie.watch_date || movie.added_at),
      duration_minutes: nullableNumber(movie.duration_minutes, true),
      genre: Array.isArray(movie.genre) ? movie.genre.join(',') : stringOrEmpty(movie.genre),
      created_by: stringOrEmpty(movie.created_by),
      poster_path: movie.poster_path || null,
      rating: nullableNumber(movie.rating),
      director: stringOrEmpty(movie.director),
      cast: stringOrEmpty(movie.cast),
      tmdb_id: nullableNumber(movie.tmdb_id, true),
      status,
      year: stringOrEmpty(movie.year),
      added_at: movie.added_at || null,
      created_at: movie.created_at || null,
      updated_at: movie.updated_at || null
    };
    if (movie._pending) normalized._pending = true;
    return normalized;
  }

  function validateMovie(input) {
    const movie = normalizeMovie(input);
    const errors = [];
    if (!movie.movie_name) errors.push('电影名称不能为空');
    if (movie.status === MOVIE_STATUS.WATCHED && !movie.watch_date) {
      errors.push('观影日期不能为空或格式无效');
    }
    if (movie.duration_minutes !== null && movie.duration_minutes <= 0) {
      errors.push('时长必须为正数');
    }
    return errors;
  }

  function toMoviePayload(input) {
    const movie = normalizeMovie(input);
    const errors = validateMovie(movie);
    if (errors.length) throw new DomainError(errors.join('；'));

    // movies 表只保存已看记录；wishlist 与本地同步字段不进入云端表。
    return {
      movie_name: movie.movie_name,
      watch_date: movie.watch_date,
      duration_minutes: movie.duration_minutes,
      genre: movie.genre,
      created_by: movie.created_by || 'TA',
      poster_path: movie.poster_path,
      rating: movie.rating,
      director: movie.director,
      cast: movie.cast,
      tmdb_id: movie.tmdb_id
    };
  }

  function clampInteger(value, min, max, fallback) {
    const number = nullableNumber(value, true);
    return number === null ? fallback : Math.min(max, Math.max(min, number));
  }

  function normalizeSettings(input) {
    const settings = objectOrEmpty(input);
    return {
      schemaVersion: SCHEMA_VERSION,
      bgType: ['image', 'gif', 'video'].includes(settings.bgType) ? settings.bgType : 'image',
      bgImage: stringOrEmpty(settings.bgImage),
      bgGif: stringOrEmpty(settings.bgGif),
      bgVideo: stringOrEmpty(settings.bgVideo),
      bgMaskOpacity: clampInteger(settings.bgMaskOpacity, 0, 100, 30),
      cardOpacity: clampInteger(settings.cardOpacity, 0, 100, 100),
      theme: settings.theme === 'dark' ? 'dark' : 'light',
      customGenres: Array.isArray(settings.customGenres)
        ? settings.customGenres
            .filter(item => item && item.id && item.name)
            .map(item => ({ id: String(item.id), name: String(item.name) }))
        : [],
      wishlist: Array.isArray(settings.wishlist)
        ? settings.wishlist.map(item => normalizeMovie({ ...item, status: MOVIE_STATUS.WISHLIST }))
        : [],
      unlockedAchievements: Array.isArray(settings.unlockedAchievements)
        ? [...new Set(settings.unlockedAchievements.filter(Boolean).map(String))]
        : []
    };
  }

  function parseSettingsValue(value) {
    if (typeof value === 'string') {
      if (!value) return normalizeSettings();
      try {
        return normalizeSettings(JSON.parse(value));
      } catch (error) {
        throw new DomainError('云端设置格式无效', 'INVALID_SETTINGS');
      }
    }
    return normalizeSettings(value);
  }

  function localKey(movie) {
    return movie && movie.id !== null && movie.id !== undefined ? String(movie.id) : '';
  }

  function mergeMovies(cloudMovies, cachedMovies, currentMovies) {
    const merged = new Map();
    (Array.isArray(cloudMovies) ? cloudMovies : []).forEach(item => {
      const movie = normalizeMovie(item);
      if (localKey(movie)) merged.set(localKey(movie), movie);
    });

    const watchedTmdbIds = new Set(
      [...merged.values()].filter(movie => movie.tmdb_id !== null).map(movie => movie.tmdb_id)
    );

    [...(Array.isArray(cachedMovies) ? cachedMovies : []),
      ...(Array.isArray(currentMovies) ? currentMovies : [])].forEach(item => {
      const movie = normalizeMovie(item);
      const key = localKey(movie);
      if (!key || merged.has(key)) return;

      const isPending = movie._pending || key.startsWith('temp_') || typeof movie.id === 'number';
      const isWishlist = movie.status === MOVIE_STATUS.WISHLIST;
      if (!isPending && !isWishlist) return;
      if (isWishlist && movie.tmdb_id !== null && watchedTmdbIds.has(movie.tmdb_id)) return;
      merged.set(key, movie);
    });

    return [...merged.values()];
  }

  function getWatchedMovies(movies) {
    return (Array.isArray(movies) ? movies : [])
      .map(normalizeMovie)
      .filter(movie => movie.status === MOVIE_STATUS.WATCHED);
  }

  function getTotalMinutes(movies) {
    return getWatchedMovies(movies)
      .reduce((sum, movie) => sum + (movie.duration_minutes || 0), 0);
  }

  function getGenreStats(movies) {
    return getWatchedMovies(movies).reduce((counts, movie) => {
      movie.genre.split(',').filter(Boolean).forEach(genre => {
        counts[genre] = (counts[genre] || 0) + 1;
      });
      return counts;
    }, {});
  }

  function getMonthKey(dateString) {
    const date = normalizeDate(dateString);
    return date ? date.slice(0, 7) : '';
  }

  function getMonthlyStats(movies, months = 12, now = new Date()) {
    const count = clampInteger(months, 1, 120, 12);
    const monthKeys = [];
    const monthLabels = [];
    for (let index = count - 1; index >= 0; index--) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
      monthLabels.push(`${date.getMonth() + 1}月`);
    }
    const monthlyCounts = {};
    getWatchedMovies(movies).forEach(movie => {
      const key = getMonthKey(movie.watch_date);
      if (key) monthlyCounts[key] = (monthlyCounts[key] || 0) + 1;
    });
    return { monthKeys, monthLabels, monthlyCounts };
  }

  function createLocalId(prefix = 'temp') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    SCHEMA_VERSION,
    MOVIE_STATUS,
    SYNC_POLICY,
    DEFAULT_SETTINGS,
    DomainError,
    normalizeMovie,
    validateMovie,
    toMoviePayload,
    normalizeSettings,
    parseSettingsValue,
    mergeMovies,
    getWatchedMovies,
    getTotalMinutes,
    getGenreStats,
    getMonthKey,
    getMonthlyStats,
    createLocalId
  };
});
