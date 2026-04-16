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
        appState.movies = movies;
        
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
    
    // 显示离线操作正在同步
    if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
      Utils.showToast(`正在同步 ${queue.length} 条离线操作...`, 'info');
    }
    
    for (const item of queue) {
      try {
        await this.processQueueItem(item);
        await Cache.removeSyncQueueItem(item.id);
        console.log('[Sync] Processed:', item.action);
      } catch (error) {
        console.error('[Sync] Failed to process item:', item, error);
      }
    }
    
    // 显示离线操作同步完成
    if (typeof Utils !== 'undefined' && typeof Utils.showToast === 'function') {
      Utils.showToast(`已同步 ${queue.length} 条离线操作`, 'success');
    }
  },
  
  async processQueueItem(item) {
    const { action, data } = item;
    
    switch (action) {
      case 'add':
        await API.addMovie(data);
        break;
      case 'update':
        await API.updateMovie(data);
        break;
      case 'delete':
        await API.deleteMovie(data.id);
        break;
      default:
        console.warn('[Sync] Unknown action:', action);
    }
  },
  
  async addMovieOffline(movieData) {
    if (typeof Cache === 'undefined') {
      throw new Error('Cache not available');
    }
    
    const tempId = 'temp_' + Date.now();
    const movie = {
      ...movieData,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _pending: true
    };
    
    await Cache.saveMovies([movie]);
    await Cache.addToSyncQueue('add', movieData);
    
    appState.movies.push(movie);
    
    return movie;
  },
  
  async updateMovieOffline(movieData) {
    if (typeof Cache === 'undefined') {
      throw new Error('Cache not available');
    }
    
    const movie = {
      ...movieData,
      updated_at: new Date().toISOString(),
      _pending: true
    };
    
    await Cache.saveMovies([movie]);
    await Cache.addToSyncQueue('update', movieData);
    
    const index = appState.movies.findIndex(m => m.id === movieData.id);
    if (index !== -1) {
      appState.movies[index] = movie;
    }
    
    return movie;
  },
  
  async deleteMovieOffline(id) {
    if (typeof Cache === 'undefined') {
      throw new Error('Cache not available');
    }
    
    await Cache.deleteMovie(id);
    await Cache.addToSyncQueue('delete', { id });
    
    appState.movies = appState.movies.filter(m => m.id !== id);
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
