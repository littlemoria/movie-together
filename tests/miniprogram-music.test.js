/**
 * 音乐模块单元测试：验证跨页面共享、自动播放、状态订阅语义。
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

// ---------- wx mock ----------
const created = [];
let storage = {};

global.wx = {
    createInnerAudioContext() {
        const ctx = {
            src: '',
            volume: 1,
            paused: true,
            _handlers: {},
            // 真实 API 是四个独立方法，不是通用 on()
            onEnded(fn) { this._handlers.ended = fn; return this; },
            onError(fn) { this._handlers.error = fn; return this; },
            onPlay(fn) { this._handlers.play = fn; return this; },
            onPause(fn) { this._handlers.pause = fn; return this; },
            play() { this.paused = false; if (this._handlers.play) this._handlers.play(); },
            pause() { this.paused = true; if (this._handlers.pause) this._handlers.pause(); },
            stop() { this.paused = true; },
            destroy() { this.destroyed = true; },
            _emit(ev) { if (this._handlers[ev]) this._handlers[ev](); },
        };
        created.push(ctx);
        return ctx;
    },
    getStorageSync(k) { return storage[k] === undefined ? '' : storage[k]; },
    setStorageSync(k, v) { storage[k] = v; },
    showToast() {},
    onTouchStart(fn) { global.__touchHandler = fn; },
    offTouchStart(fn) { if (global.__touchHandler === fn) global.__touchHandler = null; },
};

const MINI_LIB = path.join(__dirname, '..', 'miniprogram', 'lib');
const { Music, MUSIC_TRACKS } = require(path.join(MINI_LIB, 'music.js'));

test('曲目列表与网页版一致（7 首且含新曲）', () => {
    assert.strictEqual(MUSIC_TRACKS.length, 7);
    assert.ok(MUSIC_TRACKS.some((t) => t.name.includes('一程山路')));
});

test('init 幂等：多次调用只创建一个音频实例', () => {
    created.length = 0;
    Music.audio = null;
    Music.init();
    Music.init();
    assert.strictEqual(created.length, 1);
});

test('playTrack 设置 src 并进入播放态', () => {
    created.length = 0;
    Music.audio = null;
    Music.trackIndex = -1;
    Music.paused = true;
    Music.muted = false;

    Music.playTrack(3);
    assert.strictEqual(Music.trackIndex, 3);
    assert.strictEqual(Music.paused, false);
    assert.strictEqual(Music.audio.src, MUSIC_TRACKS[3].url);
    assert.ok(Music.getState().playing);
});

test('playNext 循环到下一首并在末尾回绕', () => {
    Music.trackIndex = MUSIC_TRACKS.length - 1;
    Music.playNext();
    assert.strictEqual(Music.trackIndex, 0);
});

test('toggle 在暂停时恢复播放，在播放时暂停', () => {
    Music.audio.paused = false;
    Music.paused = false;
    Music.trackIndex = 0;

    Music.toggle();
    assert.strictEqual(Music.paused, true, '播放中 toggle 应暂停');

    Music.toggle();
    assert.strictEqual(Music.paused, false, '暂停中 toggle 应恢复播放');
});

test('未选曲时 toggle 随机选一首并播放', () => {
    Music.trackIndex = -1;
    Music.paused = true;
    Music.toggle();
    assert.ok(Music.trackIndex >= 0 && Music.trackIndex < MUSIC_TRACKS.length);
    assert.strictEqual(Music.paused, false);
});

test('setVolume 限制在 0-100 并持久化', () => {
    Music.setVolume(150);
    assert.strictEqual(Music.volume, 100);
    Music.setVolume(-20);
    assert.strictEqual(Music.volume, 0);
    Music.setVolume(35);
    assert.strictEqual(Music.volume, 35);
    assert.strictEqual(storage.music_volume, 35);
});

test('loadVolume：从未设置过时返回默认音量 30，而非被空字符串归零', () => {
    delete storage.music_volume;
    assert.strictEqual(Music.loadVolume(), 30, '空存储应回落到默认值');
});

test('loadVolume：用户主动存 0 时应尊重该值', () => {
    storage.music_volume = 0;
    assert.strictEqual(Music.loadVolume(), 0, '显式设置的 0 应被保留');
    delete storage.music_volume;
});

test('loadVolume：非法存储值回落到默认值', () => {
    storage.music_volume = 'abc';
    assert.strictEqual(Music.loadVolume(), 30);
    storage.music_volume = 500;
    assert.strictEqual(Music.loadVolume(), 30);
    delete storage.music_volume;
});

test('toggleMute 真实静音：音量置 0，取消后恢复用户音量', () => {
    Music.audio = null;
    Music.init();
    Music.setVolume(40);
    Music.muted = false;

    Music.toggleMute();
    assert.strictEqual(Music.muted, true, '应进入静音态');
    assert.strictEqual(Music.audio.volume, 0, '静音时实际音量应为 0');

    Music.toggleMute();
    assert.strictEqual(Music.muted, false, '应退出静音态');
    assert.strictEqual(Music.audio.volume, 0.4, '取消静音应恢复用户设定的音量');
});

test('静音状态下播放状态不受影响（静音 ≠ 暂停）', () => {
    Music.audio = null;
    Music.init();
    Music.playTrack(0);
    Music.muted = true;

    assert.strictEqual(Music.getState().playing, true, '静音时仍算播放中');
    assert.strictEqual(Music.getState().paused, false);
});

test('subscribe 立即推送当前状态，unsubscribe 后不再收到', () => {
    const seen = [];
    const un = Music.subscribe((s) => seen.push(s));
    assert.strictEqual(seen.length, 1, '订阅应立即收到一次当前状态');

    Music.playTrack(1);
    assert.ok(seen.length >= 2, '状态变化应推送');

    const count = seen.length;
    un();
    Music.playTrack(2);
    assert.strictEqual(seen.length, count, '取消订阅后不应再收到推送');
});

test('音频结束后自动播下一首', () => {
    Music.audio = null;
    Music.playTrack(0);
    Music.audio._emit('ended');
    assert.strictEqual(Music.trackIndex, 1, 'ended 应触发下一首');
});

test('armAutoPlay 在首次触摸后同步播放，且只触发一次', () => {
    Music.audio = null;
    Music.init();
    Music.trackIndex = -1;
    Music.paused = true;
    Music.autoPlayArmed = false;
    Music.armAutoPlay();
    assert.ok(global.__touchHandler, '应注册触摸监听');

    // 必须在触摸回调的同步调用栈内触发播放，不能用 setTimeout 延迟
    global.__touchHandler();
    assert.ok(Music.trackIndex >= 0, '首次触摸后应立即自动播放一首');
    assert.strictEqual(Music.paused, false, '应处于播放态');
    assert.strictEqual(global.__touchHandler, null, '监听应已解绑');
});

test('armAutoPlay 不会覆盖用户已手动选择的曲目', () => {
    Music.audio = null;
    Music.init();
    Music.playTrack(2);
    Music.autoPlayArmed = false;
    Music.armAutoPlay();

    global.__touchHandler();
    assert.strictEqual(Music.trackIndex, 2, '用户已选曲时不应被自动播放覆盖');
});
