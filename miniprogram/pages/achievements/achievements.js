const { Store } = require('../../lib/store.js');
const Domain = require('../../lib/domain.js');
const { saveSettings } = require('../../lib/service.js');
const { ACHIEVEMENTS, STORAGE_KEYS } = require('../../lib/constants.js');

/**
 * 判断成就是否达成。
 * type=count 依已看次数，type=minutes 依累计分钟数。
 */
function isUnlocked(achievement, watchedCount, totalMinutes) {
    if (achievement.type === 'minutes') return totalMinutes >= achievement.threshold;
    return watchedCount >= achievement.threshold;
}

Page({
    data: {
        achievements: [],
        unlockedCount: 0,
    },

    onShow() {
        if (!Store.isAuthenticated()) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        this.refresh();
    },

    async refresh() {
        const watched = Store.getWatched();
        const totalMinutes = Domain.getTotalMinutes(watched);
        const prevUnlocked = new Set(Store.state.unlockedAchievements);

        const achievements = ACHIEVEMENTS.map((achievement) => ({
            id: achievement.id,
            name: achievement.name,
            desc: achievement.desc,
            icon: achievement.icon,
            unlocked: isUnlocked(achievement, watched.length, totalMinutes),
        }));

        const newlyUnlocked = achievements.filter((a) => a.unlocked && !prevUnlocked.has(a.id));

        this.setData({
            achievements,
            unlockedCount: achievements.filter((a) => a.unlocked).length,
        });

        if (newlyUnlocked.length) {
            // 记录新解锁的成就并同步云端。
            Store.setUnlockedAchievements([
                ...Store.state.unlockedAchievements,
                ...newlyUnlocked.map((a) => a.id),
            ]);
            wx.setStorageSync(STORAGE_KEYS.ACHIEVEMENTS, Store.state.unlockedAchievements);
            await saveSettings();
            this.showCelebration(newlyUnlocked);
        }
    },

    showCelebration(newlyUnlocked) {
        const first = newlyUnlocked[0];
        const moreText = newlyUnlocked.length > 1 ? ` 等 ${newlyUnlocked.length} 个成就` : '';
        wx.showModal({
            title: `${first.icon} 解锁成就`,
            content: `${first.name}${moreText}\n${first.desc}`,
            showCancel: false,
            confirmText: '太棒了',
        });
    },
});
