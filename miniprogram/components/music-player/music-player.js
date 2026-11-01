const { Music } = require('../../lib/music.js');

Component({
    properties: {
        // 悬浮球距底部的距离（rpx），供页面按需调整避开底部导航
        bottom: {
            type: Number,
            value: 120,
        },
    },

    data: {
        panelOpen: false,
        playing: false,
        muted: false,
        volume: 30,
        trackIndex: -1,
        trackName: '',
        tracks: [],
    },

    lifetimes: {
        attached() {
            Music.init();
            this.unsubscribe = Music.subscribe((state) => {
                this.setData({
                    playing: state.playing,
                    muted: state.muted,
                    volume: state.volume,
                    trackIndex: state.trackIndex,
                    trackName: state.trackName,
                    tracks: state.tracks,
                });
            });
        },
        detached() {
            if (this.unsubscribe) this.unsubscribe();
        },
    },

    methods: {
        /**
         * 首次触摸兜底：在手势的同步调用栈内解锁音频播放。
         *
         * 全局 wx.onTouchStart 已作为主触发路径，但部分真机上 App 级监听
         * 可能不触发（例如页面已处于前台、或被其它监听覆盖）。组件挂在
         * 全部 6 个页面上，这里再补一个页面级触发点提高可靠性。
         */
        onFirstTouch() {
            Music.unlock();
        },

        togglePanel() {
            this.setData({ panelOpen: !this.data.panelOpen });
        },

        toggleMusic() {
            Music.toggle();
        },

        toggleMute() {
            Music.toggleMute();
        },

        playTrack(e) {
            const index = Number(e.currentTarget.dataset.index);
            Music.playTrack(index);
        },

        nextTrack() {
            Music.playNext();
        },

        onVolumeChange(e) {
            Music.setVolume(e.detail.value);
        },
    },
});
