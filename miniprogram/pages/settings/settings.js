const { Store } = require('../../lib/store.js');
const { saveSettings, loadMovies, saveMovie, deleteMovie } = require('../../lib/service.js');
const { parseCSV, toCSV } = require('../../lib/csv.js');

// 背景音乐曲目（与网页版一致；需 https 且域名加入合法域名白名单）
const MUSIC_TRACKS = [
    { name: '萤火之森 - CMJ', url: 'https://music.163.com/song/media/outer/url?id=1415706303.mp3' },
    { name: 'Mia And Sebastian - Sergio Blanco', url: 'https://music.163.com/song/media/outer/url?id=2130777132.mp3' },
    { name: "Hedwig's Theme - John Williams", url: 'https://music.163.com/song/media/outer/url?id=5197491.mp3' },
    { name: "One Summer's Day", url: 'https://music.163.com/song/media/outer/url?id=1867108465.mp3' },
    { name: '儿时的夏日 - 余日秋山', url: 'https://music.163.com/song/media/outer/url?id=467744316.mp3' },
    { name: 'Summer - 久石让', url: 'https://music.163.com/song/media/outer/url?id=1867107328.mp3' },
    { name: '一程山路 - 毛不易', url: 'https://cdn5.lizhi.fm/audio/2019/01/04/2713052851351894534_hd.mp3' },
];

Page({
    data: {
        theme: 'light',
        bgImage: '',
        bgMaskOpacity: 30,
        cardOpacity: 100,
        saving: false,
        musicPlaying: false,
        currentTrackName: MUSIC_TRACKS[0].name,
        volume: 60,
    },

    onLoad() {
        this.trackIndex = 0;
        this.audio = null;
        this.initAudio();
    },

    onShow() {
        if (!Store.isAuthenticated()) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        const settings = Store.state.settings || {};
        this.setData({
            theme: settings.theme || 'light',
            bgImage: settings.bgImage || '',
            bgMaskOpacity: settings.bgMaskOpacity === undefined ? 30 : settings.bgMaskOpacity,
            cardOpacity: settings.cardOpacity === undefined ? 100 : settings.cardOpacity,
        });
        this.applyTheme(settings.theme || 'light');
    },

    onUnload() {
        if (this.audio) {
            this.audio.destroy();
            this.audio = null;
        }
    },

    // ---------- 主题与背景 ----------

    setTheme(e) {
        const theme = e.currentTarget.dataset.theme === 'dark' ? 'dark' : 'light';
        this.setData({ theme });
        this.applyTheme(theme);
    },

    applyTheme(theme) {
        const pages = getCurrentPages();
        pages.forEach((page) => {
            if (page && typeof page.setData === 'function') {
                page.setData({ themeClass: theme === 'dark' ? 'theme-dark' : '' });
            }
        });
    },

    onFieldInput(e) {
        const field = e.currentTarget.dataset.field;
        this.setData({ [field]: e.detail.value });
    },

    onMaskOpacityChange(e) {
        this.setData({ bgMaskOpacity: e.detail.value });
    },

    onCardOpacityChange(e) {
        this.setData({ cardOpacity: e.detail.value });
    },

    async handleSaveSettings() {
        this.setData({ saving: true });
        try {
            const settings = {
                ...Store.state.settings,
                theme: this.data.theme,
                bgImage: this.data.bgImage,
                bgMaskOpacity: this.data.bgMaskOpacity,
                cardOpacity: this.data.cardOpacity,
            };
            Store.setSettings(settings);
            const result = await saveSettings();
            if (!result.ok) {
                wx.showToast({ title: result.error.message || '保存失败', icon: 'none' });
                return;
            }
            wx.showToast({ title: '设置已保存', icon: 'success' });
        } finally {
            this.setData({ saving: false });
        }
    },

    // ---------- 数据导入导出 ----------

    // 写文件并尝试调起分享；不支持时降级为复制到剪贴板。
    writeAndShare(fileName, content, mimeHint) {
        const fs = wx.getFileSystemManager();
        const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
        fs.writeFile({
            filePath,
            data: content,
            encoding: 'utf8',
            success: () => {
                if (wx.shareFileMessage) {
                    wx.shareFileMessage({
                        filePath,
                        filename: fileName,
                        success: () => wx.showToast({ title: '已导出', icon: 'success' }),
                        fail: () => this.copyFallback(content, fileName),
                    });
                } else {
                    this.copyFallback(content, fileName);
                }
            },
            fail: () => this.copyFallback(content, fileName),
        });
    },

    copyFallback(content, fileName) {
        wx.setClipboardData({
            data: content,
            success: () => wx.showToast({ title: `已复制 ${fileName} 到剪贴板`, icon: 'none' }),
        });
    },

    handleExport() {
        const movies = Store.getWatched();
        if (!movies.length) {
            wx.showToast({ title: '暂无记录可导出', icon: 'none' });
            return;
        }
        const csv = toCSV(movies);
        this.writeAndShare('cinememo-movies.csv', csv);
    },

    handleBackup() {
        const movies = Store.getWatched();
        if (!movies.length) {
            wx.showToast({ title: '暂无记录可备份', icon: 'none' });
            return;
        }
        const backup = JSON.stringify({ version: 1, exported_at: new Date().toISOString(), movies }, null, 2);
        this.writeAndShare('cinememo-backup.json', backup);
    },

    handleImport() {
        wx.showActionSheet({
            itemList: ['追加导入（保留现有记录）', '替换导入（清空后导入）'],
            success: (res) => {
                this.pickCsvFile(res.tapIndex === 0 ? 'append' : 'replace');
            },
        });
    },

    handleRestore() {
        wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['json'],
            success: (res) => {
                const file = res.tempFiles[0];
                const fs = wx.getFileSystemManager();
                fs.readFile({
                    filePath: file.path,
                    encoding: 'utf8',
                    success: (data) => this.applyRestore(data.data),
                    fail: () => wx.showToast({ title: '读取备份失败', icon: 'none' }),
                });
            },
            fail: () => {},
        });
    },

    pickCsvFile(mode) {
        wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['csv'],
            success: (res) => {
                const file = res.tempFiles[0];
                const fs = wx.getFileSystemManager();
                fs.readFile({
                    filePath: file.path,
                    encoding: 'utf8',
                    success: (data) => this.applyImport(data.data, mode),
                    fail: () => wx.showToast({ title: '读取文件失败', icon: 'none' }),
                });
            },
            fail: () => {},
        });
    },

    async applyImport(text, mode) {
        const parsed = parseCSV(text);
        if (!parsed.length) {
            wx.showToast({ title: '文件内容为空或格式不正确', icon: 'none' });
            return;
        }

        if (mode === 'replace') {
            const confirmed = await new Promise((resolve) => {
                wx.showModal({
                    title: '替换导入',
                    content: `将导入 ${parsed.length} 条记录，并清空现有记录。是否继续？`,
                    success: (res) => resolve(res.confirm),
                });
            });
            if (!confirmed) return;

            // 删除云端现有记录
            const existing = Store.getWatched();
            for (const movie of existing) {
                await deleteMovie(movie.id);
            }
            Store.setMovies([]);
        }

        let failed = 0;
        for (const item of parsed) {
            const result = await saveMovie(item, null);
            if (!result.ok) failed++;
        }

        await loadMovies();
        wx.showToast({
            title: failed ? `导入完成，${failed} 条失败` : `成功导入 ${parsed.length} 条记录`,
            icon: failed ? 'none' : 'success',
        });
    },

    async applyRestore(text) {
        let payload;
        try {
            payload = JSON.parse(text);
        } catch (e) {
            wx.showToast({ title: '备份文件格式无效', icon: 'none' });
            return;
        }

        const movies = Array.isArray(payload) ? payload : payload.movies;
        if (!Array.isArray(movies) || !movies.length) {
            wx.showToast({ title: '备份中没有记录', icon: 'none' });
            return;
        }

        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '恢复备份',
                content: `将导入 ${movies.length} 条记录，是否继续？`,
                success: (res) => resolve(res.confirm),
            });
        });
        if (!confirmed) return;

        for (const movie of movies) {
            await saveMovie(movie, null);
        }
        await loadMovies();
        wx.showToast({ title: `已恢复 ${movies.length} 条记录`, icon: 'success' });
    },

    // ---------- 背景音乐 ----------

    initAudio() {
        this.audio = wx.createInnerAudioContext();
        this.audio.volume = this.data.volume / 100;
        this.audio.onError((err) => {
            this.setData({ musicPlaying: false });
            wx.showToast({
                title: '音乐加载失败，请确认域名已加入合法域名白名单',
                icon: 'none',
            });
        });
        this.audio.onEnded(() => {
            this.nextTrack();
        });
    },

    toggleMusic() {
        if (!this.audio) return;
        if (this.data.musicPlaying) {
            this.audio.pause();
            this.setData({ musicPlaying: false });
            return;
        }
        const track = MUSIC_TRACKS[this.trackIndex];
        this.audio.src = track.url;
        this.audio.play();
        this.setData({ musicPlaying: true, currentTrackName: track.name });
    },

    nextTrack() {
        this.trackIndex = (this.trackIndex + 1) % MUSIC_TRACKS.length;
        const track = MUSIC_TRACKS[this.trackIndex];
        this.setData({ currentTrackName: track.name });
        if (this.audio && this.data.musicPlaying) {
            this.audio.src = track.url;
            this.audio.play();
        }
    },

    onVolumeChange(e) {
        this.setData({ volume: e.detail.value });
        if (this.audio) this.audio.volume = e.detail.value / 100;
    },

    // ---------- 账号 ----------

    handleLogout() {
        wx.showModal({
            title: '退出登录',
            content: '确定要退出登录吗？',
            success: (res) => {
                if (!res.confirm) return;
                const app = getApp();
                app.onLogout();
                wx.reLaunch({ url: '/pages/login/login' });
            },
        });
    },
});
