/**
 * API 模块
 * 处理 Supabase 和 TMDB API 调用
 */

const API = {
  initSupabase() {
    if (Config.SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      console.log('请配置 Supabase');
      return null;
    }
    
    if (typeof window.supabase === 'undefined') {
      console.error('Supabase SDK 未加载');
      return null;
    }
    
    return window.supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_KEY);
  },

  async fetchAllMovies() {
    return this.fetchMovies();
  },

  async fetchMovies() {
    if (!navigator.onLine && typeof Cache !== 'undefined') {
      console.log('[API] Offline, loading from cache');
      return await Cache.getMovies();
    }
    
    try {
      const response = await fetch(
        `${Config.SUPABASE_URL}/rest/v1/movies?select=*&order=watch_date.desc`,
        {
          headers: {
            'apikey': Config.SUPABASE_KEY,
            'Authorization': `Bearer ${Config.SUPABASE_KEY}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const movies = await response.json();
      
      if (typeof Cache !== 'undefined' && movies && movies.length > 0) {
        await Cache.saveMovies(movies);
      }
      
      return movies;
    } catch (err) {
      console.error('获取电影列表失败:', err);
      
      if (typeof Cache !== 'undefined') {
        return await Cache.getMovies();
      }
      
      return [];
    }
  },

  async saveMovie(movieData, id = null, options = {}) {
    const { prepend = true } = options;
    if (!navigator.onLine && typeof Sync !== 'undefined') {
      console.log('[API] Offline, saving to sync queue');
      if (id) {
        return Sync.updateMovieOffline({ ...movieData, id });
      } else {
        return Sync.addMovieOffline(movieData);
      }
    }
    
    try {
      let url, method, body;
      
      if (id) {
        url = `${Config.SUPABASE_URL}/rest/v1/movies?id=eq.${id}`;
        method = 'PATCH';
        body = JSON.stringify(movieData);
      } else {
        url = `${Config.SUPABASE_URL}/rest/v1/movies`;
        method = 'POST';
        // 删除临时 ID（如 'temp_...'），让 Supabase 自动生成 UUID
        const { id: _tempId, ...dataWithoutId } = movieData;
        body = JSON.stringify(dataWithoutId);
      }
      
      const response = await fetch(url, {
        method,
        headers: {
          'apikey': Config.SUPABASE_KEY,
          'Authorization': `Bearer ${Config.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body
      });

      if (!response.ok) {
        // 读取 Supabase 返回的详细错误信息
        let errorDetail = '';
        try {
          const errorBody = await response.json();
          errorDetail = JSON.stringify(errorBody);
        } catch (e) {
          errorDetail = await response.text().catch(() => '(无法读取响应)');
        }
        console.error('Supabase 请求失败:', {
          status: response.status,
          method,
          url,
          requestBody: body,
          error: errorDetail
        });
        throw new Error(`HTTP ${response.status}: ${errorDetail}`);
      }

      if (id) {
        const idx = appState.movies.findIndex(m => m.id === id);
        if (idx >= 0) {
          appState.movies[idx] = { ...appState.movies[idx], ...movieData };
        }
        
        if (typeof Cache !== 'undefined') {
          await Cache.saveMovies([appState.movies[idx]]);
        }
      } else {
        const newMovie = await response.json();
        // PostgREST 单行 POST 返回对象，批量返回数组，兼容两者
        const createdMovie = Array.isArray(newMovie) ? newMovie[0] : newMovie;
        if (createdMovie && createdMovie.id) {
          if (prepend) {
            appState.movies.unshift(createdMovie);
          } else {
            appState.movies.push(createdMovie);
          }

          if (typeof Cache !== 'undefined') {
            await Cache.saveMovies([createdMovie]);
          }
        } else {
          // Supabase 请求成功但未返回 representation，使用本地数据
          movieData.id = Date.now();
          movieData.created_at = new Date().toISOString();
          if (prepend) {
            appState.movies.unshift(movieData);
          } else {
            appState.movies.push(movieData);
          }

          if (typeof Cache !== 'undefined') {
            await Cache.saveMovies([movieData]);
          }
        }
      }
      
      if (typeof Backup !== 'undefined' && Backup.isAutoBackupEnabled()) {
        Backup.createBackup(appState.movies);
      }
      
      return true;
    } catch (err) {
      console.error('保存失败:', err);
      if (id) {
        const idx = appState.movies.findIndex(m => m.id === id);
        if (idx >= 0) appState.movies[idx] = { ...appState.movies[idx], ...movieData };
      } else {
        movieData.id = Date.now();
        if (prepend) {
          appState.movies.unshift(movieData);
        } else {
          appState.movies.push(movieData);
        }
      }
      localStorage.setItem(Config.STORAGE_KEYS.MOVIES, JSON.stringify(appState.movies));
      
      if (typeof Backup !== 'undefined' && Backup.isAutoBackupEnabled()) {
        Backup.createBackup(appState.movies);
      }
      
      return false;
    }
  },

  async deleteMovie(id) {
    if (!navigator.onLine && typeof Sync !== 'undefined') {
      console.log('[API] Offline, adding to sync queue');
      return Sync.deleteMovieOffline(id);
    }
    
    try {
      const response = await fetch(
        `${Config.SUPABASE_URL}/rest/v1/movies?id=eq.${id}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': Config.SUPABASE_KEY,
            'Authorization': `Bearer ${Config.SUPABASE_KEY}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      appState.movies = appState.movies.filter(m => m.id !== id);
      
      if (typeof Cache !== 'undefined') {
        await Cache.deleteMovie(id);
      }
      
      if (typeof Backup !== 'undefined' && Backup.isAutoBackupEnabled()) {
        Backup.createBackup(appState.movies);
      }
      
      return true;
    } catch (err) {
      console.error('删除失败:', err);
      appState.movies = appState.movies.filter(m => m.id !== id);
      localStorage.setItem(Config.STORAGE_KEYS.MOVIES, JSON.stringify(appState.movies));
      
      if (typeof Backup !== 'undefined' && Backup.isAutoBackupEnabled()) {
        Backup.createBackup(appState.movies);
      }
      
      return false;
    }
  },

  /**
   * 获取云端设置
   */
  async fetchCloudSettings() {
    try {
      const response = await fetch(
        `${Config.SUPABASE_URL}/rest/v1/settings?key=eq.global`,
        {
          headers: {
            'apikey': Config.SUPABASE_KEY,
            'Authorization': `Bearer ${Config.SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0 && data[0].value) {
          const settings = JSON.parse(data[0].value);
          Object.assign(cloudSettings, settings);
          if (settings.theme) {
            config.theme = settings.theme;
            localStorage.setItem(Config.STORAGE_KEYS.CONFIG, JSON.stringify(config));
          }
          if (settings.customGenres && settings.customGenres.length > 0) {
            appState.customGenres = settings.customGenres;
            localStorage.setItem(Config.STORAGE_KEYS.GENRES, JSON.stringify(settings.customGenres));
          }
          if (settings.wishlist && settings.wishlist.length > 0) {
            // 保存到 localStorage，由 loadMovies() 统一合并到 movies 数组
            localStorage.setItem(Config.STORAGE_KEYS.WISHLIST, JSON.stringify(settings.wishlist));
          }
          if (settings.unlockedAchievements && settings.unlockedAchievements.length > 0) {
            appState.unlockedAchievements = settings.unlockedAchievements;
            localStorage.setItem(Config.STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(settings.unlockedAchievements));
          }
        }
      }
    } catch (err) {
      console.error('获取云端设置失败:', err);
    }
  },

  /**
   * 保存云端设置（统一序列化所有可同步状态）
   */
  async saveCloudSettings() {
    try {
      const value = JSON.stringify({
        bgType: cloudSettings.bgType,
        bgImage: cloudSettings.bgImage,
        bgGif: cloudSettings.bgGif,
        bgVideo: cloudSettings.bgVideo,
        bgMaskOpacity: cloudSettings.bgMaskOpacity,
        cardOpacity: cloudSettings.cardOpacity,
        theme: config.theme,
        customGenres: appState.customGenres,
        wishlist: appState.movies
          .filter(m => m.status === 'wishlist')
          .map(m => ({
            id: m.id, movie_name: m.movie_name, tmdb_id: m.tmdb_id,
            poster_path: m.poster_path, year: m.year, rating: m.rating, added_at: m.added_at
          })),
        unlockedAchievements: appState.unlockedAchievements
      });
      
      const checkResponse = await fetch(
        `${Config.SUPABASE_URL}/rest/v1/settings?key=eq.global`,
        {
          headers: {
            'apikey': Config.SUPABASE_KEY,
            'Authorization': `Bearer ${Config.SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const existing = await checkResponse.json();
      
      if (existing && existing.length > 0) {
        await fetch(
          `${Config.SUPABASE_URL}/rest/v1/settings?key=eq.global`,
          {
            method: 'PATCH',
            headers: {
              'apikey': Config.SUPABASE_KEY,
              'Authorization': `Bearer ${Config.SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value })
          }
        );
      } else {
        await fetch(
          `${Config.SUPABASE_URL}/rest/v1/settings`,
          {
            method: 'POST',
            headers: {
              'apikey': Config.SUPABASE_KEY,
              'Authorization': `Bearer ${Config.SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key: 'global', value })
          }
        );
      }
    } catch (err) {
      console.error('保存云端设置失败:', err);
    }
  },

  /**
   * TMDB 搜索电影
   */
  async searchTmdb(query) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${Config.TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=zh-CN`
      );
      
      if (!response.ok) {
        throw new Error(`TMDB API 错误: ${response.status}`);
      }
      
      const data = await response.json();
      return data.results ? data.results.slice(0, 5) : [];
    } catch (err) {
      console.error('TMDB 搜索失败:', err);
      return [];
    }
  },

  /**
   * 获取 TMDB 电影详情
   */
  async getTmdbMovieDetails(tmdbId) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${Config.TMDB_API_KEY}&language=zh-CN`
      );
      
      if (!response.ok) {
        throw new Error(`TMDB API 错误: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error('获取 TMDB 详情失败:', err);
      return null;
    }
  },

  /**
   * 获取 TMDB 电影演职人员
   */
  async getTmdbCredits(tmdbId) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${Config.TMDB_API_KEY}&language=zh-CN`
      );
      
      if (!response.ok) {
        throw new Error(`TMDB API 错误: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error('获取 TMDB 演职人员失败:', err);
      return { crew: [], cast: [] };
    }
  },

  /**
   * 带重试的云端设置获取
   */
  async fetchCloudSettingsWithRetry(retryCount = 3) {
    for (let i = 0; i < retryCount; i++) {
      try {
        await this.fetchCloudSettings();
        if (cloudSettings.bgImage || cloudSettings.bgGif || cloudSettings.bgVideo || cloudSettings.cardOpacity !== 100) {
          return true;
        }
      } catch (e) {
        console.log(`获取云端设置第${i+1}次失败`);
      }
      
      if (i < retryCount - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    return false;
  }
};
