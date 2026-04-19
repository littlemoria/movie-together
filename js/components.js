/**
 * UI 组件模块
 * 包含所有页面和组件的渲染逻辑
 */

const Components = {
  /**
   * 渲染首页
   */
  renderHome() {
    const sorted = [...appState.movies].sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date));
    const totalMinutes = Utils.getTotalMinutes(appState.movies);
    
    document.getElementById('total-movies').textContent = appState.movies.length;
    document.getElementById('total-hours').textContent = Math.floor(totalMinutes / 60);
    document.getElementById('total-minutes').textContent = totalMinutes % 60;
    
    document.getElementById('page-title').textContent = 'CineMemo';
    
    const recentDiv = document.getElementById('recent-movies');
    if (sorted.length === 0) {
      recentDiv.innerHTML = '<p class="empty-state">还没有记录，开始你们的第一次吧～</p>';
    } else {
      recentDiv.innerHTML = sorted.slice(0, 3).map(m => this.renderMovieCard(m)).join('');
      this.bindMovieCardClicks();
      this.initLazyLoad();
    }
  },

  initLazyLoad() {
    if (typeof LazyLoad !== 'undefined') {
      // 延迟执行，确保 DOM 完全渲染
      setTimeout(() => {
        LazyLoad.refresh();
      }, 100);
    }
  },

  /**
   * 渲染电影卡片
   * @param {Object} movie - 电影对象
   * @returns {string} HTML 字符串
   */
  renderMovieCard(movie) {
    const genreHtml = movie.genre ? `<span class="movie-badge">${Utils.getGenreNames(movie.genre)}</span>` : '';
    const posterHtml = Utils.getPosterHtml(movie);
    
    return `<div class="movie-card movie-card-with-poster" data-id="${movie.id}">
      ${posterHtml}
      <div class="movie-card-info">
        <div class="movie-title">${movie.movie_name}</div>
        <div class="movie-meta">
          ${Utils.formatDate(movie.watch_date)} · ${movie.duration_minutes || '?'}分钟
          ${movie.created_by ? ' · ' + movie.created_by : ''}
        </div>
        ${genreHtml}
      </div>
    </div>`;
  },

  /**
   * 绑定电影卡片点击事件
   */
  bindMovieCardClicks() {
    document.querySelectorAll('.movie-card').forEach(card => {
      card.onclick = () => {
        const id = card.getAttribute('data-id');
        this.showMovieDetail(id);
      };
    });
  },

  /**
   * 显示电影详情弹窗
   * @param {string} id - 电影ID
   */
  showMovieDetail(id) {
    const movie = appState.movies.find(m => m.id == id);
    if (!movie) return;
    
    // 如果是管理员，点击可以编辑
    if (appState.isAdmin) {
      if (confirm('是否编辑这条记录？\n\n点击确定进入编辑模式')) {
        App.showMovieModal(movie);
        return;
      }
    }
    
    // 构建详情 HTML
    const posterHtml = Utils.getLargePosterHtml(movie);
    const ratingHtml = movie.rating ? `<div class="movie-detail-rating"><span class="star">⭐</span><span>${movie.rating}/10</span></div>` : '';
    const directorHtml = movie.director ? `<div class="movie-detail-section"><div class="movie-detail-section-title">导演</div><div class="movie-detail-director">${movie.director}</div></div>` : '';
    const castHtml = movie.cast ? `<div class="movie-detail-section"><div class="movie-detail-section-title">主演</div><div class="movie-detail-cast">${movie.cast}</div></div>` : '';
    
    const detailHtml = `
      <div id="movie-detail-modal" class="modal movie-detail-modal">
        <div class="modal-content">
          <span class="close" onclick="Components.hideMovieDetail()">&times;</span>
          <h2>${movie.movie_name}</h2>
          <div class="movie-detail-header">
            ${posterHtml}
            <div class="movie-detail-info">
              <div class="movie-detail-meta">
                观影日期：${Utils.formatDate(movie.watch_date)}<br>
                时长：${movie.duration_minutes || '?'}分钟<br>
                类型：${Utils.getGenreNames(movie.genre) || '未分类'}<br>
                记录人：${movie.created_by || 'TA'}
              </div>
              ${ratingHtml}
              ${directorHtml}
              ${castHtml}
            </div>
          </div>
          <div style="text-align: center; margin-top: 20px;">
            ${appState.isAdmin ? `<button class="btn-primary" onclick="Components.hideMovieDetail(); App.showMovieModal(appState.movies.find(m => m.id == '${id}'));">✏️ 编辑</button>` : '<p style="color: var(--text-secondary); font-size: 14px;">登录后可编辑记录</p>'}
          </div>
        </div>
      </div>
    `;
    
    // 移除旧的弹窗
    const oldModal = document.getElementById('movie-detail-modal');
    if (oldModal) oldModal.remove();
    
    // 添加新弹窗
    document.body.insertAdjacentHTML('beforeend', detailHtml);
    document.getElementById('movie-detail-modal').classList.add('active');
    
    this.initLazyLoad();
    
    document.getElementById('movie-detail-modal').onclick = (e) => {
      if (e.target.id === 'movie-detail-modal') this.hideMovieDetail();
    };
  },

  /**
   * 隐藏电影详情弹窗
   */
  hideMovieDetail() {
    const modal = document.getElementById('movie-detail-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
  },

  /**
   * 渲染影单页面
   */
  renderMovies() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const genre = document.getElementById('genre-filter').value;
    const year = document.getElementById('year-filter').value;
    const month = document.getElementById('month-filter').value;
    
    let filtered = [...appState.movies].sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date));
    
    if (search) {
      filtered = filtered.filter(m => m.movie_name.toLowerCase().includes(search));
    }
    if (genre) {
      filtered = filtered.filter(m => (m.genre || '').includes(genre));
    }
    if (year) {
      filtered = filtered.filter(m => {
        const movieYear = new Date(m.watch_date).getFullYear().toString();
        return movieYear === year;
      });
    }
    if (month) {
      filtered = filtered.filter(m => {
        const movieMonth = (new Date(m.watch_date).getMonth() + 1).toString();
        return movieMonth === month;
      });
    }
    
    const container = document.getElementById('all-movies');
    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">没有找到匹配的电影</p>';
    } else {
      container.innerHTML = filtered.map(m => this.renderMovieCard(m)).join('');
      this.bindMovieCardClicks();
      this.initLazyLoad();
    }
    
    this.updateYearFilter();
  },

  /**
   * 筛选电影（防抖）
   */
  filterMovies() {
    Utils.debounce(() => this.renderMovies(), 300)();
  },

  /**
   * 清除所有筛选条件
   */
  clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('genre-filter').value = '';
    document.getElementById('year-filter').value = '';
    document.getElementById('month-filter').value = '';
    this.renderMovies();
    toast.info('已清除所有筛选条件');
  },

  /**
   * 渲染成就页面
   */
  renderAchievements() {
    const container = document.getElementById('achievements-grid');
    container.innerHTML = Config.ACHIEVEMENTS.map(achievement => {
      const unlocked = achievement.condition(appState.movies);
      return `<div class="achievement-card ${unlocked ? 'unlocked' : ''}">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-name">${achievement.name}</div>
        <div class="achievement-desc">${achievement.desc}</div>
      </div>`;
    }).join('');
  },

  /**
   * 渲染统计页面
   */
  renderStats() {
    const totalMinutes = Utils.getTotalMinutes(appState.movies);
    
    // 更新基本统计
    document.getElementById('stat-total').textContent = appState.movies.length;
    document.getElementById('stat-hours').textContent = Math.floor(totalMinutes / 60);
    document.getElementById('stat-avg').textContent = appState.movies.length ? Math.round(totalMinutes / appState.movies.length) : 0;
    
    // 类型统计
    const genreCounts = Utils.getGenreStats(appState.movies);
    this.drawPieChart(genreCounts);
    this.renderGenreChart(genreCounts);
    
    // 月度统计
    this.renderMonthlyChart();
  },

  /**
   * 绘制扇形图
   * @param {Object} genreCounts - 类型统计
   */
  drawPieChart(genreCounts) {
    const canvas = document.getElementById('pie-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const entries = Object.entries(genreCounts);
    if (entries.length === 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#E0E0E0';
      ctx.fill();
      ctx.fillStyle = '#636E72';
      ctx.font = '14px Noto Sans SC';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', centerX, centerY);
      return;
    }
    
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    let startAngle = -Math.PI / 2;
    
    entries.forEach(([, count], i) => {
      const sliceAngle = (count / total) * 2 * Math.PI;
      
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = Utils.getGenreColor(i);
      ctx.fill();
      
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      startAngle += sliceAngle;
    });
    
    // 中心圆
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isDark ? '#1a1a2e' : '#F8F9FA';
    ctx.fill();
  },

  /**
   * 渲染类型分布图
   * @param {Object} genreCounts - 类型统计
   */
  renderGenreChart(genreCounts) {
    const container = document.getElementById('genre-chart');
    if (!container) return;
    
    const entries = Object.entries(genreCounts);
    if (entries.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无数据</p>';
      return;
    }
    
    container.innerHTML = entries.map(([genre, count], i) => {
      const percentage = appState.movies.length ? Math.round(count / appState.movies.length * 100) : 0;
      return `<div class="genre-item">
        <span class="genre-dot" style="background: ${Utils.getGenreColor(i)}"></span>
        <span>${Utils.getGenreName(genre)}</span>
        <span class="genre-count">${count} (${percentage}%)</span>
      </div>`;
    }).join('');
  },

  /**
   * 渲染月度统计图
   */
  renderMonthlyChart() {
    const { monthKeys, monthLabels, monthlyCounts } = Utils.getMonthlyStats(appState.movies);
    const maxCount = Math.max(...Object.values(monthlyCounts), 1);
    
    const container = document.getElementById('monthly-chart');
    if (!container) return;
    
    container.innerHTML = monthKeys.map((month, i) => {
      const count = monthlyCounts[month] || 0;
      const height = (count / maxCount) * 100;
      return `<div class="month-bar" style="height: ${height}%" data-count="${count}" data-month="${monthLabels[i]}"></div>`;
    }).join('');
  },

  /**
   * 渲染类型选项（添加表单）
   */
  renderGenreOptions() {
    const container = document.getElementById('genre-group');
    if (!container) return;
    
    const allGenres = [...Config.DEFAULT_GENRES, ...appState.customGenres];
    container.innerHTML = allGenres.map(g => 
      `<label><input type="checkbox" name="genre" value="${g.id}"> ${g.name}</label>`
    ).join('');
  },

  /**
   * 渲染筛选选项
   */
  renderFilterOptions() {
    const select = document.getElementById('genre-filter');
    if (!select) return;
    
    const allGenres = [...Config.DEFAULT_GENRES, ...appState.customGenres];
    select.innerHTML = '<option value="">全部类型</option>' + 
      allGenres.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    
    this.updateYearFilter();
  },

  /**
   * 更新年份筛选选项
   */
  updateYearFilter() {
    const select = document.getElementById('year-filter');
    if (!select) {
      setTimeout(() => this.updateYearFilter(), 100);
      return;
    }
    
    if (appState.movies.length === 0) {
      return;
    }
    
    const years = [...new Set(appState.movies.map(m => new Date(m.watch_date).getFullYear()))];
    years.sort((a, b) => b - a);
    
    select.innerHTML = '<option value="">全部年份</option>' + 
      years.map(y => `<option value="${y}">${y}年</option>`).join('');
  },

  /**
   * 显示 TMDB 搜索结果
   * @param {Array} results - 搜索结果
   */
  displayTmdbResults(results) {
    const container = document.getElementById('tmdb-search-results');
    if (!container) return;
    
    if (results.length === 0) {
      container.innerHTML = '<div style="padding: 10px;">未找到相关电影</div>';
      return;
    }
    
    container.innerHTML = results.map((movie, index) => `
      <div class="tmdb-search-item" onclick="Components.selectTmdbMovie(${index})">
        ${movie.poster_path 
          ? `<img src="${Config.TMDB_IMAGE_BASE}${movie.poster_path}" alt="${movie.title}">`
          : `<div style="width: 45px; height: 67px; background: #ddd; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px;">🎬</div>`
        }
        <div class="tmdb-search-item-info">
          <div class="tmdb-search-item-title">${movie.title}</div>
          <div class="tmdb-search-item-year">${movie.release_date ? movie.release_date.split('-')[0] : '未知'}</div>
        </div>
      </div>
    `).join('');
  },

  /**
   * 选择 TMDB 电影
   * @param {number} index - 结果索引
   */
  async selectTmdbMovie(index) {
    const movie = appState.currentTmdbResults[index];
    if (!movie) return;
    
    appState.selectedTmdbMovie = movie;
    
    // 自动填充表单
    document.getElementById('movie-name').value = movie.title;
    if (movie.runtime) {
      document.getElementById('duration').value = movie.runtime;
    }
    
    // 映射类型
    if (movie.genre_ids) {
      const matchedGenres = movie.genre_ids
        .map(id => Config.TMDB_GENRE_MAP[id])
        .filter(Boolean);
      
      document.querySelectorAll('input[name="genre"]').forEach(cb => {
        cb.checked = matchedGenres.includes(cb.value);
      });
    }
    
    // 隐藏搜索结果
    document.getElementById('tmdb-search-results').classList.remove('active');
    
    // 如果需要，获取完整信息
    if (!movie.runtime || !movie.poster_path) {
      const details = await API.getTmdbMovieDetails(movie.id);
      if (details) {
        if (details.runtime) {
          document.getElementById('duration').value = details.runtime;
        }
        appState.selectedTmdbMovie = { ...appState.selectedTmdbMovie, ...details };
      }
    }
  },

  /**
   * 更新背景类型显示
   */
  updateBgInputsFromConfig() {
    // 更新单选框
    document.querySelectorAll('input[name="bg-type"]').forEach(radio => {
      radio.checked = radio.value === config.bgType;
    });
    
    // 显示/隐藏对应输入框
    document.getElementById('bg-image-option').style.display = config.bgType === 'image' ? 'block' : 'none';
    document.getElementById('bg-gif-option').style.display = config.bgType === 'gif' ? 'block' : 'none';
    document.getElementById('bg-video-option').style.display = config.bgType === 'video' ? 'block' : 'none';
    
    // 更新输入框
    document.getElementById('bg-image-url').value = config.bgImage || '';
    document.getElementById('bg-gif-url').value = config.bgGif || '';
    document.getElementById('bg-video-url').value = config.bgVideo || '';
  },

  /**
   * 应用透明度设置
   */
  applyOpacitySettings() {
    document.getElementById('bg-mask-opacity').value = config.bgMaskOpacity;
    document.getElementById('bg-mask-opacity-value').textContent = config.bgMaskOpacity + '%';
    document.getElementById('card-opacity').value = config.cardOpacity;
    document.getElementById('card-opacity-value').textContent = config.cardOpacity + '%';
    document.documentElement.style.setProperty('--card-bg-opacity', config.cardOpacity / 100);
    
    // 更新音乐面板透明度
    const panel = document.getElementById('music-panel');
    if (panel) {
      panel.style.setProperty('--panel-opacity', config.cardOpacity / 100);
    }
  }
};
