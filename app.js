// ========== 配置区域 ==========
const SUPABASE_URL = 'https://zbghffgydxzufzfuozwq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZ2hmZmd5ZHh6dWZ6ZnVvendxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzI1MDAsImV4cCI6MjA5MDQ0ODUwMH0.9_v1GjPo1ISkGCyvyAsqwhvkfRMsvR_OfgZVStxhVRc';

// ========== Supabase 客户端 ==========
let supabase;

async function initSupabase() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.log('请配置 Supabase');
    return null;
  }
  
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

// ========== 数据 ==========
let movies = [];

// 成就定义
const achievements = [
  { id: 'first_watch', name: '初遇', desc: '第1次一起看', icon: '🎬', condition: (m) => m.length >= 1 },
  { id: 'tenth_watch', name: '十次之约', desc: '第10次一起看', icon: '🎬', condition: (m) => m.length >= 10 },
  { id: 'twenty_five', name: '银婚纪念', desc: '第25次一起看', icon: '💕', condition: (m) => m.length >= 25 },
  { id: 'fifty', name: '半百之旅', desc: '第50次一起看', icon: '🌟', condition: (m) => m.length >= 50 },
  { id: 'hundred', name: '百次辉煌', desc: '第100次一起看', icon: '👑', condition: (m) => m.length >= 100 },
  { id: 'ten_hours', name: '十小时陪伴', desc: '累计10小时', icon: '⏰', condition: (m) => getTotalMinutes(m) >= 600 },
  { id: 'fifty_hours', name: '五十小时', desc: '累计50小时', icon: '⏰', condition: (m) => getTotalMinutes(m) >= 3000 },
  { id: 'hundred_hours', name: '百小时里程碑', desc: '累计100小时', icon: '⏰', condition: (m) => getTotalMinutes(m) >= 6000 },
  { id: 'romance_lover', name: '爱情片达人', desc: '看过10部爱情片', icon: '💘', condition: (m) => m.filter(x => x.genre === 'romance').length >= 10 },
  { id: 'action_hero', name: '动作片英雄', desc: '看过10部动作片', icon: '💪', condition: (m) => m.filter(x => x.genre === 'action').length >= 10 },
  { id: 'comedy_king', name: '喜剧之王', desc: '看过10部喜剧', icon: '😂', condition: (m) => m.filter(x => x.genre === 'comedy').length >= 10 },
  { id: 'night_owl', name: '夜猫子', desc: '看过10部午夜场', icon: '🦉', condition: (m) => m.length >= 10 },
];

// 类型中文映射
const genreMap = {
  'action': '动作',
  'romance': '爱情',
  'comedy': '喜剧',
  'thriller': '惊悚',
  'sci-fi': '科幻',
  'drama': '剧情',
  'horror': '恐怖',
  'animation': '动画',
  'documentary': '纪录片'
};

// ========== 工具函数 ==========
function getTotalMinutes(movieList) {
  return movieList.reduce((sum, m) => sum + (m.duration_minutes || 0), 0);
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getMonthKey(dateStr) {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ========== 页面导航 ==========
function navigate(page) {
  // 更新导航状态
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // 更新页面显示
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
  });
  document.getElementById(`${page}-page`).classList.add('active');

  // 更新标题
  const titles = {
    home: { title: '第 X 次一起看', subtitle: '记录我们的观影时光' },
    movies: { title: '观影记录', subtitle: '我们的电影清单' },
    achievements: { title: '成就徽章', subtitle: '解锁我们的里程碑' },
    stats: { title: '数据统计', subtitle: '一起看过的点点滴滴' }
  };
  
  document.getElementById('page-title').textContent = titles[page].title;
  document.getElementById('page-subtitle').textContent = titles[page].subtitle;

  // 刷新数据
  if (page === 'home') renderHome();
  if (page === 'movies') renderMovies();
  if (page === 'achievements') renderAchievements();
  if (page === 'stats') renderStats();
}

// ========== 首页 ==========
function renderHome() {
  const sorted = [...movies].sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date));
  const totalMinutes = getTotalMinutes(movies);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  document.getElementById('total-movies').textContent = movies.length;
  document.getElementById('total-hours').textContent = hours;
  document.getElementById('total-minutes').textContent = mins;

  const recentDiv = document.getElementById('recent-movies');
  if (sorted.length === 0) {
    recentDiv.innerHTML = '<p class="empty-state">还没有记录，开始你们的第一次吧～</p>';
  } else {
    recentDiv.innerHTML = sorted.slice(0, 3).map(m => `
      <div class="movie-card">
        <div class="movie-info">
          <div class="movie-title">${m.movie_name}</div>
          <div class="movie-meta">${formatDate(m.watch_date)} · ${m.duration_minutes || '?'}分钟</div>
        </div>
        ${m.genre ? `<span class="movie-badge">${genreMap[m.genre] || m.genre}</span>` : ''}
      </div>
    `).join('');
  }
}

// ========== 影单 ==========
function renderMovies() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const genre = document.getElementById('genre-filter').value;
  
  let filtered = [...movies].sort((a, b) => new Date(b.watch_date) - new Date(a.watch_date));
  
  if (search) {
    filtered = filtered.filter(m => m.movie_name.toLowerCase().includes(search));
  }
  if (genre) {
    filtered = filtered.filter(m => m.genre === genre);
  }

  const container = document.getElementById('all-movies');
  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">没有找到匹配的电影</p>';
  } else {
    container.innerHTML = filtered.map(m => `
      <div class="movie-card">
        <div class="movie-info">
          <div class="movie-title">${m.movie_name}</div>
          <div class="movie-meta">${formatDate(m.watch_date)} · ${m.duration_minutes || '?'}分钟 ${m.created_by ? '· ' + m.created_by : ''}</div>
        </div>
        ${m.genre ? `<span class="movie-badge">${genreMap[m.genre] || m.genre}</span>` : ''}
      </div>
    `).join('');
  }
}

function filterMovies() {
  renderMovies();
}

// ========== 成就 ==========
function renderAchievements() {
  const container = document.getElementById('achievements-grid');
  container.innerHTML = achievements.map(a => {
    const unlocked = a.condition(movies);
    return `
      <div class="achievement-card ${unlocked ? 'unlocked' : ''}">
        <div class="achievement-icon">${a.icon}</div>
        <div class="achievement-name">${a.name}</div>
        <div class="achievement-desc">${a.desc}</div>
      </div>
    `;
  }).join('');
}

// ========== 统计 ==========
function renderStats() {
  // 基本统计
  const totalMinutes = getTotalMinutes(movies);
  const hours = Math.floor(totalMinutes / 60);
  const avgMinutes = movies.length ? Math.round(totalMinutes / movies.length) : 0;

  document.getElementById('stat-total').textContent = movies.length;
  document.getElementById('stat-hours').textContent = hours;
  document.getElementById('stat-avg').textContent = avgMinutes;

  // 类型分布
  const genreCounts = {};
  movies.forEach(m => {
    if (m.genre) {
      genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
    }
  });

  const colors = ['#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#74B9FF', '#A29BFE', '#FD79A8', '#00CEC9', '#FDCB6E'];
  const genreChart = document.getElementById('genre-chart');
  genreChart.innerHTML = Object.entries(genreCounts).map(([genre, count], i) => `
    <div class="genre-item">
      <span class="genre-dot" style="background: ${colors[i % colors.length]}"></span>
      <span>${genreMap[genre] || genre}</span>
      <span class="genre-count">${count}</span>
    </div>
  `).join('') || '<p class="empty-state">暂无数据</p>';

  // 月度分布 - 滑动窗口：最近12个月
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // 生成最近12个月的key列表
  const last12Months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    last12Months.push(key);
  }

  const monthlyCounts = {};
  movies.forEach(m => {
    const key = getMonthKey(m.watch_date);
    monthlyCounts[key] = (monthlyCounts[key] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(monthlyCounts), 1);

  const monthlyChart = document.getElementById('monthly-chart');
  monthlyChart.innerHTML = last12Months.map(month => {
    const count = monthlyCounts[month] || 0;
    const height = (count / maxCount) * 100;
    const monthLabel = month.split('-')[1] + '月';
    return `<div class="month-bar" style="height: ${height}%" data-count="${count}" data-month="${monthLabel}"></div>`;
  }).join('');
}

// ========== 添加记录 ==========
function showAddModal() {
  document.getElementById('add-modal').classList.add('active');
  document.getElementById('watch-date').valueAsDate = new Date();
}

function hideAddModal() {
  document.getElementById('add-modal').classList.remove('active');
  document.getElementById('add-form').reset();
  document.getElementById('movie-info').style.display = 'none';
}

async function searchMovie() {
  const name = document.getElementById('movie-name').value;
  if (!name) return;

  // 使用 OMDB API 获取电影信息（需要 API Key）
  // 这里先用 TMDB 的简单搜索
  try {
    const response = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=d2aa7b3f4f1c8a8f8f8f8f8f8f8f8f8&query=${encodeURIComponent(name)}`);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const movie = data.results[0];
      document.getElementById('movie-duration').textContent = `时长: ${movie.runtime ? movie.runtime + '分钟' : '未知'}`;
      
      if (movie.genre_ids) {
        // TMDB genre ids 到 name 的映射（简化版）
        const genreIds = { 28: 'action', 12: 'action', 878: 'sci-fi', 53: 'thriller', 27: 'horror', 35: 'comedy', 10749: 'romance', 18: 'drama', 16: 'animation', 99: 'documentary' };
        const genreNames = { 28: '动作', 12: '冒险', 878: '科幻', 53: '惊悚', 27: '恐怖', 35: '喜剧', 10749: '爱情', 18: '剧情', 16: '动画', 99: '纪录片' };
        const genres = movie.genre_ids.map(id => genreNames[id] || '其他').slice(0, 2);
        document.getElementById('movie-genre').textContent = `类型: ${genres.join(', ')}`;
        
        // 自动填充
        if (movie.runtime) document.getElementById('duration').value = movie.runtime;
        
        // 尝试匹配类型
        const genreId = movie.genre_ids[0];
        if (genreIds[genreId]) {
          document.getElementById('genre').value = genreIds[genreId];
        }
      }
      
      document.getElementById('movie-info').style.display = 'block';
    }
  } catch (e) {
    console.log('自动获取失败，请手动填写');
  }
}

async function addMovie(e) {
  e.preventDefault();
  
  const movieData = {
    movie_name: document.getElementById('movie-name').value,
    watch_date: document.getElementById('watch-date').value,
    duration_minutes: parseInt(document.getElementById('duration').value) || null,
    genre: document.getElementById('genre').value || null,
    created_by: document.getElementById('created-by').value || 'TA'
  };

  if (!supabase) {
    alert('请先配置 Supabase');
    return;
  }

  try {
    const { error } = await supabase.from('movies').insert(movieData);
    if (error) throw error;
    
    hideAddModal();
    await loadMovies();
    alert('添加成功！');
  } catch (err) {
    console.error(err);
    alert('添加失败: ' + err.message);
  }
}

// ========== 数据加载 ==========
async function loadMovies() {
  if (!supabase) {
    // 演示数据
    movies = [];
    renderHome();
    return;
  }

  try {
    const { data, error } = await supabase
      .from('movies')
      .select('*')
      .order('watch_date', { ascending: false });
    
    if (error) throw error;
    movies = data || [];
    
    // 更新首页的 X 次
    document.getElementById('page-title').textContent = `第 ${movies.length} 次一起看`;
  } catch (err) {
    console.error('加载数据失败:', err);
  }
}

// ========== 初始化 ==========
async function init() {
  await initSupabase();
  await loadMovies();
  renderHome();
}

init();
