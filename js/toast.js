/**
 * Toast 提示系统
 * 提供操作反馈、错误提示、状态通知等功能
 */

const Toast = {
  // Toast 配置
  config: {
    duration: 3000,        // 显示时长（毫秒）
    maxCount: 5,           // 最大同时显示数量
    position: 'top-right', // 显示位置：top-right, top-center, top-left, bottom-right, bottom-center, bottom-left
    animation: true        // 是否启用动画
  },
  
  // Toast 队列
  queue: [],
  activeToasts: [],
  
  /**
   * 显示 Toast 提示
   * @param {string} message - 提示消息
   * @param {string} type - 类型：success, error, warning, info
   * @param {object} options - 额外选项
   */
  show(message, type = 'info', options = {}) {
    const toast = {
      id: Date.now() + Math.random(),
      message,
      type,
      action: options.action || null,
      onAction: options.onAction || null,
      onDismiss: options.onDismiss || null,
      duration: options.duration || this.config.duration
    };
    
    this.queue.push(toast);
    this.processQueue();
    return toast.id;
  },
  
  /**
   * 处理队列
   */
  processQueue() {
    if (this.activeToasts.length >= this.config.maxCount) return;
    if (this.queue.length === 0) return;
    
    const toast = this.queue.shift();
    this.createToast(toast);
  },
  
  /**
   * 创建 Toast 元素
   * @param {object} toast - Toast 对象
   */
  createToast(toast) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${toast.type}`;
    toastEl.dataset.id = toast.id;
    
    // 获取图标
    const icon = this.getIcon(toast.type);
    
    // 设置内容
    const actionHtml = toast.action
      ? `<button class="toast-action" data-toast-id="${toast.id}">${toast.action}</button>`
      : '';

    toastEl.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${toast.message}</span>
      ${actionHtml}
      <button class="toast-close" onclick="Toast.dismiss('${toast.id}')">&times;</button>
    `;

    if (toast.action && toast.onAction) {
      const actionBtn = toastEl.querySelector('.toast-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          toast.onAction();
          this.dismiss(toast.id);
        });
      }
    }
    
    // 添加动画类
    if (this.config.animation) {
      requestAnimationFrame(() => {
        toastEl.classList.add('toast-show');
      });
    }
    
    container.appendChild(toastEl);
    this.activeToasts.push(toast);
    
    // 自动消失
    const duration = toast.duration;
    setTimeout(() => {
      this.dismiss(toast.id);
    }, duration);
  },
  
  /**
   * 获取图标
   * @param {string} type - 类型
   * @returns {string} 图标
   */
  getIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: '💡'
    };
    return icons[type] || icons.info;
  },
  
  /**
   * 关闭 Toast
   * @param {string} id - Toast ID
   */
  dismiss(id) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastEl = container.querySelector(`[data-id="${id}"]`);
    if (!toastEl) return;

    const activeToast = this.activeToasts.find(t => t.id == id);

    toastEl.classList.add('toast-hide');

    setTimeout(() => {
      toastEl.remove();
      this.activeToasts = this.activeToasts.filter(t => t.id != id);
      if (activeToast && activeToast.onDismiss) {
        activeToast.onDismiss();
      }
      this.processQueue();
    }, 300);
  },
  
  /**
   * 关闭所有 Toast
   */
  dismissAll() {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach((toast, index) => {
      setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
      }, index * 50);
    });
    
    this.activeToasts = [];
    this.queue = [];
  },
  
  /**
   * 成功提示
   * @param {string} message - 消息
   * @param {object} options - 额外选项
   */
  success(message, options = {}) {
    return this.show(message, 'success', options);
  },
  
  /**
   * 错误提示
   * @param {string} message - 消息
   * @param {object} options - 额外选项
   */
  error(message, options = {}) {
    return this.show(message, 'error', { duration: 5000, ...options });
  },
  
  /**
   * 警告提示
   * @param {string} message - 消息
   * @param {object} options - 额外选项
   */
  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  },
  
  /**
   * 信息提示
   * @param {string} message - 消息
   * @param {object} options - 额外选项
   */
  info(message, options = {}) {
    return this.show(message, 'info', options);
  }
};

// 全局导出
window.Toast = Toast;

// 便捷函数
window.toast = {
  success: (msg, opts) => Toast.success(msg, opts),
  error: (msg, opts) => Toast.error(msg, opts),
  warning: (msg, opts) => Toast.warning(msg, opts),
  info: (msg, opts) => Toast.info(msg, opts),
  show: (msg, type, opts) => Toast.show(msg, type, opts),
  dismiss: (id) => Toast.dismiss(id),
  dismissAll: () => Toast.dismissAll()
};
