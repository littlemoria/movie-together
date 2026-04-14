const LazyLoad = {
  observer: null,
  loadedImages: new Set(),
  config: {
    rootMargin: '50px',
    threshold: 0.1,
    placeholderClass: 'lazy-placeholder',
    loadedClass: 'lazy-loaded',
    errorClass: 'lazy-error'
  },

  init() {
    if ('IntersectionObserver' in window) {
      const self = this;
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            self.loadImage(entry.target);
          }
        });
      }, {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold
      });
    }
  },

  observe(img) {
    if (this.observer) {
      this.observer.observe(img);
    } else {
      this.loadImage(img);
    }
  },

  unobserve(img) {
    if (this.observer) {
      this.observer.unobserve(img);
    }
  },

  loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;

    img.classList.add('lazy-loading');

    const tempImg = new Image();
    
    tempImg.onload = () => {
      img.src = src;
      img.classList.remove('lazy-loading');
      img.classList.add(this.config.loadedClass);
      img.removeAttribute('data-src');
      this.loadedImages.add(src);
      this.unobserve(img);
    };

    tempImg.onerror = () => {
      img.classList.remove('lazy-loading');
      img.classList.add(this.config.errorClass);
      // 保持占位符 SVG 以维持尺寸
      img.style.background = 'linear-gradient(135deg, #6C5CE7, #a29bfe)';
      img.style.display = 'flex';
      img.style.alignItems = 'center';
      img.style.justifyContent = 'center';
      img.style.fontSize = '20px';
      img.style.color = '#fff';
      img.style.position = 'relative';
      // 使用伪元素显示图标
      img.insertAdjacentHTML('beforeend', '<span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">🎬</span>');
      this.unobserve(img);
    };

    tempImg.src = src;
  },

  getPosterHtml(movie, large = false) {
    const baseUrl = large ? Config.TMDB_IMAGE_BASE_LG : Config.TMDB_IMAGE_BASE;
    const className = large ? 'movie-detail-poster' : 'movie-card-poster';
    
    if (movie.poster_path) {
      const src = `${baseUrl}${movie.poster_path}`;
      const placeholder = this.getPlaceholderSvg();
      
      return `<img class="${className} lazy-image" 
        src="${placeholder}" 
        data-src="${src}" 
        alt="${movie.movie_name}"
        onerror="this.onerror=null; LazyLoad.handleImageError(this)">`;
    }
    
    return `<div class="${className}" style="background: linear-gradient(135deg, #6C5CE7, #a29bfe); display: flex; align-items: center; justify-content: center; font-size: ${large ? '60px' : '30px'};">🎬</div>`;
  },

  getPlaceholderSvg() {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="120" viewBox="0 0 1 1"%3E%3Crect fill="%23E8E8E8" width="1" height="1"/%3E%3C/svg%3E';
  },

  handleImageError(img) {
    img.classList.remove('lazy-loading');
    img.classList.add(this.config.errorClass);
    // 保持占位符 SVG 以维持尺寸
    img.style.background = 'linear-gradient(135deg, #6C5CE7, #a29bfe)';
    img.style.display = 'flex';
    img.style.alignItems = 'center';
    img.style.justifyContent = 'center';
    img.style.fontSize = '20px';
    img.style.color = '#fff';
    // 覆盖图片内容
    img.style.content = '';
    img.style.position = 'relative';
    // 使用伪元素显示图标
    img.insertAdjacentHTML('beforeend', '<span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">🎬</span>');
    this.unobserve(img);
  },

  observeAll() {
    document.querySelectorAll('.lazy-image[data-src]').forEach(img => {
      this.observe(img);
      // 强制加载可见的图片
      if (this.isElementVisible(img)) {
        this.loadImage(img);
      }
    });
  },

  refresh() {
    this.observeAll();
  },

  isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  },

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.loadedImages.clear();
  }
};

window.LazyLoad = LazyLoad;
