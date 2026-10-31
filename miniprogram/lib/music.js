/**
 * 全局背景音乐管理器。
 *
 * 对应网页版 js/app.js 的 setupMusic / playTrack / toggleMusic / playNextTrack 语义，
 * 但音频实例提升为跨页面单例——小程序每个 Page 实例独立，挂在 Page 上的
 * InnerAudioContext 会随页面销毁而中断播放。
 *
 * 曲目列表与网页版保持一致（7 首）。
 */

// 背景音乐曲目（需 https 且域名已加入小程序合法域名白名单）
const MUSIC_TRACKS = [
    { name: '萤火之森 - CMJ', url: 'https://music.163.com/song/media/outer/url?id=1415706303.mp3' },
    { name: 'Mia And Sebastian - Sergio Blanco', url: 'https://music.163.com/song/media/outer/url?id=2130777132.mp3' },
    { name: "Hedwig's Theme - John Williams", url: 'https://music.163.com/song/media/outer/url?id=5197491.mp3' },
    { name: "One Summer's Day", url: 'https://music.163.com/song/media/outer/url?id=1867108465.mp3' },
    { name: '儿时的夏日 - 余日秋山', url: 'https://music.163.com/song/media/outer/url?id=467744316.mp3' },
    { name: 'Summer - 久石让', url: 'https://music.163.com/song/media/outer/url?id=1867107328.mp3' },
    { name: '一程山路 - 毛不易', url: 'https://cdn5.lizhi.fm/audio/2019/01/04/2713052851351894534_hd.mp3' },
];

const VOLUME_KEY = 'music_volume';
const DEFAULT_VOLUME = 12;

const Music = {
    audio: null,
    trackIndex: -1,
    muted: false,
    paused: true,
    volume: DEFAULT_VOLUME,
    listeners: [],
    autoPlayArmed: false,
    lastError: null,

    /**
     * 初始化音频实例（幂等）。只应在 App.onLaunch 调用一次。
     */
    init() {
        if (this.audio) return this.audio;

        this.volume = this.loadVolume();

        const audio = wx.createInnerAudioContext();
        audio.volume = this.volume / 100;
        this.audio = audio;

        // 播放结束后自动下一首，与网页版一致
        audio.onEnded(() => {
            this.playNext();
        });

        audio.onError((err) => {
            this.lastError = err;
            this.paused = true;
            this.emit();
            wx.showToast({
                title: '音乐加载失败，请确认域名已加入合法域名白名单',
                icon: 'none',
            });
        });

        audio.onPlay(() => {
            this.paused = false;
            this.emit();
        });

        audio.onPause(() => {
            this.paused = true;
            this.emit();
        });

        return audio;
    },

    /**
     * 读取本地保存的音量。
     */
    loadVolume() {
        try {
            const stored = wx.getStorageSync(VOLUME_KEY);
            const value = Number(stored);
            if (!Number.isNaN(value) && value >= 0 && value <= 100) {
                return value;
            }
        } catch (e) {
            // 读失败用默认值
        }
        return DEFAULT_VOLUME;
    },

    /**
     * 订阅状态变化，返回取消订阅函数。
     */
    subscribe(listener) {
        this.listeners.push(listener);
        listener(this.getState());
        return () => {
            this.listeners = this.listeners.filter((fn) => fn !== listener);
        };
    },

    emit() {
        const state = this.getState();
        this.listeners.forEach((fn) => {
            try {
                fn(state);
            } catch (e) {
                console.error('[Music] 订阅回调异常:', e);
            }
        });
    },

    getState() {
        return {
            playing: !this.paused && !this.muted,
            paused: this.paused,
            muted: this.muted,
            volume: this.volume,
            trackIndex: this.trackIndex,
            trackName: this.trackIndex >= 0 ? MUSIC_TRACKS[this.trackIndex].name : '',
            tracks: MUSIC_TRACKS,
        };
    },

    /**
     * 播放指定曲目。
     */
    playTrack(index) {
        if (!this.audio) this.init();
        if (index < 0 || index >= MUSIC_TRACKS.length) return;

        const track = MUSIC_TRACKS[index];
        this.trackIndex = index;
        this.audio.src = track.url;
        this.audio.volume = this.volume / 100;
        this.audio.play();
        this.paused = false;
        this.muted = false;
        this.emit();
    },

    /**
     * 播放/暂停切换（对应网页版 toggleMusic）。
     */
    toggle() {
        if (!this.audio) this.init();

        // 还没选曲时，随机播一首（与网页版一致）
        if (this.trackIndex === -1) {
            this.muted = false;
            this.paused = false;
            this.playTrack(Math.floor(Math.random() * MUSIC_TRACKS.length));
            return;
        }

        if (this.paused || this.muted) {
            this.muted = false;
            this.audio.play();
            this.paused = false;
        } else {
            this.audio.pause();
            this.paused = true;
        }
        this.emit();
    },

    /**
     * 播放下一首。
     */
    playNext() {
        const nextIndex = (this.trackIndex + 1) % MUSIC_TRACKS.length;
        this.playTrack(nextIndex);
    },

    /**
     * 设置音量（0-100）。
     */
    setVolume(value) {
        const volume = Math.max(0, Math.min(100, Number(value) || 0));
        this.volume = volume;
        if (this.audio) this.audio.volume = volume / 100;
        try {
            wx.setStorageSync(VOLUME_KEY, volume);
        } catch (e) {
            // 存储失败不阻断
        }
        this.emit();
    },

    /**
     * 首次用户交互后自动随机播放一首（对齐网页版的 document click once 逻辑）。
     * 微信小程序禁止无用户手势的自动播放，因此必须挂在 touch 事件上。
     */
    armAutoPlay() {
        if (this.autoPlayArmed) return;
        this.autoPlayArmed = true;

        const start = () => {
            wx.offTouchStart(start);
            // 首次交互后延迟一点，避开手势期间的音频策略限制
            setTimeout(() => {
                if (this.trackIndex === -1 && !this.muted) {
                    this.playTrack(Math.floor(Math.random() * MUSIC_TRACKS.length));
                }
            }, 100);
        };

        wx.onTouchStart(start);
    },

    /**
     * 页面隐藏时不暂停——小程序切后台音频默认继续播放，与网页版行为一致。
     */
    keepAlive() {
        // 保留钩子：若后续需要「离开页面自动暂停」，在此实现。
    },
};

module.exports = { Music, MUSIC_TRACKS };
