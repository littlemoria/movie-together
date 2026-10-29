const Sync = {
  isSyncing: false,
  syncInterval: null,
  SYNC_INTERVAL_MS: 5 * 60 * 1000,
  
  async init() {
    if (typeof Cache !== 'undefined') {
      await Cache.init();
    }
    
    this.startAutoSync();
    
    if (typeof Offline !== 'undefined') {
      Offline.onStatusChange((isOnline) => {
        if (isOnline) {
          this.processSyncQueue();
        }
      });
    }
    
    console.log('[Sync] Sync module initialized');
  },
  
  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.sync();
      }
    }, this.SYNC_INTERVAL_MS);
  },
  
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  },
  
  async sync() {
    if (this.isSyncing) {
      console.log('[Sync] Already syncing, skipping');
      return;
    }
    
    if (!navigator.onLine) {
      console.log('[Sync] Offline, skipping sync');
      return;
    }
    
    this.isSyncing = true;
    console.log('[Sync] Starting sync...');
    
    try {
      // 处理离线队列
      await this.processSyncQueue();
      
      const lastSync = await Cache.getLastSyncTime();
      console.log('[Sync] Last sync:', lastSync);
      
      // 获取云端数据
      const movies = await API.fetchAllMovies();
      
      if (movies && movies.length > 0) {
        await Cache.saveMovies(movies);
        if (typeof Store !== 'undefined') {
          Store.setMovies(movies);
        } else {
          appState.movies = movies;
        }
        
        if (typeof Components !== 'undefined') {
          Components.renderHome();
          Components.renderMovies();
        }
        
        // 显示同步成功提示
        if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
          Utils.showToast(`同步成功！共 ${movies.length} 部电影`, 'success');
        }
      } else {
        // 显示同步完成但无数据提示
        if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
          Utils.showToast('同步完成，暂无新数据', 'info');
        }
      }
      
      console.log('[Sync] Sync completed');
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      // 显示同步失败提示
      if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
        Utils.showToast('同步失败，请检查网络连接', 'error');
      }
    } finally {
      this.isSyncing = false;
    }
  },
  
  async processSyncQueue() {
    if (typeof Cache === 'undefined') return;
    
    const queue = await Cache.getSyncQueue();
    
    if (queue.length === 0) {
      console.log('[Sync] Sync queue is empty');
      return;
    }
    
    console.log('[Sync] Processing', queue.length, 'queued items');
    
    let successCount = 0;
    let failedCount = 0;
    
    // 显示离线操作正在同步
    if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
      Utils.showToast(`正在同步 ${queue.length} 条离线操作...`, 'info');
    }
    
    for (const item of queue) {
      try {
        await this.processQueueItem(item);
        await Cache.removeSyncQueueItem(item.id);
        successCount++;
        console.log('[Sync] Processed:', item.action);
      } catch (error) {
        failedCount++;
        console.error('[Sync] Failed to process item:', item, error);
      }
    }
    
    // 显示离线操作同步结果（按实际成功数量提示，失败项保留在队列中）
    if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
      if (failedCount === 0) {
        Utils.showToast(`已同步 ${successCount} 条离线操作`, 'success');
      } else {
        Utils.showToast(`已同步 ${successCount} 条，${failedCount} 条失败（稍后重试）`, 'warning');
      }
    }
  },
  
  async processQueueItem(item) {
    const { action, data } = item;
    
    switch (action) {
      case 'add':
        await API.saveMovie(data, null, { fromSync: true, prepend: true });
        break;
      case 'update':
        await API.saveMovie(data, data.id, { fromSync: true });
        break;
      case 'delete':
        await API.deleteMovie(data.id, { fromSync: true });
        break;
      default:
        console.warn('[Sync] Unknown action:', action);
    }
  },
  
  async addMovieOffline(movieData, options = {}) {
    if (typeof Cache === 'undefined') {
      throw new Error('Cache not available');
    }
    
    const tempId = MovieDomain.createLocalId();
    const movie = MovieDomain.normalizeMovie({
      ...movieData,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _pending: true
    });
    
    await Cache.saveMovies([movie]);
    await Cache.addToSyncQueue('add', { ...movieData, id: tempId });
    
    // 通过 Store 更新共享状态，保证归一化与数据版本一致
    if (typeof Store !== 'undefined') {
      Store.upsertMovie(movie, { prepend: options.prepend !== false });
    } else {
      appState.movies = options.prepend === false
        ? [...appState.movies, movie]
        : [movie, ...appState.movies];
    }
    
    return movie;
  },
  
  async updateMovieOffline(movieData) {
    if (typeof Cache === 'undefined') {
      throw new Error('Cache not available');
    }
    
    const movie = MovieDomain.normalizeMovie({
      ...movieData,
      updated_at: new Date().toISOString(),
      _pending: true
    });
    
    await Cache.saveMovies([movie]);
    await Cache.addToSyncQueue('update', movieData);
    
    if (typeof Store !== 'undefined') {
      Store.upsertMovie(movie, { prepend: false });
    } else {
      const index = appState.movies.findIndex(m => String(m.id) === String(movieData.id));
      if (index !== -1) {
        appState.movies[index] = movie;
      }
    }
    
    return movie;
  },
  
  async deleteMovieOffline(id) {
    if (typeof Cache === 'undefined') {
      throw new Error('Cache not available');
    }
    
    await Cache.deleteMovie(id);
    await Cache.addToSyncQueue('delete', { id });
    
    if (typeof Store !== 'undefined') {
      Store.removeMovie(id);
    } else {
      appState.movies = appState.movies.filter(m => String(m.id) !== String(id));
    }
  },
  
  async loadFromCache() {
    if (typeof Cache === 'undefined') return null;
    
    try {
      const movies = await Cache.getMovies();
      if (movies && movies.length > 0) {
        appState.movies = movies;
        console.log('[Sync] Loaded', movies.length, 'movies from cache');
        return movies;
      }
    } catch (error) {
      console.error('[Sync] Failed to load from cache:', error);
    }
    
    return null;
  }
};

window.Sync = Sync;
