/**
 * CineMemo 主应用
 * 包含应用初始化、事件处理、页面导航等核心逻辑
 */

const App = {
  /**
   * 初始化应用
   */
  async init() {
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
    
    // 获取云端设置
    await API.fetchCloudSettingsWithRetry(3);
    
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
    if (typeof Sync !== 'undefined') {
      const cached = await Sync.loadFromCache();
      if (cached && cached.length > 0) {
        Components.renderHome();
      }
    }
    
    try {
      appState.movies = await API.fetchMovies();
    } catch (err) {
      console.error('加载数据失败:', err);
      const cached = localStorage.getItem(Config.STORAGE_KEYS.MOVIES);
      if (cached) {
        try {
          appState.movies = JSON.parse(cached);
        } catch (e) {
          appState.movies = [];
        }
      }
    }
  },

  /**
   * 显示添加/编辑弹窗
   * @param {Object} movie - 电影对象（可选，用于编辑）
   */
  showMovieModal(movie = null) {
    // 登录验证
    if (!movie && !appState.isAdmin) {
      Utils.showToast('请先登录后再添加观影记录\n\n点击「设置」页面进行登录\n默认密码：huiwan111', 'info');
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
      rating = appState.selectedTmdbMovie.vote_average ? Math.round(appState.selectedTmdbMovie.vote_average * 10) / 10 : null;
      tmdbId = appState.selectedTmdbMovie.id;
      
      // 获取导演和主演
      const credits = await API.getTmdbCredits(tmdbId);
      const directors = credits.crew?.filter(p => p.job === 'Director') || [];
      director = directors.map(d => d.name).join(', ');
      const topCast = credits.cast?.slice(0, 3) || [];
      cast = topCast.map(a => a.name).join(', ');
    }
    
    const movieData = {
      movie_name: document.getElementById('movie-name').value,
      watch_date: document.getElementById('watch-date').value,
      duration_minutes: parseInt(document.getElementById('duration').value) || null,
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
    
    this.hideMovieModal();
    await this.loadMovies();
    
    Components.renderHome();
    Components.renderMovies();
    Components.renderAchievements();
    Components.renderStats();
    
    Utils.showToast(saved ? (id ? '更新成功！' : '添加成功！') : '保存成功！（本地模式）', saved ? 'success' : 'info');
  },

  /**
   * 删除电影
   */
  async deleteMovie() {
    const id = document.getElementById('movie-id').value;
    if (!id) return;
    
    if (await Utils.confirm('确定要删除这条记录吗？')) {
      await API.deleteMovie(id);
      this.hideMovieModal();
      
      Components.renderHome();
      Components.renderMovies();
      Components.renderAchievements();
      Components.renderStats();
      
      Utils.showToast('删除成功', 'success');
    }
  },

  /**
   * 显示设置弹窗
   */
  showSettings() {
    document.getElementById('settings-modal').classList.add('active');
    this.updateLoginStatus();
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
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const imported = this.parseCSV(text);
      
      if (imported.length > 0) {
        const mode = await Utils.confirm(`检测到 ${imported.length} 条记录。\n\n点击"确定"追加到现有记录\n点击"取消"替换所有记录`);
        
        if (mode) {
          // 追加
          appState.movies = [...appState.movies, ...imported];
        } else {
          // 替换
          appState.movies = imported;
        }
        
        localStorage.setItem(Config.STORAGE_KEYS.MOVIES, JSON.stringify(appState.movies));
        
        // 同步到云端
        for (const movie of imported) {
          await API.saveMovie(movie);
        }
        
        Components.renderHome();
        Components.renderMovies();
        Components.renderAchievements();
        Components.renderStats();
        
        Utils.showToast(`成功导入 ${imported.length} 条记录`, 'success');
      } else {
        Utils.showToast('未能解析文件，请检查 CSV 格式', 'error');
      }
    };
    
    reader.readAsText(file);
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
  }
};

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
