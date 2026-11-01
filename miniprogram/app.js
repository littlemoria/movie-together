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

        // 音频实例不能在 onLaunch 创建：iOS 微信要求音频上下文必须在用户
        // 手势的同步调用栈内创建，否则 play() 会被判为非手势上下文而拒播。
        // 这里只读取本地音量（不涉及音频实例），实例由首次触摸时创建。
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
