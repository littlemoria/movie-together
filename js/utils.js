/**
 * 工具函数模块
 * 包含日期处理、数据统计、DOM 操作等工具函数
 */

const Utils = {
  /**
   * 计算电影总时长（分钟）
   * @param {Array} movieList - 电影列表
   * @returns {number} 总时长
   */
  getTotalMinutes(movieList) {
    return movieList.reduce((sum, m) => sum + (m.duration_minutes || 0), 0);
  },

  /**
   * 格式化日期为 MM/DD 格式
   * @param {string} dateStr - 日期字符串
   * @returns {string} 格式化后的日期
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  },

  /**
   * 获取月份的 key（YYYY-MM 格式）
   * @param {string} dateStr - 日期字符串
   * @returns {string} YYYY-MM 格式
   */
  getMonthKey(dateStr) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  },

  /**
   * 获取类型名称
   * @param {string} id - 类型ID
   * @returns {string} 类型名称
   */
  getGenreName(id) {
    const allGenres = [...Config.DEFAULT_GENRES, ...appState.customGenres];
    const genre = allGenres.find(g => g.id === id);
    return genre ? genre.name : id;
  },

  /**
   * 获取多个类型名称
   * @param {string} genres - 类型ID列表（逗号分隔）
   * @returns {string} 类型名称列表
   */
  getGenreNames(genres) {
    if (!genres) return '';
    return genres.split(',').map(g => this.getGenreName(g)).filter(Boolean).join(', ');
  },

  /**
   * 获取类型ID对应的颜色
   * @param {number} index - 索引
   * @returns {string} 颜色值
   */
  getGenreColor(index) {
    const colors = ['#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#74B9FF', '#A29BFE', '#FD79A8', '#00CEC9'];
    return colors[index % colors.length];
  },

  /**
   * 获取类型统计
   * @param {Array} movies - 电影列表
   * @returns {Object} 类型统计对象
   */
  getGenreStats(movies) {
    const genreCounts = {};
    movies.forEach(m => {
      if (m.genre) {
        m.genre.split(',').forEach(g => {
          if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
        });
      }
    });
    return genreCounts;
  },

  /**
   * 获取月度统计
   * @param {Array} movies - 电影列表
   * @param {number} months - 月份数
   * @returns {Object} 月度统计对象
   */
  getMonthlyStats(movies, months = 12) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    // 生成最近 N 个月的 key 列表
    const monthKeys = [];
    const monthLabels = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
      monthLabels.push(`${d.getMonth() + 1}月`);
    }
    
    // 统计
    const monthlyCounts = {};
    movies.forEach(m => {
      const k = this.getMonthKey(m.watch_date);
      monthlyCounts[k] = (monthlyCounts[k] || 0) + 1;
    });
    
    return { monthKeys, monthLabels, monthlyCounts };
  },

  /**
   * 从 localStorage 加载配置
   */
  loadConfig() {
    const saved = localStorage.getItem(Config.STORAGE_KEYS.CONFIG);
    if (saved) {
      try {
        config = { ...config, ...JSON.parse(saved) };
      } catch (e) {
        console.error('加载配置失败:', e);
      }
    }
    // 强制使用默认密码
    config.adminPassword = Config.DEFAULT_ADMIN_PASSWORD;
  },

  /**
   * 保存配置到 localStorage
   */
  saveConfig() {
    localStorage.setItem(Config.STORAGE_KEYS.CONFIG, JSON.stringify(config));
  },

  /**
   * 从 localStorage 加载自定义类型
   */
  loadCustomGenres() {
    const saved = localStorage.getItem(Config.STORAGE_KEYS.GENRES);
    if (saved) {
      try {
        appState.customGenres = JSON.parse(saved);
      } catch (e) {
        console.error('加载自定义类型失败:', e);
      }
    }
  },

  /**
   * 保存自定义类型到 localStorage
   */
  saveCustomGenres() {
    localStorage.setItem(Config.STORAGE_KEYS.GENRES, JSON.stringify(appState.customGenres));
  },

  /**
   * 添加自定义类型
   * @param {string} name - 类型名称
   * @returns {boolean} 是否添加成功
   */
  addCustomGenre(name) {
    const trimmedName = name.trim();
    if (!trimmedName) return false;
    
    const id = trimmedName.toLowerCase().replace(/\s+/g, '-');
    if (appState.customGenres.find(g => g.id === id)) {
      return false;
    }
    
    appState.customGenres.push({ id, name: trimmedName });
    this.saveCustomGenres();
    return true;
  },

  /**
   * 显示提示信息（替代 alert）
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型 (success, error, info)
   */
  showToast(message, type = 'info') {
    // 移除旧提示
    const oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 触发动画
    requestAnimationFrame(() => {
      toast.classList.add('active');
    });
    
    // 自动移除
    setTimeout(() => {
      toast.classList.remove('active');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  /**
   * 确认对话框（替代 confirm）
   * @param {string} message - 确认消息
   * @returns {Promise<boolean>}
   */
  async confirm(message) {
    return new Promise(resolve => {
      const confirmed = window.confirm(message);
      resolve(confirmed);
    });
  },

  /**
   * 生成海报 HTML
   * @param {Object} movie - 电影对象
   * @returns {string} HTML 字符串
   */
  getPosterHtml(movie) {
    if (movie.poster_path) {
      return `<img class="movie-card-poster" src="${Config.TMDB_IMAGE_BASE}${movie.poster_path}" alt="${movie.movie_name}" loading="lazy">`;
    }
    return `<div class="movie-card-poster" style="background: linear-gradient(135deg, #6C5CE7, #a29bfe); display: flex; align-items: center; justify-content: center; font-size: 30px;">🎬</div>`;
  },

  /**
   * 生成大海报 HTML（用于详情页）
   * @param {Object} movie - 电影对象
   * @returns {string} HTML 字符串
   */
  getLargePosterHtml(movie) {
    if (movie.poster_path) {
      return `<img class="movie-detail-poster" src="${Config.TMDB_IMAGE_BASE_LG}${movie.poster_path}" alt="${movie.movie_name}">`;
    }
    return `<div class="no-poster-placeholder">🎬</div>`;
  },

  /**
   * 防抖函数
   * @param {Function} func - 要防抖的函数
   * @param {number} wait - 等待时间
   * @returns {Function}
   */
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * 节流函数
   * @param {Function} func - 要节流的函数
   * @param {number} limit - 间隔时间
   * @returns {Function}
   */
  throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
};
