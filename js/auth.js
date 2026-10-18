/**
 * 认证模块（基于 Supabase Auth）
 *
 * 说明：
 * - 登录/登出完全交给 Supabase Auth，前端不再比对任何本地密码
 * - 登录态由 Supabase 会话驱动，写入权限由服务端 RLS 强制校验
 */

const Auth = {
  /**
   * 初始化：恢复已有会话并监听登录状态变化
   */
  async init() {
    if (!API.client) {
      API.initSupabase();
    }
    if (!API.client) {
      console.warn('[Auth] Supabase 未配置，认证功能不可用');
      return;
    }

    try {
      const { data } = await API.client.auth.getSession();
      appState.isAdmin = !!(data && data.session);
    } catch (e) {
      console.error('恢复会话失败:', e);
      appState.isAdmin = false;
    }
    this.refreshUI();

    API.client.auth.onAuthStateChange((_event, session) => {
      appState.isAdmin = !!session;
      this.refreshUI();
    });
  },

  /**
   * 通知界面刷新登录状态
   */
  refreshUI() {
    if (typeof App !== 'undefined' && App.updateLoginStatus) {
      App.updateLoginStatus();
    }
  },

  /**
   * 登录
   * @param {string} email
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async login(email, password) {
    if (!API.client) {
      Utils.showToast('Supabase 未配置，无法登录', 'error');
      return false;
    }
    try {
      const { error } = await API.client.auth.signInWithPassword({ email, password });
      if (error) {
        Utils.showToast('登录失败：' + error.message, 'error');
        return false;
      }
      appState.isAdmin = true;
      Utils.showToast('登录成功！', 'success');
      this.refreshUI();
      return true;
    } catch (e) {
      console.error('登录异常:', e);
      Utils.showToast('登录失败，请稍后重试', 'error');
      return false;
    }
  },

  /**
   * 登出
   */
  async logout() {
    try {
      if (API.client) {
        await API.client.auth.signOut();
      }
    } catch (e) {
      console.error('登出失败:', e);
    }
    appState.isAdmin = false;
    Utils.showToast('已退出登录', 'info');
    this.refreshUI();
  },

  /**
   * 获取当前访问令牌（供 API 写入使用）
   * @returns {Promise<string|null>}
   */
  async getAccessToken() {
    if (!API.client) return null;
    const { data } = await API.client.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  },

  /**
   * 修改当前登录用户的密码
   * @param {string} newPassword
   * @returns {Promise<boolean>}
   */
  async changePassword(newPassword) {
    if (!API.client) return false;
    const { error } = await API.client.auth.updateUser({ password: newPassword });
    if (error) {
      Utils.showToast('修改密码失败：' + error.message, 'error');
      return false;
    }
    Utils.showToast('密码修改成功！', 'success');
    return true;
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.Auth = Auth;
}
