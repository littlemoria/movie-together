const Offline = {
  isOnline: navigator.onLine,
  listeners: [],
  
  init() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    if (!navigator.onLine) {
      this.showOfflineBanner();
    }
  },
  
  handleOnline() {
    this.isOnline = true;
    console.log('[Offline] Back online');
    this.hideOfflineBanner();
    this.notifyListeners(true);
    Utils.showToast('网络已恢复', 'success');
  },
  
  handleOffline() {
    this.isOnline = false;
    console.log('[Offline] Gone offline');
    this.showOfflineBanner();
    this.notifyListeners(false);
    Utils.showToast('网络已断开，部分功能可能不可用', 'error');
  },
  
  showOfflineBanner() {
    let banner = document.getElementById('offline-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.innerHTML = `
        <span class="offline-icon">📡</span>
        <span class="offline-text">离线模式 - 部分功能可能不可用</span>
        <button class="offline-close" onclick="Offline.hideOfflineBanner()">×</button>
      `;
      document.body.appendChild(banner);
    }
    banner.classList.add('active');
  },
  
  hideOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) {
      banner.classList.remove('active');
    }
  },
  
  onStatusChange(callback) {
    this.listeners.push(callback);
  },
  
  notifyListeners(isOnline) {
    this.listeners.forEach(callback => {
      try {
        callback(isOnline);
      } catch (e) {
        console.error('[Offline] Listener error:', e);
      }
    });
  },
  
  async checkConnectivity() {
    if (!navigator.onLine) {
      return false;
    }
    
    try {
      const response = await fetch('https://www.google.com/favicon.ico', {
        mode: 'no-cors',
        cache: 'no-store'
      });
      return true;
    } catch {
      return false;
    }
  }
};

window.Offline = Offline;
