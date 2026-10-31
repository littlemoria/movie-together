const { Store } = require('./lib/store.js');
const { getRepository } = require('./lib/repository.js');
const { getSession, setSession } = require('./lib/auth.js');
const { Music } = require('./lib/music.js');

App({
    globalData: {
        appName: 'CineMemo',
    },

    onLaunch() {
        // 恢复本地会话，让 Store 与仓储在冷启动时就有登录态。
        const session = getSession();
        if (session) {
            Store.setSession(session);
        }

        // 音频实例是全局单例：跨页面切换不中断，与网页版 <audio> 常驻 DOM 的行为一致。
        Music.init();

        // 微信禁止无用户手势的自动播放，首次触摸后随机播一首（对齐网页版行为）。
        Music.armAutoPlay();
    },

    // 登录成功后写入会话，并供仓储读取访问令牌。
    onLogin(session) {
        setSession(session);
        Store.setSession(session);
    },

    onLogout() {
        setSession(null);
        Store.setSession(null);
    },
});
