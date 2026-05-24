/**
 * Backup 模块
 * 实现自动本地备份和恢复功能
 */

const Backup = {
  MAX_BACKUPS: 5,
  STORAGE_KEY: 'cinememo_backups',
  AUTO_BACKUP_KEY: 'cinememo_auto_backup_enabled',

  /**
   * 创建备份
   * @param {Array} movies - 电影数据
   * @returns {Object} 备份信息
   */
  createBackup(movies) {
    const backup = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      version: '1.0',
      count: movies.length,
      data: movies
    };

    const backups = this.getAllBackups();
    backups.unshift(backup);

    if (backups.length > this.MAX_BACKUPS) {
      backups.splice(this.MAX_BACKUPS);
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backups));
      console.log('[Backup] Created backup with', movies.length, 'movies');
      return backup;
    } catch (e) {
      console.error('[Backup] Failed to create backup:', e);
      return null;
    }
  },

  /**
   * 获取所有备份
   * @returns {Array} 备份列表
   */
  getAllBackups() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[Backup] Failed to get backups:', e);
      return [];
    }
  },

  /**
   * 获取最新的备份
   * @returns {Object|null} 最新备份
   */
  getLatestBackup() {
    const backups = this.getAllBackups();
    return backups.length > 0 ? backups[0] : null;
  },

  /**
   * 获取指定备份
   * @param {number} id - 备份ID
   * @returns {Object|null} 备份数据
   */
  getBackupById(id) {
    const backups = this.getAllBackups();
    return backups.find(b => b.id === id) || null;
  },

  /**
   * 删除指定备份
   * @param {number} id - 备份ID
   */
  deleteBackup(id) {
    const backups = this.getAllBackups();
    const filtered = backups.filter(b => b.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    console.log('[Backup] Deleted backup', id);
  },

  /**
   * 清除所有备份
   */
  clearAllBackups() {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('[Backup] Cleared all backups');
  },

  /**
   * 下载备份文件
   * @param {Object} backup - 备份数据（可选，不传则下载最新）
   */
  downloadBackup(backup = null) {
    const data = backup || this.getLatestBackup();
    if (!data) {
      Utils.showToast('没有可下载的备份', 'error');
      return;
    }

    const exportData = {
      ...data,
      exportedAt: new Date().toISOString(),
      appName: 'CineMemo'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const date = new Date(data.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    a.href = url;
    a.download = `cinememo_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);

    Utils.showToast('备份已下载', 'success');
  },

  /**
   * 从文件恢复备份
   * @param {File} file - 备份文件
   * @returns {Promise<Object>} 解析后的备份数据
   */
  async parseBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.data && Array.isArray(data.data)) {
            resolve(data);
          } else {
            reject(new Error('无效的备份文件格式'));
          }
        } catch (err) {
          reject(new Error('无法解析备份文件'));
        }
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  },

  /**
   * 执行数据恢复
   * @param {Array} movies - 要恢复的电影数据
   * @param {boolean} toCloud - 是否同步到云端
   * @returns {Promise<boolean>} 是否成功
   */
  async restore(movies, toCloud = true) {
    try {
      appState.movies = movies;

      localStorage.setItem(Config.STORAGE_KEYS.MOVIES, JSON.stringify(movies));

      if (toCloud && navigator.onLine) {
        Utils.showToast('正在同步到云端...', 'info');

        for (const movie of movies) {
          await API.saveMovie(movie);
        }
      }

      Components.renderHome();
      Components.renderMovies();
      Components.renderAchievements();
      Components.renderStats();

      this.createBackup(movies);

      Utils.showToast(`已恢复 ${movies.length} 条记录`, 'success');
      return true;
    } catch (e) {
      console.error('[Backup] Restore failed:', e);
      Utils.showToast('恢复失败', 'error');
      return false;
    }
  },

  /**
   * 格式化备份时间
   * @param {string} timestamp - ISO 时间戳
   * @returns {string} 格式化后的时间
   */
  formatBackupTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) {
      return Math.floor(diff / 3600000) + '小时前';
    } else if (diff < 604800000) {
      return Math.floor(diff / 86400000) + '天前';
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  },

  /**
   * 获取备份统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const backups = this.getAllBackups();
    const latest = backups[0];

    return {
      total: backups.length,
      latestTime: latest ? latest.timestamp : null,
      latestCount: latest ? latest.count : 0,
      totalMovies: latest ? latest.count : 0
    };
  },

  /**
   * 设置自动备份开关
   * @param {boolean} enabled - 是否启用
   */
  setAutoBackup(enabled) {
    localStorage.setItem(this.AUTO_BACKUP_KEY, enabled ? 'true' : 'false');
  },

  /**
   * 获取自动备份开关状态
   * @returns {boolean} 是否启用
   */
  isAutoBackupEnabled() {
    return localStorage.getItem(this.AUTO_BACKUP_KEY) !== 'false';
  }
};

window.Backup = Backup;