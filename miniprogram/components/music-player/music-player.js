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
        volume: 12,
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
        togglePanel() {
            this.setData({ panelOpen: !this.data.panelOpen });
        },

        toggleMusic() {
            Music.toggle();
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
