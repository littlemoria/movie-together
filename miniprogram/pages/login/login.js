const { login } = require('../../lib/auth.js');
const { Store } = require('../../lib/store.js');

Page({
    data: {
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
