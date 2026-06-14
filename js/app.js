/**
 * CineMemo 主应用
 * 包含应用初始化、事件处理、页面导航等核心逻辑
 */

const App = {
  /**
   * 初始化应用
   */
  async init() {
    Logger.init();
    Logger.info('App', 'CineMemo 初始化开始');
    
    Utils.loadConfig();
    Utils.loadCustomGenres();
    
    if (typeof Auth !== 'undefined') {
      Auth.init();
    }
    
    if (typeof LazyLoad !== 'undefined') {
      LazyLoad.init();
    }
    
    if (typeof Offline !== 'undefined') {
      Offline.init();
    }
    
    if (typeof Sync !== 'undefined') {
      await Sync.init();
    }
    
    this.applyTheme(config.theme);
    Components.applyOpacitySettings();
    
    Components.loadUnlockedAchievements();
    
    // 获取云端设置
    await API.fetchCloudSettingsWithRetry(3);
    
    // 应用云端主题
    this.applyTheme(config.theme);
    
    // 应用云端背景设置
    if (cloudSettings.bgImage || cloudSettings.bgGif || cloudSettings.bgVideo || cloudSettings.cardOpacity !== 100) {
      config.bgType = cloudSettings.bgType || 'image';
      config.bgImage = cloudSettings.bgImage || '';
      config.bgGif = cloudSettings.bgGif || '';
      config.bgVideo = cloudSettings.bgVideo || '';
      config.bgMaskOpacity = cloudSettings.bgMaskOpacity;
      config.cardOpacity = cloudSettings.cardOpacity;
      
      Components.updateBgInputsFromConfig();
      this.applyBackground();
    } else if (config.bgImage || config.bgGif || config.bgVideo) {
      Components.updateBgInputsFromConfig();
      this.applyBackground();
    }
    
    Components.applyOpacitySettings();
    
    // 设置默认日期
    const dateInput = document.getElementById('watch-date');
    if (dateInput) {
      dateInput.valueAsDate = new Date();
    }
    
    // 渲染类型选项
    Components.renderGenreOptions();
    Components.renderFilterOptions();
    
    // 绑定事件
    this.bindEvents();
    
    // 音乐播放设置
    this.setupMusic();
    
    // 获取电影数据
    await this.loadMovies();
    
    // 渲染首页
    Components.renderHome();
  },

  /**
   * 绑定所有事件
   */
  bindEvents() {
    // 底部导航
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.onclick = () => this.navigate(btn.dataset.page);
    });
    
    // 添加按钮
    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
      addBtn.onclick = () => this.showMovieModal();
    }
    
    // 关闭模态框
    const closeModal = document.getElementById('close-modal');
    if (closeModal) {
      closeModal.onclick = () => this.hideMovieModal();
    }
    
    const movieModal = document.getElementById('movie-modal');
    if (movieModal) {
      movieModal.onclick = (e) => { 
        if (e.target.id === 'movie-modal') this.hideMovieModal(); 
      };
    }
    
    // 表单提交
    const movieForm = document.getElementById('movie-form');
    if (movieForm) {
      movieForm.onsubmit = (e) => this.handleMovieSubmit(e);
    }
    
    // 设置
    const settingsBtn = document.querySelector('.settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = () => this.showSettings();
    }
    
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
      settingsModal.querySelector('.close').onclick = () => this.hideSettings();
    }
    
    // 背景上传
    const bgFileInput = document.getElementById('bg-file-input');
    if (bgFileInput) {
      bgFileInput.addEventListener('change', (e) => this.handleBgUpload(e));
    }
    
    // TMDB 搜索
    const tmdbSearchBtn = document.querySelector('.btn-search-tmdb');
    if (tmdbSearchBtn) {
      tmdbSearchBtn.onclick = () => this.searchTmdbMovie();
    }
    
    // 删除按钮
    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) {
      deleteBtn.onclick = () => this.deleteMovie();
    }
    
    // 导入文件
    const importInput = document.getElementById('import-file-input');
    if (importInput) {
      importInput.addEventListener('change', (e) => this.handleImportFile(e));
    }
    
    // 备份文件上传
    const backupFileInput = document.getElementById('backup-file-input');
    if (backupFileInput) {
      backupFileInput.addEventListener('change', (e) => this.handleBackupFileUpload(e));
    }
    
    // 自动备份开关
    const autoBackupToggle = document.getElementById('auto-backup-toggle');
    if (autoBackupToggle) {
      autoBackupToggle.addEventListener('change', () => this.toggleAutoBackup());
    }
    
    // 点击其他地方关闭 TMDB 搜索结果
    document.addEventListener('click', (e) => {
      const resultsContainer = document.getElementById('tmdb-search-results');
      const searchWrapper = document.querySelector('.movie-search-wrapper');
      if (searchWrapper && !searchWrapper.contains(e.target) && !resultsContainer.contains(e.target)) {
        resultsContainer.classList.remove('active');
      }
    });
  },

  /**
   * 设置音乐播放器
   */
  setupMusic() {
    const audio = document.getElementById('audio-player');
    if (!audio) return;
    
    // 设置初始音量
    const volumeSlider = document.getElementById('volume-slider');
    audio.volume = volumeSlider ? volumeSlider.value / 100 : 0.12;
    appState.musicMuted = false;
    
    // 音乐播放结束自动播放下一首
    audio.addEventListener('ended', () => this.playNextTrack());
    
    // 更新音量滑块
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        audio.volume = e.target.value / 100;
      });
    }
    
    // 页面加载完成后自动播放
    document.addEventListener('click', () => {
      setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * Config.MUSIC_TRACKS.length);
        this.playTrack(randomIndex);
      }, 100);
    }, { once: true });
  },

  /**
   * 页面导航
   * @param {string} page - 页面名称
   */
  navigate(page) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
    
    // 更新页面显示
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
    });
    document.getElementById(page + '-page').classList.add('active');
    
    // 更新标题
    const titles = Config.PAGE_TITLES[page];
    document.getElementById('page-title').textContent = titles.title;
    document.getElementById('page-subtitle').textContent = titles.subtitle;
    
    // 渲染对应页面
    switch (page) {
      case 'home':
        Components.renderHome();
        break;
      case 'movies':
        document.getElementById('mode-watched').classList.toggle('active', appState.movieListMode === 'watched');
        document.getElementById('mode-wishlist').classList.toggle('active', appState.movieListMode === 'wishlist');
        Components.renderMovies();
        break;
      case 'achievements':
        Components.renderAchievements();
        break;
      case 'stats':
        Components.renderStats();
        break;
    }
  },

  /**
   * 加载电影数据
   */
  async loadMovies() {
    let cachedMovies = [];
    if (typeof Sync !== 'undefined') {
      const cached = await Sync.loadFromCache();
      if (cached && cached.length > 0) {
        cachedMovies = cached;
        Components.renderHome();
      }
    }
    
    try {
      const cloudMovies = await API.fetchMovies();
      // 确保所有电影都有 status 字段（兼容旧数据）
      appState.movies = cloudMovies.map(m => ({
        ...m,
        status: m.status || 'watched'
      }));
      
      // 合并本地缓存中云端没有的电影（临时ID或_pending标记的本地电影）
      const cloudIds = new Set(cloudMovies.map(m => m.id));
      const localOnlyMovies = cachedMovies.filter(m => 
        !cloudIds.has(m.id) && (m.id.toString().startsWith('temp_') || m._pending)
      );
      if (localOnlyMovies.length > 0) {
        console.log('[App] Merging', localOnlyMovies.length, 'local-only movies');
        appState.movies = [...localOnlyMovies, ...appState.movies];
      }
    } catch (err) {
      console.error('加载数据失败:', err);
      // 使用缓存数据
      if (cachedMovies.length > 0) {
        appState.movies = cachedMovies.map(m => ({
          ...m,
          status: m.status || 'watched'
        }));
      } else {
        const cached = localStorage.getItem(Config.STORAGE_KEYS.MOVIES);
        if (cached) {
          try {
            appState.movies = JSON.parse(cached);
            appState.movies = appState.movies.map(m => ({
              ...m,
              status: m.status || 'watched'
            }));
          } catch (e) {
            appState.movies = [];
          }
        }
      }
    }

    // 加载 Wish List 并合并到 movies（统一数据源，status='wishlist'）
    const savedWishlist = localStorage.getItem(Config.STORAGE_KEYS.WISHLIST);
    if (savedWishlist) {
      try {
        const wishlistItems = JSON.parse(savedWishlist);
        wishlistItems.forEach(w => {
          // 避免重复：如果 tmdb_id 已在 movies 中存在（已看），跳过
          if (w.tmdb_id && appState.movies.find(m => m.tmdb_id === w.tmdb_id && m.status !== 'wishlist')) {
            return;
          }
          appState.movies.push({
            ...w,
            watch_date: w.added_at ? w.added_at.split('T')[0] : new Date().toISOString().split('T')[0],
            duration_minutes: null,
            genre: '',
            created_by: '',
            director: '',
            cast: '',
            status: 'wishlist'
          });
        });
      } catch (e) { /* ignore parse errors */ }
    }

    appState._dataVersion++;
  },

  /**
   * 显示添加/编辑弹窗
   * @param {Object} movie - 电影对象（可选，用于编辑）
   */
  showMovieModal(movie = null) {
    // 登录验证
    if (!movie && !appState.isAdmin) {
      Utils.showToast('请先登录后再添加观影记录\n\n点击「设置」页面进行登录', 'info');
      this.showSettings();
      return;
    }
    
    const modal = document.getElementById('movie-modal');
    const deleteBtn = document.getElementById('delete-btn');
    
    if (movie) {
      // 编辑模式
      document.getElementById('modal-title').textContent = '编辑观影记录';
      document.getElementById('movie-id').value = movie.id;
      document.getElementById('movie-name').value = movie.movie_name;
      document.getElementById('watch-date').value = movie.watch_date;
      document.getElementById('duration').value = movie.duration_minutes || '';
      document.getElementById('created-by').value = movie.created_by || '';
      
      const genres = (movie.genre || '').split(',');
      document.querySelectorAll('input[name="genre"]').forEach(cb => {
        cb.checked = genres.includes(cb.value);
      });
      
      deleteBtn.style.display = 'block';
    } else {
      // 添加模式
      document.getElementById('modal-title').textContent = '添加观影记录';
      document.getElementById('movie-form').reset();
      document.getElementById('movie-id').value = '';
      document.getElementById('watch-date').valueAsDate = new Date();
      document.querySelectorAll('input[name="genre"]').forEach(cb => cb.checked = false);
      deleteBtn.style.display = 'none';
      
      // 清空 TMDB 选择
      appState.selectedTmdbMovie = null;
    }
    
    modal.classList.add('active');
  },

  /**
   * 隐藏添加/编辑弹窗
   */
  hideMovieModal() {
    document.getElementById('movie-modal').classList.remove('active');
    appState.selectedTmdbMovie = null;
  },

  /**
   * 处理电影表单提交
   * @param {Event} e - 表单提交事件
   */
  async handleMovieSubmit(e) {
    e.preventDefault();
    
    // 表单校验
    const movieName = document.getElementById('movie-name').value.trim();
    const watchDate = document.getElementById('watch-date').value;
    const durationInput = document.getElementById('duration').value.trim();
    const durationMinutes = parseInt(durationInput) || null;
    
    if (!movieName) {
      Utils.showToast('请输入电影名称', 'error');
      return;
    }
    if (!watchDate) {
      Utils.showToast('请选择观影日期', 'error');
      return;
    }
    if (durationInput && (isNaN(parseInt(durationInput)) || durationMinutes <= 0)) {
      Utils.showToast('时长请输入有效的正数（分钟）', 'error');
      return;
    }
    if (durationMinutes !== null && durationMinutes > 600) {
      Utils.showToast('时长过长（超过600分钟），请确认输入正确', 'warning');
    }
    
    // 获取选中的类型
    const genres = [];
    document.querySelectorAll('input[name="genre"]:checked').forEach(cb => {
      genres.push(cb.value);
    });
    
    // 从 TMDB 结果中获取附加信息
    let posterPath = null;
    let rating = null;
    let director = '';
    let cast = '';
    let tmdbId = null;
    
    if (appState.selectedTmdbMovie) {
      posterPath = appState.selectedTmdbMovie.poster_path;
      rating = appState.selectedTmdbMovie.vote_average ? Math.round(appState.selectedTmdbMovie.vote_average) : null;
      tmdbId = appState.selectedTmdbMovie.id;
      
      // 获取导演和主演
      const credits = await API.getTmdbCredits(tmdbId);
      const directors = credits.crew?.filter(p => p.job === 'Director') || [];
      director = directors.map(d => d.name).join(', ');
      const topCast = credits.cast?.slice(0, 3) || [];
      cast = topCast.map(a => a.name).join(', ');
    }
    
    const movieData = {
      movie_name: movieName,
      watch_date: watchDate,
      duration_minutes: durationMinutes,
      genre: genres.join(','),
      created_by: document.getElementById('created-by').value || 'TA',
      poster_path: posterPath,
      rating: rating,
      director: director,
      cast: cast,
      tmdb_id: tmdbId
    };
    
    const id = document.getElementById('movie-id').value;
    const saved = await API.saveMovie(movieData, id || null);
    
    // 如果已看电影在"想看"列表中存在（通过 tmdb_id 匹配），自动清理重复数据
    if (tmdbId) {
      const wishlistDuplicate = appState.movies.find(m => m.tmdb_id === tmdbId && m.status === 'wishlist');
      if (wishlistDuplicate) {
        appState.movies = appState.movies.filter(m => m.id !== wishlistDuplicate.id);
        this.saveWishlist();
      }
    }
    
    this.hideMovieModal();
    appState._dataVersion++;
    // appState.movies 已由 API.saveMovie 更新，直接渲染即可，无需重新加载
    Components.renderHome();
    Components.renderMovies();
    Components.renderAchievements();
    Components.renderStats();
    
    Utils.showToast(saved ? (id ? '更新成功！' : '添加成功！') : '保存成功！（本地模式）', saved ? 'success' : 'info');
  },

  /**
   * 删除电影（软删除 + 可撤销）
   */
  async deleteMovie() {
    const id = document.getElementById('movie-id').value;
    if (!id) return;

    const deletedMovie = appState.movies.find(m => m.id == id);
    if (!deletedMovie) return;

    const movieName = deletedMovie.movie_name || '未知电影';
    let undoTimeout = null;
    let undone = false;

    const doActualDelete = async () => {
      if (undone) return;
      await API.deleteMovie(id);
      Logger.info('App', '已彻底删除:', movieName);
    };

    appState.movies = appState.movies.filter(m => m.id != id);
    this.hideMovieModal();

    appState._dataVersion++;
    Components.renderHome();
    Components.renderMovies();
    Components.renderAchievements();
    Components.renderStats();

    const toastId = Toast.show(`已删除「${movieName}」`, 'warning', {
      action: '撤销',
      duration: 5000,
      onAction: async () => {
        undone = true;
        if (undoTimeout) clearTimeout(undoTimeout);

        appState.movies.push(deletedMovie);
        appState.movies.sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date));

        await API.saveMovie(deletedMovie, id);

        appState._dataVersion++;
        Components.renderHome();
        Components.renderMovies();
        Components.renderAchievements();
        Components.renderStats();

        Utils.showToast('已撤销删除', 'success');
      },
      onDismiss: () => {
        if (!undone) doActualDelete();
      }
    });

    undoTimeout = setTimeout(() => {
      if (!undone) doActualDelete();
    }, 5000);
  },

  /**
   * 显示设置弹窗
   */
  showSettings() {
    document.getElementById('settings-modal').classList.add('active');
    this.updateLoginStatus();
    this.updateBackupStatus();
    this.renderBackupList();
  },

  /**
   * 隐藏设置弹窗
   */
  hideSettings() {
    document.getElementById('settings-modal').classList.remove('active');
  },

  /**
   * 更新登录状态显示
   */
  updateLoginStatus() {
    const loginStatus = document.getElementById('login-status');
    const loggedInStatus = document.getElementById('logged-in-status');
    
    if (appState.isAdmin) {
      loginStatus.style.display = 'none';
      loggedInStatus.style.display = 'block';
    } else {
      loginStatus.style.display = 'block';
      loggedInStatus.style.display = 'none';
    }
  },

  /**
   * 登录
   */
  login() {
    const password = document.getElementById('admin-password').value;
    if (password === config.adminPassword) {
      appState.isAdmin = true;
      Utils.showToast('登录成功！', 'success');
      this.updateLoginStatus();
    } else {
      Utils.showToast('密码错误', 'error');
    }
  },

  /**
   * 登出
   */
  logout() {
    appState.isAdmin = false;
    Utils.showToast('已退出登录', 'info');
    this.updateLoginStatus();
  },

  /**
   * 设置主题
   * @param {string} theme - 主题名称
   */
  setTheme(theme) {
    config.theme = theme;
    Utils.saveConfig();
    this.applyTheme(theme);
    API.saveCloudSettings();
  },

  /**
   * 应用主题
   * @param {string} theme - 主题名称
   */
  applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  },

  /**
   * 背景类型切换
   */
  onBgTypeChange() {
    const bgType = document.querySelector('input[name="bg-type"]:checked').value;
    config.bgType = bgType;
    cloudSettings.bgType = bgType;
    
    document.getElementById('bg-image-option').style.display = bgType === 'image' ? 'block' : 'none';
    document.getElementById('bg-gif-option').style.display = bgType === 'gif' ? 'block' : 'none';
    document.getElementById('bg-video-option').style.display = bgType === 'video' ? 'block' : 'none';
  },

  /**
   * 背景 URL 变化
   */
  onBgUrlChange() {
    const bgType = config.bgType;
    const urlInput = document.getElementById(`bg-${bgType}-url`);
    const url = urlInput.value;
    
    config[`bg${bgType.charAt(0).toUpperCase() + bgType.slice(1)}`] = url;
    cloudSettings[`bg${bgType.charAt(0).toUpperCase() + bgType.slice(1)}`] = url;
  },

  /**
   * 背景遮罩透明度变化
   */
  onBgMaskOpacityChange() {
    const value = document.getElementById('bg-mask-opacity').value;
    document.getElementById('bg-mask-opacity-value').textContent = value + '%';
    config.bgMaskOpacity = parseInt(value);
    cloudSettings.bgMaskOpacity = parseInt(value);
    this.applyBackground();
  },

  /**
   * 卡片透明度变化
   */
  onCardOpacityChange() {
    const value = document.getElementById('card-opacity').value;
    document.getElementById('card-opacity-value').textContent = value + '%';
    config.cardOpacity = parseInt(value);
    cloudSettings.cardOpacity = parseInt(value);
    Components.applyOpacitySettings();
  },

  /**
   * 应用背景
   */
  applyBackground() {
    const app = document.getElementById('app');
    
    // 移除旧的背景元素
    const oldBg = app.querySelector('.background-layer');
    if (oldBg) oldBg.remove();
    
    // 创建新的背景层
    const bgLayer = document.createElement('div');
    bgLayer.className = 'background-layer';
    
    let bgContent = '';
    const bgType = config.bgType;
    
    if (bgType === 'image' && config.bgImage) {
      bgContent = `<img src="${config.bgImage}" alt="背景">`;
    } else if (bgType === 'gif' && config.bgGif) {
      bgContent = `<img src="${config.bgGif}" alt="背景">`;
    } else if (bgType === 'video' && config.bgVideo) {
      bgContent = `<video src="${config.bgVideo}" autoplay loop muted playsinline></video>`;
    }
    
    if (bgContent) {
      bgLayer.innerHTML = bgContent;
      app.insertBefore(bgLayer, app.firstChild);
    }
    
    // 应用遮罩
    const mask = app.querySelector('.background-mask');
    if (mask) {
      mask.style.background = `rgba(0, 0, 0, ${config.bgMaskOpacity / 100})`;
    }
  },

  /**
   * 保存背景设置
   */
  async saveBackgroundSettings() {
    Utils.saveConfig();
    await API.saveCloudSettings();
    Utils.showToast('背景设置已保存并同步到云端', 'success');
  },

  /**
   * 处理背景上传
   * @param {Event} e - 文件选择事件
   */
  handleBgUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target.result;
      const bgType = config.bgType;
      
      config[`bg${bgType.charAt(0).toUpperCase() + bgType.slice(1)}`] = url;
      cloudSettings[`bg${bgType.charAt(0).toUpperCase() + bgType.slice(1)}`] = url;
      
      // 更新输入框
      document.getElementById(`bg-${bgType}-url`).value = url;
      
      // 应用背景
      this.applyBackground();
      
      Utils.showToast('背景已上传', 'success');
    };
    
    reader.readAsDataURL(file);
  },

  /**
   * 搜索 TMDB 电影
   */
  async searchTmdbMovie() {
    const query = document.getElementById('movie-name').value.trim();
    if (!query) {
      Utils.showToast('请输入电影名', 'info');
      return;
    }
    
    const resultsContainer = document.getElementById('tmdb-search-results');
    resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center;">搜索中...</div>';
    resultsContainer.classList.add('active');
    
    const results = await API.searchTmdb(query);
    appState.currentTmdbResults = results;
    Components.displayTmdbResults(results);
  },

  /**
   * 添加自定义类型
   */
  addCustomGenre() {
    const name = document.getElementById('new-genre').value.trim();
    if (!name) return;
    
    if (Utils.addCustomGenre(name)) {
      Components.renderGenreOptions();
      Components.renderFilterOptions();
      document.getElementById('new-genre').value = '';
      Utils.showToast('类型添加成功', 'success');
    } else {
      Utils.showToast('类型已存在', 'error');
    }
  },

  /**
   * 切换音乐面板
   */
  toggleMusicPanel() {
    const panel = document.getElementById('music-panel');
    appState.musicPanelOpen = !appState.musicPanelOpen;
    panel.classList.toggle('active', appState.musicPanelOpen);
  },

  /**
   * 播放曲目
   * @param {number} index - 曲目索引
   */
  playTrack(index) {
    const audio = document.getElementById('audio-player');
    if (!audio) return;
    
    // 如果点击的是当前播放的曲目
    if (appState.currentTrackIndex === index) {
      if (!audio.paused) {
        audio.pause();
        appState.musicPaused = true;
        document.getElementById('track-' + index + '-status').textContent = '▶';
        this.updateMusicToggleButton();
        return;
      } else {
        audio.play().catch(e => console.log('播放失败:', e));
        appState.musicPaused = false;
        document.getElementById('track-' + index + '-status').textContent = '⏸';
        this.updateMusicToggleButton();
        return;
      }
    }
    
    // 切换到新曲目
    if (appState.currentTrackIndex >= 0) {
      document.getElementById('track-' + appState.currentTrackIndex + '-status').textContent = '▶';
    }
    
    appState.currentTrackIndex = index;
    audio.src = Config.MUSIC_TRACKS[index].url;
    audio.volume = document.getElementById('volume-slider').value / 100;
    
    if (!appState.musicMuted) {
      audio.play().catch(e => console.log('播放失败:', e));
      appState.musicPaused = false;
      document.getElementById('track-' + index + '-status').textContent = '⏸';
    } else {
      appState.musicPaused = true;
      document.getElementById('track-' + index + '-status').textContent = '▶';
    }
    
    this.updateMusicToggleButton();
  },

  /**
   * 播放下一首
   */
  playNextTrack() {
    const nextIndex = (appState.currentTrackIndex + 1) % Config.MUSIC_TRACKS.length;
    this.playTrack(nextIndex);
  },

  /**
   * 切换音乐播放/暂停
   */
  toggleMusic() {
    const audio = document.getElementById('audio-player');
    if (!audio) return;
    
    // 如果还没选择歌曲，随机播放一首
    if (appState.currentTrackIndex === -1) {
      appState.musicMuted = false;
      appState.musicPaused = false;
      const randomIndex = Math.floor(Math.random() * Config.MUSIC_TRACKS.length);
      this.playTrack(randomIndex);
      return;
    }
    
    // 切换静音状态
    appState.musicMuted = !appState.musicMuted;
    
    if (appState.musicMuted) {
      audio.pause();
      appState.musicPaused = true;
      if (appState.currentTrackIndex >= 0) {
        document.getElementById('track-' + appState.currentTrackIndex + '-status').textContent = '▶';
      }
    } else {
      if (appState.musicPaused) {
        audio.play().catch(e => console.log('播放失败:', e));
        appState.musicPaused = false;
      }
      if (appState.currentTrackIndex >= 0) {
        document.getElementById('track-' + appState.currentTrackIndex + '-status').textContent = '⏸';
      }
    }
    
    this.updateMusicToggleButton();
  },

  /**
   * 更新音乐切换按钮
   */
  updateMusicToggleButton() {
    const btn = document.getElementById('music-toggle-btn');
    if (btn) {
      btn.textContent = appState.musicMuted ? '🔇' : '🔊';
    }
  },

  /**
   * 设置音量
   * @param {number} value - 音量值 0-100
   */
  setVolume(value) {
    const audio = document.getElementById('audio-player');
    if (!appState.musicMuted && !appState.musicPaused) {
      audio.volume = value / 100;
    }
  },

  /**
   * 触发导入
   */
  triggerImport() {
    document.getElementById('import-file-input').click();
  },

  /**
   * 处理导入文件
   * @param {Event} e - 文件选择事件
   */
  handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 管理员权限校验
    if (!appState.isAdmin) {
      Utils.showToast('请先登录后再导入数据\n\n点击右上角「设置」进行登录', 'info');
      this.showSettings();
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const imported = this.parseCSV(text);

      if (imported.length === 0) {
        Utils.showToast('未能解析文件，请检查 CSV 格式', 'error');
        return;
      }

      // 第一步：选择导入模式
      const mode = await Utils.confirm({
        message: `检测到 ${imported.length} 条记录。\n\n请选择导入方式：`,
        confirmText: '追加到现有记录',
        cancelText: '替换所有记录',
      });

      if (mode) {
        // === 追加模式 ===
        Utils.showToast(`正在导入并获取封面... 0/${imported.length}`, 'info');
        for (let i = 0; i < imported.length; i++) {
          const movie = imported[i];
          const { id: _tempId, ...movieData } = movie;

          // 尝试从 TMDB 获取海报封面和评分（不覆盖 CSV 中已有的 genre 等字段）
          if (!movieData.poster_path) {
            const tmdbData = await API.enrichMovieFromTmdb(movieData.movie_name);
            if (tmdbData) {
              Object.assign(movieData, tmdbData);
            }
          }

          // 不发送 created_at / updated_at，由 Supabase 默认值处理
          // （手动添加也不发这些字段，保持一致，避免未知列错误）
          await API.saveMovie(movieData, null, { prepend: false });

          // 每 5 条更新一次进度
          if ((i + 1) % 5 === 0 || i === imported.length - 1) {
            Utils.showToast(`正在导入并获取封面... ${i + 1}/${imported.length}`, 'info');
          }
        }
      } else {
        // === 替换模式 ===
        // 第二步：二次确认（破坏性操作必须再次确认）
        const confirmed = await Utils.confirm({
          message: `⚠️ 警告：替换将永久删除所有 ${appState.movies.length} 条现有观影记录！\n\n此操作不可撤销，确定继续吗？`,
          confirmText: '确定替换，删除所有现有记录',
          cancelText: '取消',
          danger: true,
        });
        if (!confirmed) return;

        Utils.showToast(`正在替换导入并获取封面... 0/${imported.length}`, 'info');

        // Step 0: 保存旧电影 ID（用于后续精准删除）
        let oldMovieIds = new Set();
        try {
          const preCloudMovies = await API.fetchMovies();
          oldMovieIds = new Set(preCloudMovies.map(m => m.id));
        } catch (err) {
          console.error('获取旧电影列表失败:', err);
        }

        // Step 1: 先保存新电影到云端（保证数据不丢失）
        appState.movies = [];
        let saveFailed = false;
        for (let i = 0; i < imported.length; i++) {
          const movie = imported[i];
          const { id: _tempId, ...movieData } = movie;

          // 尝试从 TMDB 获取海报封面和评分（不覆盖 CSV 中已有的 genre 等字段）
          if (!movieData.poster_path) {
            const tmdbData = await API.enrichMovieFromTmdb(movieData.movie_name);
            if (tmdbData) {
              Object.assign(movieData, tmdbData);
            }
          }

          // 不发送 created_at / updated_at，由 Supabase 默认值处理
          // （手动添加也不发这些字段，保持一致，避免未知列错误）
          const ok = await API.saveMovie(movieData, null, { prepend: false });
          if (!ok) saveFailed = true;

          // 每 5 条更新一次进度
          if ((i + 1) % 5 === 0 || i === imported.length - 1) {
            Utils.showToast(`正在替换导入并获取封面... ${i + 1}/${imported.length}`, 'info');
          }
        }

        // Step 2: 从云端获取最新数据，通过 ID 对比区分新旧
        try {
          const allCloudMovies = await API.fetchMovies();

          // 新电影：不在旧 ID 集合中
          const newCloudMovies = allCloudMovies.filter(m => !oldMovieIds.has(m.id));
          // 旧电影：在旧 ID 集合中（需要删除）
          const oldCloudMovies = allCloudMovies.filter(m => oldMovieIds.has(m.id));

          // 安全阀：如果没有成功保存任何新记录到云端，跳过删除旧数据
          if (newCloudMovies.length === 0 && saveFailed) {
            Utils.showToast('所有记录均未能保存到云端，已取消删除旧数据', 'error');
            // 恢复本地数据
            appState.movies = [...appState.movies];
          } else {
            // 删除旧电影
            for (const movie of oldCloudMovies) {
              await API.deleteMovie(movie.id);
            }

            if (oldCloudMovies.length > 0) {
              Utils.showToast(`已清理 ${oldCloudMovies.length} 条旧记录`, 'info');
            }

            // 保留本地回退数据（保存到云端失败但已存本地的电影，其 ID 为数字）
            const localFallback = appState.movies.filter(m => typeof m.id === 'number');

            // 以云端数据为权威状态，补上本地回退
            appState.movies = [...newCloudMovies, ...localFallback];
          }

          if (saveFailed && newCloudMovies.length > 0) {
            Utils.showToast('部分记录仅保存到本地，未能同步到云端', 'warning');
          }
        } catch (err) {
          console.error('同步云端数据失败:', err);
          Utils.showToast('同步云端数据时出错，请刷新页面检查云端是否有残留旧记录', 'warning');
        }

        // Step 3: 更新缓存
        if (typeof Cache !== 'undefined') {
          await Cache.clearMovies();
          await Cache.saveMovies(appState.movies);
        }
      }

      // 统一后续处理
      localStorage.setItem(Config.STORAGE_KEYS.MOVIES, JSON.stringify(appState.movies));

      Components.renderHome();
      Components.renderMovies();
      Components.renderAchievements();
      Components.renderStats();

      Utils.showToast(`成功导入 ${imported.length} 条记录`, 'success');
    };

    reader.onerror = () => {
      Utils.showToast('文件读取失败，请重试', 'error');
    };

    reader.readAsText(file);

    // 清理 file input，允许重复选择同一文件
    e.target.value = '';
  },

  /**
   * 解析 CSV
   * @param {string} text - CSV 文本
   * @returns {Array} 解析后的数据
   */
  parseCSV(text) {
    // 处理 UTF-8 BOM
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const movies = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length >= 2) {
        movies.push({
          movie_name: values[0],
          watch_date: values[1],
          duration_minutes: values[2] ? parseInt(values[2]) : null,
          genre: values[3] || '',
          created_by: values[4] || 'TA'
        });
      }
    }
    
    return movies;
  },

  /**
   * 解析 CSV 行（处理引号）
   * @param {string} line - CSV 行
   * @returns {Array} 字段数组
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current.trim());
    return values;
  },

  /**
   * 导出数据
   */
  exportToExcel() {
    if (appState.movies.length === 0) {
      Utils.showToast('没有可导出的数据', 'info');
      return;
    }
    
    const headers = ['电影名称', '观看日期', '时长（分钟）', '类型', '记录人'];
    const rows = appState.movies.map(m => [
      m.movie_name,
      m.watch_date,
      m.duration_minutes || '',
      Utils.getGenreNames(m.genre),
      m.created_by || 'TA'
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `cinememo_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    URL.revokeObjectURL(url);
    Utils.showToast('数据已导出', 'success');
  },

  /**
   * 渲染备份列表
   */
  renderBackupList() {
    const container = document.getElementById('backup-list');
    if (!container) return;

    const backups = Backup.getAllBackups();

    if (backups.length === 0) {
      container.innerHTML = '<p class="empty-tip">暂无本地备份</p>';
      return;
    }

    container.innerHTML = backups.map(b => `
      <div class="backup-item">
        <div class="backup-info">
          <span class="backup-time">${Backup.formatBackupTime(b.timestamp)}</span>
          <span class="backup-count">${b.count} 条记录</span>
        </div>
        <div class="backup-actions">
          <button class="btn-small" onclick="App.restoreBackup(${b.id})">恢复</button>
          <button class="btn-small btn-danger" onclick="App.deleteBackup(${b.id})">删除</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * 更新备份状态显示
   */
  updateBackupStatus() {
    const statusEl = document.getElementById('backup-status');
    const timeEl = document.getElementById('backup-last-time');
    const toggleEl = document.getElementById('auto-backup-toggle');

    if (!statusEl) return;

    const stats = Backup.getStats();
    const isEnabled = Backup.isAutoBackupEnabled();

    statusEl.textContent = isEnabled ? '✅ 已开启' : '❌ 已关闭';
    timeEl.textContent = stats.latestTime ? Backup.formatBackupTime(stats.latestTime) : '暂无';

    if (toggleEl) {
      toggleEl.checked = isEnabled;
    }
  },

  /**
   * 切换自动备份
   */
  toggleAutoBackup() {
    const toggleEl = document.getElementById('auto-backup-toggle');
    if (!toggleEl) return;

    const enabled = toggleEl.checked;
    Backup.setAutoBackup(enabled);
    this.updateBackupStatus();

    if (enabled) {
      Backup.createBackup(appState.movies);
      Utils.showToast('自动备份已开启', 'success');
    } else {
      Utils.showToast('自动备份已关闭', 'info');
    }
  },

  /**
   * 手动创建备份
   */
  createManualBackup() {
    if (appState.movies.length === 0) {
      Utils.showToast('没有可备份的数据', 'info');
      return;
    }

    Backup.createBackup(appState.movies);
    this.updateBackupStatus();
    this.renderBackupList();
    Utils.showToast('备份已创建', 'success');
  },

  /**
   * 下载备份文件
   */
  downloadBackupFile() {
    const backup = Backup.getLatestBackup();
    if (!backup) {
      Utils.showToast('没有可下载的备份', 'error');
      return;
    }

    Backup.downloadBackup(backup);
  },

  /**
   * 恢复指定备份
   * @param {number} id - 备份ID
   */
  async restoreBackup(id) {
    const backup = Backup.getBackupById(id);
    if (!backup) {
      Utils.showToast('备份不存在', 'error');
      return;
    }

    const confirmed = await Utils.confirm(`确定要恢复 ${Backup.formatBackupTime(backup.timestamp)} 的备份吗？\n\n将恢复 ${backup.count} 条记录。`);

    if (confirmed) {
      await Backup.restore(backup.data);
      this.updateBackupStatus();
    }
  },

  /**
   * 删除指定备份
   * @param {number} id - 备份ID
   */
  deleteBackup(id) {
    Backup.deleteBackup(id);
    this.renderBackupList();
    this.updateBackupStatus();
    Utils.showToast('备份已删除', 'success');
  },

  /**
   * 清除所有备份
   */
  clearAllBackups() {
    Backup.clearAllBackups();
    this.renderBackupList();
    this.updateBackupStatus();
    Utils.showToast('所有备份已清除', 'success');
  },

  /**
   * 处理备份文件上传
   * @param {Event} e - 文件选择事件
   */
  async handleBackupFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const backup = await Backup.parseBackupFile(file);

      const confirmed = await Utils.confirm(`检测到备份文件\n\n时间：${new Date(backup.timestamp).toLocaleString('zh-CN')}\n记录数：${backup.data.length} 条\n\n是否恢复此备份？`);

      if (confirmed) {
        await Backup.restore(backup.data);
        this.updateBackupStatus();
      }
    } catch (err) {
      Utils.showToast(err.message || '无法解析备份文件', 'error');
    }

    e.target.value = '';
  },

  /**
   * 触发备份文件上传
   */
  triggerBackupUpload() {
    document.getElementById('backup-file-input').click();
  },

  /**
   * 切换影单模式（已看 / 想看）
   * @param {string} mode - 'watched' | 'wishlist'
   */
  switchListMode(mode) {
    appState.movieListMode = mode;
    document.getElementById('mode-watched').classList.toggle('active', mode === 'watched');
    document.getElementById('mode-wishlist').classList.toggle('active', mode === 'wishlist');

    document.getElementById('genre-filter').style.display = mode === 'watched' ? '' : 'none';
    document.getElementById('year-filter').style.display = mode === 'watched' ? '' : 'none';
    document.getElementById('month-filter').style.display = mode === 'watched' ? '' : 'none';

    Components.renderMovies();
  },

  /**
   * 保存 Wish List（从 movies 统一数组提取，写入 localStorage + 云端）
   */
  saveWishlist() {
    const wishlistItems = appState.movies
      .filter(m => m.status === 'wishlist')
      .map(m => ({
        id: m.id,
        movie_name: m.movie_name,
        tmdb_id: m.tmdb_id,
        poster_path: m.poster_path,
        year: m.year,
        rating: m.rating,
        added_at: m.added_at
      }));
    localStorage.setItem(Config.STORAGE_KEYS.WISHLIST, JSON.stringify(wishlistItems));
    if (typeof API !== 'undefined') API.saveCloudSettings();
    appState._dataVersion++;
  },

  /**
   * 从 TMDB 结果添加到 Wish List
   * @param {number} index - 结果索引
   */
  addTmdbToWishlist(index) {
    const movie = appState.currentTmdbResults[index];
    if (!movie) return;

    // 检查是否已在想看列表（统一在 movies 中查找）
    const existsInWishlist = appState.movies.find(m => m.tmdb_id === movie.id && m.status === 'wishlist');
    if (existsInWishlist) {
      Utils.showToast('已经在想看列表中', 'info');
      return;
    }

    // 检查是否已在已看列表（防止重复添加）
    const existsInMovies = appState.movies.find(m => m.tmdb_id === movie.id && m.status !== 'wishlist');
    if (existsInMovies) {
      Utils.showToast('这部电影已经在已看列表中', 'info');
      return;
    }

    const item = {
      id: 'wl_' + Date.now(),
      movie_name: movie.title,
      tmdb_id: movie.id,
      poster_path: movie.poster_path || null,
      year: movie.release_date ? movie.release_date.split('-')[0] : '',
      rating: movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null,
      added_at: new Date().toISOString(),
      watch_date: new Date().toISOString().split('T')[0],
      duration_minutes: null,
      genre: '',
      created_by: '',
      director: '',
      cast: '',
      status: 'wishlist'
    };

    appState.movies.push(item);
    this.saveWishlist();
    Utils.showToast(`「${item.movie_name}」已加入想看`, 'success');
  },

  /**
   * Wish List → 已看（打开添加弹窗预填）
   * @param {string} id - Wish List 项 ID
   */
  wishlistToWatched(id) {
    const item = appState.movies.find(m => m.id === id && m.status === 'wishlist');
    if (!item) return;

    // 从 movies 中移除（会由 handleMovieSubmit 以 status='watched' 重新添加）
    appState.movies = appState.movies.filter(m => m.id !== id);
    this.saveWishlist();

    if (item.tmdb_id) {
      appState.selectedTmdbMovie = {
        id: item.tmdb_id,
        title: item.movie_name,
        poster_path: item.poster_path,
        vote_average: item.rating,
        release_date: item.year ? item.year + '-01-01' : null
      };
    }

    this.showMovieModal();
    document.getElementById('movie-name').value = item.movie_name;
    document.getElementById('watch-date').valueAsDate = new Date();
  },

  /**
   * 从 Wish List 移除
   * @param {string} id - Wish List 项 ID
   */
  removeFromWishlist(id) {
    const item = appState.movies.find(m => m.id === id && m.status === 'wishlist');
    appState.movies = appState.movies.filter(m => m.id !== id);
    this.saveWishlist();
    Components.renderMovies();
    if (item) {
      Utils.showToast(`「${item.movie_name}」已从想看移除`, 'info');
    }
  }
};

const ErrorBoundary = {
  errorShown: false,

  showErrorUI(message) {
    if (this.errorShown) return;
    this.errorShown = true;

    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <div style="
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; min-height: 60vh; padding: 40px 20px;
        text-align: center; font-family: 'Noto Sans SC', sans-serif;
      ">
        <div style="font-size: 64px; margin-bottom: 20px;">😿</div>
        <h2 style="color: var(--text, #2D3436); margin-bottom: 12px;">出了点小问题</h2>
        <p style="color: var(--text-light, #636E72); font-size: 14px; margin-bottom: 24px; max-width: 400px;">
          ${message || '应用加载时遇到了意外错误，请尝试刷新页面。'}
        </p>
        <button onclick="location.reload()" style="
          background: linear-gradient(135deg, var(--accent, #7B68CE), var(--accent-light, #9B8DD4));
          color: #fff; border: none; padding: 12px 32px; border-radius: 12px;
          font-size: 16px; cursor: pointer;
        ">刷新页面</button>
        <p style="color: var(--text-light, #636E72); font-size: 12px; margin-top: 16px;">
          如果问题持续出现，请尝试清除浏览器缓存
        </p>
      </div>
    `;
  },

  init() {
    window.addEventListener('error', (event) => {
      Logger.error('ErrorBoundary', '未捕获错误:', event.error ? event.error.message : event.message);
      if (event.error && event.error.stack) {
        Logger.error('ErrorBoundary', event.error.stack);
      }
      ErrorBoundary.showErrorUI('应用运行时遇到了未预期的错误。');
    });

    window.addEventListener('unhandledrejection', (event) => {
      Logger.error('ErrorBoundary', '未处理Promise拒绝:', event.reason);
      ErrorBoundary.showErrorUI('数据加载失败，请检查网络连接后刷新。');
    });
  }
};

ErrorBoundary.init();

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  try {
    App.init();
  } catch (err) {
    Logger.error('App', '初始化失败:', err.message, err.stack);
    ErrorBoundary.showErrorUI('应用初始化失败，请刷新页面重试。');
  }
});
