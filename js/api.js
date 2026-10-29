/**
 * 网页端应用服务：协调仓储、状态、缓存与备份。
 * 纯数据传输位于 repository.js，电影与设置契约位于 domain.js。
 */
const API = {
  client: null,
  repository: null,

  initSupabase() {
    if (Config.SUPABASE_URL === 'YOUR_SUPABASE_URL' || !Config.SUPABASE_KEY) {
      console.warn('[API] Supabase 未配置');
      return null;
    }
    if (typeof window.supabase === 'undefined') {
      console.error('[API] Supabase SDK 未加载');
      return null;
    }
    if (!this.client) {
      this.client = window.supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_KEY);
    }
    if (!this.repository) {
      this.repository = new SupabaseRepository({
        baseUrl: Config.SUPABASE_URL,
        anonKey: Config.SUPABASE_KEY,
        getAccessToken: () => this.getAccessToken()
      });
    }
    return this.client;
  },

  async getAccessToken() {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data && data.session ? data.session.access_token : null;
  },

  ensureRepository() {
    if (!this.client) this.initSupabase();
    if (!this.repository) throw new DataError('Supabase 未配置', 'CONFIG_ERROR');
    return this.repository;
  },

  async fetchMovies(options = {}) {
    const { allowCache = true } = options;
    if (!Store.isAuthenticated()) return [];
    if (!navigator.onLine) {
      if (allowCache && typeof Cache !== 'undefined') return Cache.getMovies();
      throw new DataError('当前处于离线状态', 'NETWORK_ERROR');
    }
    try {
      const movies = await this.ensureRepository().listMovies();
      if (typeof Cache !== 'undefined') await Cache.replaceMovies(movies);
      return movies;
    } catch (error) {
      if (error.code === 'NETWORK_ERROR' && allowCache && typeof Cache !== 'undefined') {
        return Cache.getMovies();
      }
      throw error;
    }
  },

  // 自动同步必须读取云端权威数据，不能把缓存误当作同步成功。
  async fetchAllMovies() {
    return this.fetchMovies({ allowCache: false });
  },

  async saveMovie(movieData, id = null, options = {}) {
    const { prepend = true, fromSync = false } = options;
    if (!Store.isAuthenticated()) {
      const error = new DataError('请先登录后再保存', 'AUTH_REQUIRED');
      if (fromSync) throw error;
      return { ok: false, status: 'failed', error };
    }
    if (!fromSync && !navigator.onLine) return this.queueMovieOffline(movieData, id, prepend);

    try {
      const movie = await this.ensureRepository().saveMovie(movieData, id);
      Store.upsertMovie(movie, { prepend });
      if (typeof Cache !== 'undefined') await Cache.saveMovies([movie]);
      this.createAutoBackup();
      return { ok: true, status: 'synced', movie };
    } catch (error) {
      if (fromSync) throw error;
      if (error.code === 'NETWORK_ERROR') return this.queueMovieOffline(movieData, id, prepend);
      console.error('[API] 保存失败:', error.code, error.message);
      return { ok: false, status: 'failed', error };
    }
  },

  async queueMovieOffline(movieData, id, prepend) {
    try {
      const movie = id
        ? await Sync.updateMovieOffline({ ...movieData, id })
        : await Sync.addMovieOffline(movieData, { prepend });
      return { ok: true, status: 'queued', movie };
    } catch (error) {
      return { ok: false, status: 'failed', error };
    }
  },

  async deleteMovie(id, options = {}) {
    const { fromSync = false } = options;
    if (!Store.isAuthenticated()) {
      const error = new DataError('请先登录后再删除', 'AUTH_REQUIRED');
      if (fromSync) throw error;
      return { ok: false, status: 'failed', error };
    }
    if (!fromSync && !navigator.onLine) return this.queueMovieDeletion(id);

    try {
      await this.ensureRepository().deleteMovie(id);
      Store.removeMovie(id);
      if (typeof Cache !== 'undefined') await Cache.deleteMovie(id);
      this.createAutoBackup();
      return { ok: true, status: 'synced' };
    } catch (error) {
      if (fromSync) throw error;
      if (error.code === 'NETWORK_ERROR') return this.queueMovieDeletion(id);
      console.error('[API] 删除失败:', error.code, error.message);
      return { ok: false, status: 'failed', error };
    }
  },

  async queueMovieDeletion(id) {
    try {
      await Sync.deleteMovieOffline(id);
      return { ok: true, status: 'queued' };
    } catch (error) {
      return { ok: false, status: 'failed', error };
    }
  },

  createAutoBackup() {
    if (typeof Backup !== 'undefined' && Backup.isAutoBackupEnabled()) {
      Backup.createBackup(appState.movies);
    }
  },

  async fetchCloudSettings() {
    if (!Store.isAuthenticated()) return null;
    const settings = await this.ensureRepository().getSettings();
    Object.assign(cloudSettings, settings);
    config.theme = settings.theme;
    appState.customGenres = settings.customGenres;
    appState.unlockedAchievements = settings.unlockedAchievements;
    localStorage.setItem(Config.STORAGE_KEYS.CONFIG, JSON.stringify(config));
    localStorage.setItem(Config.STORAGE_KEYS.GENRES, JSON.stringify(settings.customGenres));
    localStorage.setItem(Config.STORAGE_KEYS.WISHLIST, JSON.stringify(settings.wishlist));
    localStorage.setItem(Config.STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(settings.unlockedAchievements));
    return settings;
  },

  buildCloudSettings() {
    return MovieDomain.normalizeSettings({
      ...cloudSettings,
      theme: config.theme,
      customGenres: appState.customGenres,
      wishlist: appState.movies.filter(movie => movie.status === MovieDomain.MOVIE_STATUS.WISHLIST),
      unlockedAchievements: appState.unlockedAchievements
    });
  },

  async saveCloudSettings() {
    if (!Store.isAuthenticated()) {
      return { ok: false, status: 'failed', error: new DataError('请先登录后再同步设置', 'AUTH_REQUIRED') };
    }
    try {
      const settings = await this.ensureRepository().saveSettings(this.buildCloudSettings());
      Object.assign(cloudSettings, settings);
      return { ok: true, status: 'synced', settings };
    } catch (error) {
      console.error('[API] 设置同步失败:', error.code, error.message);
      return { ok: false, status: 'failed', error };
    }
  },

  async fetchCloudSettingsWithRetry(retryCount = 3) {
    if (!Store.isAuthenticated()) return false;
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        await this.fetchCloudSettings();
        return true;
      } catch (error) {
        if (error.code !== 'NETWORK_ERROR') {
          console.error('[API] 设置读取失败:', error.code, error.message);
          return false;
        }
        if (attempt < retryCount - 1) await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return false;
  },

  async searchTmdb(query) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${Config.TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=zh-CN`
      );
      if (!response.ok) throw new Error(`TMDB API 错误: ${response.status}`);
      const data = await response.json();
      return data.results ? data.results.slice(0, 5) : [];
    } catch (error) {
      console.error('[API] TMDB 搜索失败:', error);
      return [];
    }
  },

  async getTmdbMovieDetails(tmdbId) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${Config.TMDB_API_KEY}&language=zh-CN`
      );
      if (!response.ok) throw new Error(`TMDB API 错误: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] 获取 TMDB 详情失败:', error);
      return null;
    }
  },

  async getTmdbCredits(tmdbId) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${Config.TMDB_API_KEY}&language=zh-CN`
      );
      if (!response.ok) throw new Error(`TMDB API 错误: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] 获取 TMDB 演职人员失败:', error);
      return { crew: [], cast: [] };
    }
  },

  async enrichMovieFromTmdb(movieName) {
    try {
      const results = await this.searchTmdb(movieName);
      if (!results || results.length === 0) return null;
      const bestMatch = results[0];
      await new Promise(resolve => setTimeout(resolve, 200));
      return {
        poster_path: bestMatch.poster_path || null,
        rating: bestMatch.vote_average ? Math.round(bestMatch.vote_average) : null,
        tmdb_id: bestMatch.id || null
      };
    } catch (error) {
      console.error('[API] TMDB 丰富电影信息失败:', movieName, error);
      return null;
    }
  }
};
