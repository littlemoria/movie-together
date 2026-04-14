/**
 * 认证模块
 * 提供更安全的认证机制
 * 
 * 安全特性：
 * - 密码强度验证
 * - 登录尝试限制
 * - 会话过期机制
 * - 防暴力破解
 */

const Auth = {
  // 配置
  config: {
    maxLoginAttempts: 5,           // 最大登录尝试次数
    lockoutDuration: 15 * 60 * 1000, // 锁定时间（15分钟）
    sessionDuration: 24 * 60 * 60 * 1000, // 会话有效期（24小时）
    minPasswordLength: 8,          // 最小密码长度
  },

  // 登录尝试记录
  loginAttempts: {},

  /**
   * 检查是否被锁定
   */
  isLockedOut() {
    const lastAttempt = localStorage.getItem('auth_last_attempt');
    if (!lastAttempt) return false;
    
    const attempts = JSON.parse(localStorage.getItem('auth_attempts') || '[]');
    const now = Date.now();
    
    // 清理过期的尝试记录
    const validAttempts = attempts.filter(time => now - time < this.config.lockoutDuration);
    
    if (validAttempts.length >= this.config.maxLoginAttempts) {
      const oldestAttempt = Math.min(...validAttempts);
      const timeUntilUnlock = this.config.lockoutDuration - (now - oldestAttempt);
      
      if (timeUntilUnlock > 0) {
        return {
          locked: true,
          remainingTime: Math.ceil(timeUntilUnlock / 1000 / 60), // 分钟
          message: `登录失败次数过多，请在 ${Math.ceil(timeUntilUnlock / 1000 / 60)} 分钟后重试`
        };
      }
    }
    
    return false;
  },

  /**
   * 记录登录尝试
   */
  recordLoginAttempt(success = false) {
    const attempts = JSON.parse(localStorage.getItem('auth_attempts') || '[]');
    const now = Date.now();
    
    if (!success) {
      attempts.push(now);
      localStorage.setItem('auth_attempts', JSON.stringify(attempts));
      localStorage.setItem('auth_last_attempt', now.toString());
    } else {
      // 登录成功，清空尝试记录
      localStorage.removeItem('auth_attempts');
      localStorage.removeItem('auth_last_attempt');
    }
  },

  /**
   * 检查密码强度
   */
  checkPasswordStrength(password) {
    const issues = [];
    
    if (password.length < this.config.minPasswordLength) {
      issues.push(`密码至少需要 ${this.config.minPasswordLength} 个字符`);
    }
    
    if (!/[a-z]/.test(password)) {
      issues.push('密码需要包含小写字母');
    }
    
    if (!/[A-Z]/.test(password)) {
      issues.push('密码需要包含大写字母');
    }
    
    if (!/[0-9]/.test(password)) {
      issues.push('密码需要包含数字');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      issues.push('密码需要包含特殊字符');
    }
    
    return {
      isStrong: issues.length === 0,
      issues,
      score: this.calculatePasswordScore(password)
    };
  },

  /**
   * 计算密码强度分数
   */
  calculatePasswordScore(password) {
    let score = 0;
    
    if (password.length >= 8) score += 20;
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
    if (/[a-z]/.test(password)) score += 15;
    if (/[A-Z]/.test(password)) score += 15;
    if (/[0-9]/.test(password)) score += 15;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 15;
    
    return Math.min(100, score);
  },

  /**
   * 验证密码
   */
  verifyPassword(inputPassword) {
    // 检查是否被锁定
    const lockStatus = this.isLockedOut();
    if (lockStatus && lockStatus.locked) {
      Utils.showToast(lockStatus.message, 'error');
      return false;
    }
    
    // 验证密码
    const correctPassword = config.adminPassword;
    const isCorrect = inputPassword === correctPassword;
    
    if (isCorrect) {
      // 登录成功
      this.recordLoginAttempt(true);
      this.createSession();
      return true;
    } else {
      // 登录失败
      this.recordLoginAttempt(false);
      const attempts = JSON.parse(localStorage.getItem('auth_attempts') || '[]').length;
      const remaining = this.config.maxLoginAttempts - attempts;
      
      if (remaining > 0) {
        Utils.showToast(`密码错误，剩余 ${remaining} 次尝试机会`, 'error');
      } else {
        Utils.showToast('登录失败次数过多，请 15 分钟后再试', 'error');
      }
      
      return false;
    }
  },

  /**
   * 创建会话
   */
  createSession() {
    const session = {
      isAdmin: true,
      loginTime: Date.now(),
      expiresAt: Date.now() + this.config.sessionDuration,
      userAgent: navigator.userAgent
    };
    
    sessionStorage.setItem('cinememo_session', JSON.stringify(session));
    appState.isAdmin = true;
  },

  /**
   * 检查会话是否有效
   */
  checkSession() {
    const sessionData = sessionStorage.getItem('cinememo_session');
    
    if (!sessionData) {
      return false;
    }
    
    try {
      const session = JSON.parse(sessionData);
      
      // 检查是否过期
      if (Date.now() > session.expiresAt) {
        this.logout();
        return false;
      }
      
      // 检查 User Agent（可选，提高安全性）
      if (session.userAgent !== navigator.userAgent) {
        console.warn('User Agent 不匹配，可能存在安全风险');
        // 这里可以选择登出或警告
      }
      
      appState.isAdmin = true;
      return true;
    } catch (e) {
      console.error('会话验证失败:', e);
      return false;
    }
  },

  /**
   * 登录
   */
  login(password) {
    if (this.verifyPassword(password)) {
      Utils.showToast('登录成功！', 'success');
      App.updateLoginStatus();
      return true;
    }
    return false;
  },

  /**
   * 登出
   */
  logout() {
    sessionStorage.removeItem('cinememo_session');
    appState.isAdmin = false;
    Utils.showToast('已退出登录', 'info');
    App.updateLoginStatus();
  },

  /**
   * 修改管理员密码
   */
  changePassword(oldPassword, newPassword) {
    // 验证旧密码
    if (oldPassword !== config.adminPassword) {
      Utils.showToast('原密码错误', 'error');
      return false;
    }
    
    // 检查新密码强度
    const strengthCheck = this.checkPasswordStrength(newPassword);
    if (!strengthCheck.isStrong) {
      Utils.showToast(`新密码不够安全：\n${strengthCheck.issues.join('\n')}`, 'error');
      return false;
    }
    
    // 更新密码
    config.adminPassword = newPassword;
    Utils.saveConfig();
    
    Utils.showToast('密码修改成功！', 'success');
    return true;
  },

  /**
   * 初始化认证模块
   */
  init() {
    // 检查是否已有有效会话
    this.checkSession();
    
    // 添加密码修改功能到设置页面
    this.addPasswordChangeForm();
  },

  /**
   * 在设置页面添加密码修改表单
   */
  addPasswordChangeForm() {
    const settingsSection = document.querySelector('.settings-section:last-child');
    if (!settingsSection) return;
    
    const passwordChangeHtml = `
      <div class="settings-section">
        <h3>🔐 修改密码</h3>
        <div id="password-change-form">
          <div class="form-group">
            <label>原密码</label>
            <input type="password" id="old-password" placeholder="输入原密码">
          </div>
          <div class="form-group">
            <label>新密码</label>
            <input type="password" id="new-password" placeholder="输入新密码">
            <div id="password-strength" class="password-strength"></div>
          </div>
          <div class="form-group">
            <label>确认新密码</label>
            <input type="password" id="confirm-password" placeholder="再次输入新密码">
          </div>
          <button class="btn-primary" onclick="Auth.handlePasswordChange()">修改密码</button>
          <p class="setting-tip">密码强度要求：至少 8 位，包含大小写字母、数字和特殊字符</p>
        </div>
      </div>
    `;
    
    settingsSection.insertAdjacentHTML('beforeend', passwordChangeHtml);
    
    // 添加密码强度显示
    const newPasswordInput = document.getElementById('new-password');
    if (newPasswordInput) {
      newPasswordInput.addEventListener('input', (e) => {
        const strength = this.checkPasswordStrength(e.target.value);
        this.updatePasswordStrengthUI(strength);
      });
    }
  },

  /**
   * 更新密码强度 UI
   */
  updatePasswordStrengthUI(strength) {
    const strengthDiv = document.getElementById('password-strength');
    if (!strengthDiv) return;
    
    const color = strength.score >= 80 ? 'var(--success)' : 
                  strength.score >= 50 ? 'var(--accent)' : 'var(--danger)';
    
    strengthDiv.innerHTML = `
      <div class="strength-bar">
        <div class="strength-fill" style="width: ${strength.score}%; background: ${color};"></div>
      </div>
      <span style="font-size: 12px; color: ${color};">
        ${strength.score >= 80 ? '强' : strength.score >= 50 ? '中等' : '弱'}
      </span>
    `;
  },

  /**
   * 处理密码修改
   */
  handlePasswordChange() {
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!oldPassword || !newPassword || !confirmPassword) {
      Utils.showToast('请填写所有字段', 'error');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      Utils.showToast('两次输入的新密码不一致', 'error');
      return;
    }
    
    if (this.changePassword(oldPassword, newPassword)) {
      // 清空表单
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
      document.getElementById('password-strength').innerHTML = '';
    }
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.Auth = Auth;
}
