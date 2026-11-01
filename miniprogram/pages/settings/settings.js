const { Store } = require('../../lib/store.js');
const { saveSettings, loadMovies, saveMovie, deleteMovie } = require('../../lib/service.js');
const { parseCSV, toCSV } = require('../../lib/csv.js');
const { Music } = require('../../lib/music.js');

// 隐私保护指引内置文本。内容需与微信后台「用户隐私保护指引」声明的
// 每一条对应，后台会检测小程序内是否存在可查看隐私政策的入口。
const PRIVACY_TEXT = [
    '一、收集的信息：仅收集你主动输入的邮箱地址，用于账号登录与身份验证。',
    '不收集手机号、位置、相册、摄像头、麦克风等任何其他信息。',
    '二、用途：邮箱地址仅用于识别账号本人，不用于其他用途。',
    '三、存储：存储于开发者自有云数据库（境内节点），账号存续期间保存，注销后删除。',
    '四、共享：不与任何第三方共享。',
    '五、你的权利：可随时通过「退出登录」清除本地登录状态，或联系开发者删除账号数据。',
].join('\n');

Page({
    // ---------- 背景音乐 ----------

    /**
     * 首次触摸兜底：在手势的同步调用栈内解锁音频播放。
     * 全局 wx.onTouchStart 为主触发路径，这里保证页面级触摸同样能触发。
     */
    onFirstTouch() {
        Music.unlock();
    },

    data: {
        theme: 'light',
        bgImage: '',
        bgMaskOpacity: 30,
        cardOpacity: 100,
        saving: false,
        musicPlaying: false,
        musicMuted: false,
        currentTrackName: '',
        volume: 30,
    },

    onLoad() {
        // 音频实例由全局 Music 管理器持有，跨页面不中断。
        this.unsubscribeMusic = Music.subscribe((state) => {
            this.setData({
                musicPlaying: state.playing,
                musicMuted: state.muted,
                currentTrackName: state.trackName,
                volume: state.volume,
            });
        });
    },

    onUnload() {
        if (this.unsubscribeMusic) this.unsubscribeMusic();
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

    toggleMusic() {
        Music.toggle();
    },

    toggleMute() {
        Music.toggleMute();
    },

    nextTrack() {
        Music.playNext();
    },

    onVolumeChange(e) {
        Music.setVolume(e.detail.value);
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

    // ---------- 隐私 ----------

    /**
     * 展示隐私保护指引。
     * 微信后台要求：声明了隐私收集项的小程序必须提供查看入口，
     * 否则提审时会被判定「未声明隐私保护指引」而驳回。
     * 优先使用官方隐私协议组件（openPrivacyContract），
     * 组件不可用时降级为弹窗展示内置文本。
     */
    showPrivacyPolicy() {
        const openContract = () => {
            if (wx.openPrivacyContract) {
                wx.openPrivacyContract({
                    fail: () => wx.showModal({ title: '隐私保护指引', content: PRIVACY_TEXT, showCancel: false }),
                });
                return;
            }
            wx.showModal({ title: '隐私保护指引', content: PRIVACY_TEXT, showCancel: false });
        };

        // 需用户同意隐私协议的场景：调用官方组件前先确认已授权
        if (wx.requirePrivacyAuthorize) {
            wx.requirePrivacyAuthorize({
                onNeedPrivacyAuthorization: openContract,
                success: openContract,
                fail: openContract,
            });
            return;
        }
        openContract();
    },
});
