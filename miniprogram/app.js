const { Store } = require('./lib/store.js');
const { getRepository } = require('./lib/repository.js');
const { getSession, setSession } = require('./lib/auth.js');

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
