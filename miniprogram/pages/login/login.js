const { login } = require('../../lib/auth.js');
const { Store } = require('../../lib/store.js');
const { Music } = require('../../lib/music.js');

Page({

    // ---------- 背景音乐 ----------

    /**
     * 首次触摸兜底：在手势的同步调用栈内解锁音频播放。
     * 全局 wx.onTouchStart 为主触发路径，这里保证页面级触摸同样能触发。
     */
    onFirstTouch() {
        Music.unlock();
    },    data: {
        email: '',
        password: '',
        loading: false,
        error: '',
    },

    onLoad() {
        // 已登录则直接进入首页。
        if (Store.isAuthenticated()) {
            wx.reLaunch({ url: '/pages/home/home' });
        }
    },

    onEmailInput(e) {
        this.setData({ email: e.detail.value, error: '' });
    },

    onPasswordInput(e) {
        this.setData({ password: e.detail.value, error: '' });
    },

    async handleLogin() {
        const { email, password } = this.data;
        if (!email || !password) {
            this.setData({ error: '请输入邮箱和密码' });
            return;
        }

        this.setData({ loading: true, error: '' });
        try {
            const session = await login(email, password);
            Store.setSession(session);
            wx.reLaunch({ url: '/pages/home/home' });
        } catch (err) {
            this.setData({ error: err.message || '登录失败' });
        } finally {
            this.setData({ loading: false });
        }
    },
});
