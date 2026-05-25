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

    this.hideSkeleton('home');
  },

  hideSkeleton(page) {
    const skeleton = document.getElementById(page + '-skeleton');
    const content = document.getElementById(page + '-content');
    if (skeleton) skeleton.classList.remove('visible');
    if (content) content.classList.add('loaded');
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
    if (appState.movieListMode === 'wishlist') {
      this.renderWishlist();
      return;
    }

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
      container.innerHTML = this.renderMoviesGroupedByMonth(filtered);
      this.bindMovieCardClicks();
      this.initLazyLoad();
    }
    
    this.updateYearFilter();
  },

  /**
   * 渲染 Wish List
   */
  renderWishlist() {
    const search = document.getElementById('search-input').value.toLowerCase();
    let filtered = [...appState.wishlist];

    if (search) {
      filtered = filtered.filter(m => m.movie_name.toLowerCase().includes(search));
    }

    document.getElementById('genre-filter').style.display = appState.movieListMode === 'wishlist' ? 'none' : '';
    document.getElementById('year-filter').style.display = appState.movieListMode === 'wishlist' ? 'none' : '';
    document.getElementById('month-filter').style.display = appState.movieListMode === 'wishlist' ? 'none' : '';

    const container = document.getElementById('all-movies');
    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">还没有想看的电影～<br>在添加电影时可以从 TMDB 搜索结果中一键加入</p>';
    } else {
      container.innerHTML = filtered.map(m => this.renderWishlistCard(m)).join('');
    }
  },

  /**
   * 渲染 Wish List 卡片
   * @param {Object} item - Wish List 项
   * @returns {string} HTML
   */
  renderWishlistCard(item) {
    const posterHtml = item.poster_path
      ? `<img class="movie-card-poster lazy-image" data-src="${Config.TMDB_IMAGE_BASE}${item.poster_path}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${item.movie_name}">`
      : `<div class="movie-card-poster" style="background: linear-gradient(135deg, #6C5CE7, #a29bfe); display: flex; align-items: center; justify-content: center; font-size: 30px;">🎬</div>`;

    return `<div class="movie-card wishlist-card" data-id="${item.id}">
      ${posterHtml}
      <div class="movie-card-info">
        <div class="movie-title">${item.movie_name}</div>
        <div class="movie-meta">${item.year || ''}${item.rating ? ' · ⭐' + item.rating : ''}</div>
        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button class="wishlist-add-btn" onclick="event.stopPropagation(); App.wishlistToWatched('${item.id}')">✅ 已看</button>
          <button class="wishlist-remove-btn" onclick="event.stopPropagation(); App.removeFromWishlist('${item.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  },

  /**
   * 按月份分组渲染电影列表
   * @param {Array} movies - 电影列表
   * @returns {string} HTML
   */
  renderMoviesGroupedByMonth(movies) {
    const groups = {};
    
    movies.forEach(m => {
      const date = new Date(m.watch_date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      
      if (!groups[key]) {
        groups[key] = {
          label: `${year}年${String(month).padStart(2, '0')}月`,
          movies: []
        };
      }
      groups[key].movies.push(m);
    });
    
    let html = '';
    Object.values(groups).forEach(group => {
      html += `
        <div class="movie-month-group">
          <div class="month-group-header">${group.label}</div>
          <div class="month-group-movies">
            ${group.movies.map(m => this.renderMovieCard(m)).join('')}
          </div>
        </div>
      `;
    });
    
    return html;
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
    const prevUnlocked = new Set(appState.unlockedAchievements);
    const newUnlocked = [];

    container.innerHTML = Config.ACHIEVEMENTS.map(achievement => {
      const unlocked = achievement.condition(appState.movies);
      if (unlocked && !prevUnlocked.has(achievement.id)) {
        newUnlocked.push(achievement);
      }
      if (unlocked) {
        appState.unlockedAchievements = [...new Set([...appState.unlockedAchievements, achievement.id])];
      }
      return `<div class="achievement-card ${unlocked ? 'unlocked' : ''}">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-name">${achievement.name}</div>
        <div class="achievement-desc">${achievement.desc}</div>
      </div>`;
    }).join('');

    if (newUnlocked.length > 0) {
      this.saveUnlockedAchievements();
      setTimeout(() => this.showCelebration(newUnlocked), 300);
    }
  },

  saveUnlockedAchievements() {
    localStorage.setItem(Config.STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(appState.unlockedAchievements));
  },

  loadUnlockedAchievements() {
    const saved = localStorage.getItem(Config.STORAGE_KEYS.ACHIEVEMENTS);
    if (saved) {
      try { appState.unlockedAchievements = JSON.parse(saved); } catch (e) {}
    }
  },

  showCelebration(achievements) {
    const overlay = document.getElementById('celebration-overlay');
    const canvas = document.getElementById('confetti-canvas');
    const iconEl = document.getElementById('celebration-icon');
    const titleEl = document.getElementById('celebration-title');
    const descEl = document.getElementById('celebration-desc');

    const ach = achievements[0];
    iconEl.textContent = ach.icon || '🎉';
    titleEl.textContent = `解锁成就：${ach.name}`;
    descEl.textContent = ach.desc;

    overlay.classList.add('active');
    this.startConfetti(canvas);

    setTimeout(() => {
      overlay.classList.remove('active');
    }, 3500);
  },

  startConfetti(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#7B68CE', '#00B894', '#FDCB6E', '#E17055', '#74B9FF', '#A29BFE', '#FD79A8', '#FF6B6B'];
    const confetti = [];
    const particleCount = 120;

    for (let i = 0; i < particleCount; i++) {
      confetti.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height,
        w: Math.random() * 10 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }

    let frame = 0;
    const maxFrames = 140;

    const animate = () => {
      if (frame >= maxFrames) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      confetti.forEach(p => {
        p.x += p.vx;
        p.vy += 0.05;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        if (frame > maxFrames - 40) {
          p.opacity = Math.max(0, p.opacity - 0.025);
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      requestAnimationFrame(animate);
    };

    animate();
  },

  /**
   * 渲染统计页面
   */
  renderStats() {
    const totalMinutes = Utils.getTotalMinutes(appState.movies);
    
    document.getElementById('stat-total').textContent = appState.movies.length;
    document.getElementById('stat-hours').textContent = Math.floor(totalMinutes / 60);
    document.getElementById('stat-avg').textContent = appState.movies.length ? Math.round(totalMinutes / appState.movies.length) : 0;
    
    const genreCounts = Utils.getGenreStats(appState.movies);
    this.drawPieChart(genreCounts);
    this.renderGenreChart(genreCounts);
    this.drawRadarChart(genreCounts);
    this.drawLineChart();
    this.renderMonthlyChart();
    this.renderCalendarHeatmap();
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
    
    const moviesByMonth = {};
    appState.movies.forEach(m => {
      const key = Utils.getMonthKey(m.watch_date);
      if (!moviesByMonth[key]) {
        moviesByMonth[key] = [];
      }
      moviesByMonth[key].push(m);
    });
    
    container.innerHTML = monthKeys.map((month, i) => {
      const count = monthlyCounts[month] || 0;
      const height = (count / maxCount) * 100;
      const movies = moviesByMonth[month] || [];
      const moviesJson = encodeURIComponent(JSON.stringify(movies));
      const year = month.split('-')[0];
      const monthNum = parseInt(month.split('-')[1]);
      const title = `${year}年${monthNum}月`;
      return `<div class="month-bar" style="height: ${height}%" 
        data-count="${count}" 
        data-month="${monthLabels[i]}"
        data-month-key="${month}"
        data-movies="${moviesJson}"
        data-title="${title}"
        onclick="Components.showMonthDetail('${month}')"></div>`;
    }).join('');
  },

  /**
   * 显示月份详情弹窗
   * @param {string} monthKey - 月份 key (YYYY-MM)
   */
  showMonthDetail(monthKey) {
    const movies = appState.movies.filter(m => Utils.getMonthKey(m.watch_date) === monthKey);
    
    if (movies.length === 0) return;
    
    const [year, month] = monthKey.split('-');
    const title = `${year}年${parseInt(month)}月`;
    
    const moviesHtml = movies
      .sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date))
      .map(m => {
        const date = new Date(m.watch_date);
        const day = date.getDate();
        const genres = Utils.getGenreNames(m.genre);
        return `
          <div class="month-detail-item">
            <div class="month-detail-date">${day}日</div>
            <div class="month-detail-info">
              <div class="month-detail-title">${m.movie_name}</div>
              <div class="month-detail-meta">${m.duration_minutes ? m.duration_minutes + '分钟 · ' : ''}${genres}</div>
            </div>
          </div>
        `;
      }).join('');
    
    const html = `
      <div class="modal" id="month-detail-modal">
        <div class="modal-content">
          <span class="close" onclick="Components.hideMonthDetail()">&times;</span>
          <h2>${title}</h2>
          <p class="month-detail-count">共 ${movies.length} 部</p>
          <div class="month-detail-list">
            ${moviesHtml}
          </div>
        </div>
      </div>
    `;
    
    const existing = document.getElementById('month-detail-modal');
    if (existing) existing.remove();
    
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('month-detail-modal').classList.add('active');
    
    const modal = document.getElementById('month-detail-modal');
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'month-detail-modal') this.hideMonthDetail();
    });
  },

  /**
   * 隐藏月份详情弹窗
   */
  hideMonthDetail() {
    const modal = document.getElementById('month-detail-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
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
    
    const currentYear = select.value;
    
    const years = [...new Set(appState.movies.map(m => new Date(m.watch_date).getFullYear()))];
    years.sort((a, b) => b - a);
    
    select.innerHTML = '<option value="">全部年份</option>' + 
      years.map(y => `<option value="${y}">${y}年</option>`).join('');
    
    if (currentYear && years.includes(parseInt(currentYear))) {
      select.value = currentYear;
    }
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
        <button class="tmdb-wishlist-btn" onclick="event.stopPropagation(); App.addTmdbToWishlist(${index})">🔖 想看</button>
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
   * 绘制类型雷达图
   * @param {Object} genreCounts - 类型统计
   */
  drawRadarChart(genreCounts) {
    const canvas = document.getElementById('radar-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const entries = Object.entries(genreCounts);
    if (entries.length < 3) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-light').trim() || '#636E72';
      ctx.font = '14px Noto Sans SC';
      ctx.textAlign = 'center';
      ctx.fillText('需要至少3种类型才能显示雷达图', canvas.width / 2, canvas.height / 2);
      return;
    }

    const maxCount = Math.max(...entries.map(e => e[1]), 1);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxRadius = 110;
    const levels = 4;
    const angleStep = (2 * Math.PI) / entries.length;

    const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#2D3436';
    const borderColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#E0E0E0';
    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7B68CE';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let level = 1; level <= levels; level++) {
      const r = (maxRadius / levels) * level;
      ctx.beginPath();
      entries.forEach((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    entries.forEach((_, i) => {
      const angle = angleStep * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxRadius * Math.cos(angle), cy + maxRadius * Math.sin(angle));
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.beginPath();
    entries.forEach(([genre, count], i) => {
      const r = (count / maxCount) * maxRadius;
      const angle = angleStep * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = hexToRgba(accentColor, 0.3);
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    entries.forEach(([genre, count], i) => {
      const r = (count / maxCount) * maxRadius + 5;
      const angle = angleStep * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = accentColor;
      ctx.fill();

      const labelAngle = angleStep * i - Math.PI / 2;
      const labelRadius = maxRadius + 25;
      const lx = cx + labelRadius * Math.cos(labelAngle);
      const ly = cy + labelRadius * Math.sin(labelAngle);
      ctx.fillStyle = textColor;
      ctx.font = '11px Noto Sans SC';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Utils.getGenreName(genre), lx, ly);
    });
  },

  /**
   * 绘制月度趋势折线图
   */
  drawLineChart() {
    const canvas = document.getElementById('line-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { monthKeys, monthLabels, monthlyCounts } = Utils.getMonthlyStats(appState.movies, 12);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 520 * dpr;
    canvas.height = 240 * dpr;
    canvas.style.width = '520px';
    canvas.style.height = '240px';
    ctx.scale(dpr, dpr);

    const padding = { top: 20, right: 20, bottom: 30, left: 30 };
    const chartW = 520 - padding.left - padding.right;
    const chartH = 240 - padding.top - padding.bottom;

    const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#2D3436';
    const textLightColor = getComputedStyle(document.body).getPropertyValue('--text-light').trim() || '#636E72';
    const borderColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#E0E0E0';
    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7B68CE';

    const values = monthKeys.map(k => monthlyCounts[k] || 0);
    const maxVal = Math.max(...values, 1);
    const ySteps = 4;

    ctx.clearRect(0, 0, 520, 240);

    for (let i = 0; i <= ySteps; i++) {
      const y = padding.top + (chartH / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(520 - padding.right, y);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = textLightColor;
      ctx.font = '10px Noto Sans SC';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal - (maxVal / ySteps) * i), padding.left - 6, y + 4);
    }

    monthLabels.forEach((label, i) => {
      const x = padding.left + (chartW / (monthLabels.length - 1)) * i;
      ctx.fillStyle = textLightColor;
      ctx.font = '10px Noto Sans SC';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, 240 - padding.bottom + 16);
    });

    ctx.beginPath();
    values.forEach((val, i) => {
      const x = padding.left + (chartW / (values.length - 1)) * i;
      const y = padding.top + chartH - (val / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, hexToRgba(accentColor, 0.25));
    gradient.addColorStop(1, hexToRgba(accentColor, 0.02));
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    values.forEach((val, i) => {
      const x = padding.left + (chartW / (values.length - 1)) * i;
      const y = padding.top + chartH - (val / maxVal) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = accentColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  },

  /**
   * 渲染观影日历热力图
   */
  renderCalendarHeatmap() {
    const container = document.getElementById('calendar-heatmap');
    if (!container) return;

    if (appState.movies.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无观影记录</p>';
      return;
    }

    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 364);

    const startDay = startDate.getDay();
    const totalDays = 365;

    const dateCounts = {};
    appState.movies.forEach(m => {
      const key = m.watch_date;
      dateCounts[key] = (dateCounts[key] || 0) + 1;
    });

    const cells = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      cells.push({
        date: key,
        count: dateCounts[key] || 0,
        dayOfWeek: d.getDay(),
        month: d.getMonth()
      });
    }

    const weeks = [];
    let paddingDays = startDay;
    for (let i = 0; i < paddingDays; i++) {
      cells.unshift({ date: '', count: -1, dayOfWeek: i, month: -1 });
    }

    while (cells.length > 0) {
      weeks.push(cells.splice(0, 7));
    }

    const dayLabels = ['', '一', '', '三', '', '五', ''];
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    const monthPositions = [];
    weeks.forEach((week, wi) => {
      week.forEach(cell => {
        if (cell.month >= 0 && (monthPositions.length === 0 || monthPositions[monthPositions.length - 1].month !== cell.month)) {
          monthPositions.push({ month: cell.month, week: wi });
        }
      });
    });

    let monthsHtml = '<div class="heatmap-months" style="display: flex; gap: 3px;">';
    const totalWeeks = weeks.length;
    monthPositions.forEach((mp, i) => {
      const nextPos = i + 1 < monthPositions.length ? monthPositions[i + 1].week : totalWeeks;
      const span = nextPos - mp.week;
      const cellWidth = 15;
      monthsHtml += `<span class="heatmap-month-label" style="width: ${span * cellWidth}px; flex-shrink: 0;">${monthNames[mp.month]}</span>`;
    });
    monthsHtml += '</div>';

    let rowsHtml = '<div class="heatmap-rows">';
    for (let day = 0; day < 7; day++) {
      rowsHtml += `<div class="heatmap-row"><span class="heatmap-day-label">${dayLabels[day]}</span><div class="heatmap-cells">`;
      weeks.forEach(week => {
        const cell = week[day] || { count: -1 };
        if (cell.count === -1) {
          rowsHtml += '<div class="heatmap-cell" style="background: transparent;"></div>';
        } else {
          let level = 0;
          if (cell.count === 1) level = 1;
          else if (cell.count === 2) level = 2;
          else if (cell.count === 3) level = 3;
          else if (cell.count >= 4) level = 4;
          const title = cell.date ? `${cell.date}: ${cell.count}部` : '';
          rowsHtml += `<div class="heatmap-cell level-${level}" title="${title}"></div>`;
        }
      });
      rowsHtml += '</div></div>';
    }
    rowsHtml += '</div>';

    const legendHtml = `
      <div class="heatmap-legend">
        <span>少</span>
        <span class="heatmap-legend-cell" style="background: var(--secondary-bg);"></span>
        <span class="heatmap-legend-cell level-1"></span>
        <span class="heatmap-legend-cell level-2"></span>
        <span class="heatmap-legend-cell level-3"></span>
        <span class="heatmap-legend-cell level-4"></span>
        <span>多</span>
      </div>`;

    container.innerHTML = monthsHtml + rowsHtml + legendHtml;
  },
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
