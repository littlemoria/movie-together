/**
 * CineMemo 配置文件
 * 包含所有常量、配置项和初始数据
 */

const Config = {
  // Supabase 配置
  SUPABASE_URL: 'https://zbghffgydxzufzfuozwq.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZ2hmZmd5ZHh6dWZ6ZnVvendxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzI1MDAsImV4cCI6MjA5MDQ0ODUwMH0.9_v1GjPo1ISkGCyvyAsqwhvkfRMsvR_OfgZVStxhVRc',

  // TMDB API 配置
  TMDB_API_KEY: 'cd1951025c510fc9bf0a0523bfc31b6b',
  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/w200',
  TMDB_IMAGE_BASE_LG: 'https://image.tmdb.org/t/p/w500',

  // 默认管理员密码
  DEFAULT_ADMIN_PASSWORD: 'huiwan111',

  // 音乐曲目列表
  MUSIC_TRACKS: [
    { name: '萤火之森 - CMJ', url: 'http://music.163.com/song/media/outer/url?id=1415706303.mp3' },
    { name: 'Mia And Sebastian - Sergio Blanco', url: 'http://music.163.com/song/media/outer/url?id=2130777132.mp3' },
    { name: "Hedwig's Theme - John Williams", url: 'http://music.163.com/song/media/outer/url?id=5197491.mp3' },
    { name: 'One Summer\'s Day', url: 'http://music.163.com/song/media/outer/url?id=1867108465.mp3' },
    { name: '儿时的夏日 - 余日秋山', url: 'http://music.163.com/song/media/outer/url?id=467744316.mp3' },
    { name: 'Summer - 久石让', url: 'http://music.163.com/song/media/outer/url?id=1867107328.mp3' }
  ],

  // 默认类型定义
  DEFAULT_GENRES: [
    { id: 'action', name: '动作' },
    { id: 'romance', name: '爱情' },
    { id: 'comedy', name: '喜剧' },
    { id: 'thriller', name: '惊悚' },
    { id: 'sci-fi', name: '科幻' },
    { id: 'drama', name: '剧情' },
    { id: 'horror', name: '恐怖' },
    { id: 'animation', name: '动画' },
    { id: 'documentary', name: '纪录片' }
  ],

  // TMDB 类型 ID 映射到内部类型 ID
  TMDB_GENRE_MAP: {
    28: 'action',    // Action
    12: 'action',    // Adventure
    37: 'action',    // Western
    35: 'comedy',    // Comedy
    10749: 'romance', // Romance
    27: 'horror',    // Horror
    878: 'sci-fi',   // Science Fiction
    14: 'sci-fi',    // Fantasy
    18: 'drama',     // Drama
    36: 'drama',     // History
    10752: 'drama',  // War
    10402: 'drama',  // Music
    10770: 'drama',  // TV Movie
    53: 'thriller',  // Thriller
    80: 'thriller',  // Crime
    9648: 'thriller', // Mystery
    16: 'animation', // Animation
    10751: 'animation', // Family
    99: 'documentary' // Documentary
  },

  // 成就定义
  ACHIEVEMENTS: [
    { id: 'first_watch', name: '初遇', desc: '第1次一起看', icon: '🎬', condition: (m) => m.length >= 1 },
    { id: 'tenth_watch', name: '十次之约', desc: '第10次一起看', icon: '🎬', condition: (m) => m.length >= 10 },
    { id: 'twenty_five', name: '银色时光', desc: '第25次一起看', icon: '💕', condition: (m) => m.length >= 25 },
    { id: 'fifty', name: '半百之旅', desc: '第50次一起看', icon: '🌟', condition: (m) => m.length >= 50 },
    { id: 'hundred', name: '百次辉煌', desc: '第100次一起看', icon: '👑', condition: (m) => m.length >= 100 },
    { id: 'ten_hours', name: '十小时陪伴', desc: '累计10小时', icon: '⏰', condition: (m) => Utils.getTotalMinutes(m) >= 600 },
    { id: 'fifty_hours', name: '五十小时', desc: '累计50小时', icon: '⏰', condition: (m) => Utils.getTotalMinutes(m) >= 3000 },
    { id: 'hundred_hours', name: '百小时里程碑', desc: '累计100小时', icon: '⏰', condition: (m) => Utils.getTotalMinutes(m) >= 6000 }
  ],

  // 页面标题配置
  PAGE_TITLES: {
    home: { title: 'CineMemo', subtitle: '记录我们的观影时光' },
    movies: { title: '观影记录', subtitle: '我们的电影清单' },
    achievements: { title: '成就徽章', subtitle: '解锁我们的里程碑' },
    stats: { title: '数据统计', subtitle: '一起看过的点点滴滴' }
  },

  // localStorage 键名
  STORAGE_KEYS: {
    CONFIG: 'movie-together-config',
    GENRES: 'movie-together-genres',
    MOVIES: 'movies',
    CACHE: 'movie-together-cache'
  },

  // 缓存配置
  CACHE_DURATION: 5 * 60 * 1000, // 5分钟
};

// 全局默认配置
let config = {
  theme: 'light',
  bgType: 'image',
  bgImage: '',
  bgGif: '',
  bgVideo: '',
  bgMaskOpacity: 30,
  cardOpacity: 100,
  adminPassword: Config.DEFAULT_ADMIN_PASSWORD
};

// 全局状态
let appState = {
  movies: [],
  isAdmin: false,
  customGenres: [],
  currentTrackIndex: -1,
  musicMuted: true,
  musicPaused: true,
  musicPanelOpen: false,
  currentTmdbResults: [],
  selectedTmdbMovie: null
};

// 云端设置
let cloudSettings = {
  bgType: 'image',
  bgImage: '',
  bgGif: '',
  bgVideo: '',
  bgMaskOpacity: 30,
  cardOpacity: 100
};
