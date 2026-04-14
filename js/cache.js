const Cache = {
  DB_NAME: 'cinememo_cache',
  DB_VERSION: 1,
  STORES: {
    MOVIES: 'movies',
    SYNC_QUEUE: 'sync_queue',
    METADATA: 'metadata'
  },
  db: null,
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => {
        console.error('[Cache] Failed to open IndexedDB');
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[Cache] IndexedDB initialized');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(this.STORES.MOVIES)) {
          const moviesStore = db.createObjectStore(this.STORES.MOVIES, { keyPath: 'id' });
          moviesStore.createIndex('updated_at', 'updated_at', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(this.STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(this.STORES.SYNC_QUEUE, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(this.STORES.METADATA)) {
          db.createObjectStore(this.STORES.METADATA, { keyPath: 'key' });
        }
      };
    });
  },
  
  async saveMovies(movies) {
    if (!this.db) await this.init();
    
    const tx = this.db.transaction(this.STORES.MOVIES, 'readwrite');
    const store = tx.objectStore(this.STORES.MOVIES);
    
    const promises = movies.map(movie => {
      return new Promise((resolve, reject) => {
        const request = store.put({
          ...movie,
          cached_at: new Date().toISOString()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    
    await Promise.all(promises);
    await this.setMetadata('last_sync', new Date().toISOString());
    console.log('[Cache] Saved', movies.length, 'movies');
  },
  
  async getMovies() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.MOVIES, 'readonly');
      const store = tx.objectStore(this.STORES.MOVIES);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const movies = request.result || [];
        console.log('[Cache] Retrieved', movies.length, 'movies from cache');
        resolve(movies);
      };
      
      request.onerror = () => reject(request.error);
    });
  },
  
  async getMovie(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.MOVIES, 'readonly');
      const store = tx.objectStore(this.STORES.MOVIES);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async deleteMovie(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.MOVIES, 'readwrite');
      const store = tx.objectStore(this.STORES.MOVIES);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async clearMovies() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.MOVIES, 'readwrite');
      const store = tx.objectStore(this.STORES.MOVIES);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async addToSyncQueue(action, data) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(this.STORES.SYNC_QUEUE);
      
      const request = store.add({
        action,
        data,
        timestamp: new Date().toISOString()
      });
      
      request.onsuccess = () => {
        console.log('[Cache] Added to sync queue:', action);
        resolve(request.result);
      };
      
      request.onerror = () => reject(request.error);
    });
  },
  
  async getSyncQueue() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.SYNC_QUEUE, 'readonly');
      const store = tx.objectStore(this.STORES.SYNC_QUEUE);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },
  
  async removeSyncQueueItem(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(this.STORES.SYNC_QUEUE);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async clearSyncQueue() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(this.STORES.SYNC_QUEUE);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async setMetadata(key, value) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.METADATA, 'readwrite');
      const store = tx.objectStore(this.STORES.METADATA);
      const request = store.put({ key, value });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async getMetadata(key) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORES.METADATA, 'readonly');
      const store = tx.objectStore(this.STORES.METADATA);
      const request = store.get(key);
      
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  async getLastSyncTime() {
    return this.getMetadata('last_sync');
  }
};

window.Cache = Cache;
