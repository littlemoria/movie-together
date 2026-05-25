/**
 * 日志分级模块
 * DEBUG 模式下输出详细日志，生产环境静默
 */

const Logger = {
  _debug: false,

  init() {
    this._debug = !!(window.ENV && window.ENV.DEBUG) || !!(window.envConfig && window.envConfig.DEBUG);
  },

  debug(tag, ...args) {
    if (this._debug) {
      console.debug(`[${tag}]`, ...args);
    }
  },

  info(tag, ...args) {
    if (this._debug) {
      console.info(`[${tag}]`, ...args);
    }
  },

  warn(tag, ...args) {
    if (this._debug) {
      console.warn(`[${tag}]`, ...args);
    } else {
      console.warn(`[${tag}]`, ...args);
    }
  },

  error(tag, ...args) {
    console.error(`[${tag}]`, ...args);
  }
};
