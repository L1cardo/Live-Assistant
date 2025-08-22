class LiveAssistant {
  constructor() {
    this.platforms = {
      douyu: {
        name: '斗鱼',
        color: '#ff6c00',
        icon: 'https://www.douyu.com/favicon.ico'
      },
      huya: {
        name: '虎牙',
        color: '#ff7700',
        icon: 'https://www.huya.com/favicon.ico'
      },
      bilibili: {
        name: 'B站',
        color: '#00a1d6',
        icon: 'https://www.bilibili.com/favicon.ico'
      },
      douyin: {
        name: '抖音',
        color: '#fe2c55',
        icon: 'https://www.douyin.com/favicon.ico'
      },
      twitch: {
        name: 'Twitch',
        color: '#9146ff',
        icon: 'https://www.twitch.tv/favicon.ico'
      }
    };

    this.platformOrder = Object.keys(this.platforms);
    this.enabledPlatforms = Object.keys(this.platforms); // 默认所有平台都启用
    this.init();
  }

  async init() {
    // 先加载缓存数据
    await this.loadCachedData();
    // 然后异步加载最新数据
    this.loadFollowedStreamers(true);
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadFollowedStreamers();
    });
    
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.toggleSettings();
    });
    
    document.getElementById('applySettingsBtn').addEventListener('click', () => {
      this.applySettings();
    });
  }

  async loadFollowedStreamers(isBackgroundUpdate = false) {
    const content = document.getElementById('content');
    
    // 如果不是后台更新，显示加载状态
    if (!isBackgroundUpdate) {
      content.innerHTML = '<div class="loading">正在加载关注列表...</div>';
    }
    
    try {
      console.log('开始获取关注列表...');
      // 获取所有平台数据
      const followedData = await this.getFollowedStreamers();
      console.log('获取到的数据:', followedData);
      
      // 缓存数据
      await this.cacheData(followedData);
      
      this.renderStreamers(followedData);
    } catch (error) {
      console.error('加载失败:', error);
      if (!isBackgroundUpdate) {
        content.innerHTML = '<div class="empty">加载失败，请稍后重试<br>请检查控制台查看详细错误信息</div>';
      }
    }
  }

  async getFollowedStreamers() {
    const results = {};

    // 并行获取各平台数据
    const promises = Object.keys(this.platforms).map(async (platform) => {
      try {
        const data = await this.getPlatformData(platform);
        results[platform] = data;
      } catch (error) {
        console.error(`获取${platform}数据失败:`, error);
        results[platform] = {
          data: [],
          isLoggedIn: false,
          loginUrl: `https://www.${platform}.com`
        };
      }
    });

    await Promise.all(promises);
    return results;
  }

  async getPlatformData(platform) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getFollowedStreamers', platform },
        (response) => {
          resolve({
            data: response?.data || [],
            isLoggedIn: response?.isLoggedIn !== false,
            loginUrl: response?.loginUrl
          });
        }
      );
    });
  }

  // 缓存数据到本地存储
  async cacheData(data) {
    try {
      await chrome.storage.local.set({ cachedStreamers: data, cachedTimestamp: Date.now() });
    } catch (error) {
      console.error('缓存数据失败:', error);
    }
  }

  // 从本地存储加载缓存数据
  async loadCachedData() {
    try {
      const result = await chrome.storage.local.get(['cachedStreamers', 'cachedTimestamp', 'platformOrder', 'enabledPlatforms']);
      if (result.cachedStreamers) {
        // 如果有自定义平台顺序，则使用它
        if (result.platformOrder) {
          this.platformOrder = result.platformOrder;
        }
        // 如果有启用的平台设置，则使用它
        if (result.enabledPlatforms) {
          this.enabledPlatforms = result.enabledPlatforms;
        }
        // 显示缓存数据
        this.renderStreamers(result.cachedStreamers);
        console.log('已加载缓存数据');
        return result.cachedStreamers;
      }
    } catch (error) {
      console.error('加载缓存数据失败:', error);
    }
    return null;
  }

  renderStreamers(followedData) {
    const content = document.getElementById('content');
    let html = '';

    // 按照自定义顺序显示平台，只显示启用的平台
    this.platformOrder.forEach(platformKey => {
      // 检查平台是否启用
      if (!this.enabledPlatforms.includes(platformKey)) {
        return; // 跳过未启用的平台
      }
      
      const platformInfo = this.platforms[platformKey];
      const platformData = followedData[platformKey];
      
      // 计算正在直播的主播数量
      const liveStreamers = platformData?.data ? platformData.data.filter(streamer => streamer.isLive) : [];

      html += `
        <div class="platform-section">
          <div class="platform-title">
            <img class="platform-icon" src="${platformInfo.icon}" alt="${platformInfo.name}">
            <span class="platform-name">${platformInfo.name}</span>
            <span class="live-count">${liveStreamers.length} 位主播正在直播</span>
          </div>
      `;

      if (!platformData || !platformData.isLoggedIn) {
        // 未登录状态
        html += `
          <div class="login-prompt">
            <div class="login-message">请先登录 ${platformInfo.name} 来获取关注列表</div>
            <button class="login-btn" data-url="${platformData?.loginUrl || `https://www.${platformKey}.com`}">
              前往登录
            </button>
          </div>
        `;
      } else if (platformData.data && platformData.data.length > 0) {
        // 有数据，只显示正在直播的主播
        if (liveStreamers.length > 0) {
          html += `
            <ul class="streamer-list">
          `;

          const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiNlMGUwZTAiLz4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxMiIgcj0iNSIgZmlsbD0iIzk5OTk5OSIvPgo8cGF0aCBkPSJNNiAyNmMwLTUuNSA0LjUtMTAgMTAtMTBzMTAgNC41IDEwIDEwIiBmaWxsPSIjOTk5OTk5Ii8+Cjwvc3ZnPg==';

          liveStreamers.forEach(streamer => {
            console.log('渲染主播:', streamer.name, '头像URL:', streamer.avatar);

            html += `
              <li class="streamer-item live" data-url="${streamer.url}">
                <img class="streamer-avatar" src="${streamer.avatar || defaultAvatar}" alt="${streamer.name}" data-default="${defaultAvatar}" data-original="${streamer.avatar}">
                <div class="streamer-info">
                  <div class="streamer-name">${streamer.name}</div>
                  <div class="streamer-title">
                    ${streamer.title || '直播中...'}
                  </div>
                  <div class="streamer-stats">
                    ${this.getViewerStats(streamer)}
                    ${streamer.platform !== 'bilibili' && streamer.platform !== 'douyu' ? `<span class="stat-item"><span class="icon">❤️</span>${this.formatNumber(streamer.followers || 0)} 粉丝</span>` : ''}
                    ${streamer.startTime ? `<span class="stat-item"><span class="icon">⏰</span>${this.formatStartTime(streamer.startTime)}</span>` : ''}
                  </div>
                </div>
              </li>
            `;
          });

          html += '</ul>';
        } else {
          html += '<div class="no-live">暂无正在直播的主播</div>';
        }
      } else {
        // 已登录但没有关注的主播
        html += '<div class="no-follow">还没有关注任何主播</div>';
      }

      html += '</div>';
    });

    content.innerHTML = html;

    // 绑定点击事件
    document.querySelectorAll('.streamer-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });

    // 绑定登录按钮点击事件
    document.querySelectorAll('.login-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });

    // 绑定头像错误处理事件
    document.querySelectorAll('.streamer-avatar').forEach(img => {
      img.addEventListener('error', () => {
        const defaultAvatar = img.dataset.default;
        const originalUrl = img.dataset.original;
        console.error('头像加载失败:', originalUrl);
        if (defaultAvatar && img.src !== defaultAvatar) {
          img.src = defaultAvatar;
        }
      });

      img.addEventListener('load', () => {
        console.log('头像加载成功:', img.src);
      });
    });

    // 绑定平台图标错误处理事件
    document.querySelectorAll('.platform-icon').forEach(img => {
      img.addEventListener('error', () => {
        console.error('平台图标加载失败:', img.src);
        img.style.display = 'none';
      });
    });
  }
  
  // 格式化数字显示
  formatNumber(num) {
    if (!num) return '0';
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }
  
  // 获取观看数据统计
  getViewerStats(streamer) {
    console.log('获取观看统计:', streamer.platform, '观看人数/热度:', streamer.viewers, '类型:', typeof streamer.viewers);
    
    if (streamer.platform === 'douyu' || streamer.platform === 'huya') {
      // 斗鱼和虎牙的viewers字段实际是热度，强制显示
      const heat = streamer.viewers || 0;
      return `<span class="stat-item"><span class="icon">🔥</span>${this.formatNumber(heat)} 热度</span>`;
    } else {
      // 其他平台显示观看人数
      const viewers = streamer.viewers || 0;
      return viewers > 0 ? `<span class="stat-item"><span class="icon">👥</span>${this.formatNumber(viewers)} 观看</span>` : '';
    }
  }
  
  // 格式化开播时间显示（显示已开播时长）
  formatStartTime(timeStr) {
    if (!timeStr) return '';
    
    try {
      // 处理不同的时间格式
      let time;
      if (typeof timeStr === 'string') {
        // 如果是时间戳字符串，转换为数字
        if (/^\d+$/.test(timeStr)) {
          time = new Date(parseInt(timeStr) * 1000); // 假设是秒级时间戳
        } else {
          time = new Date(timeStr);
        }
      } else if (typeof timeStr === 'number') {
        // 如果是数字，判断是秒还是毫秒
        time = timeStr > 1000000000000 ? new Date(timeStr) : new Date(timeStr * 1000);
      } else {
        return '';
      }
      
      const now = new Date();
      const diff = now - time;
      
      // 计算开播时长
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diff < 0) {
        return '即将开始';
      } else if (hours > 0) {
        return `已播 ${hours}小时${minutes}分钟`;
      } else if (minutes > 0) {
        return `已播 ${minutes}分钟`;
      } else {
        return '刚开始';
      }
    } catch (error) {
      console.error('时间格式化错误:', error, timeStr);
      return '';
    }
  }
  
  // 格式化时间显示（保留原方法作为备用）
  formatTime(timeStr) {
    if (!timeStr) return '';
    
    try {
      const time = new Date(timeStr);
      const now = new Date();
      const diff = now - time;
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
      } else if (minutes > 0) {
        return `${minutes}分钟`;
      } else {
        return '刚开始';
      }
    } catch (error) {
      return timeStr;
    }
  }
  
  // 切换设置面板显示
  toggleSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBtn = document.getElementById('settingsBtn');
    const contentDiv = document.getElementById('content');
    const refreshBtn = document.getElementById('refreshBtn');
    
    // 切换显示状态
    if (settingsPanel.style.display === 'none' || settingsPanel.style.display === '') {
      // 显示设置面板
      settingsPanel.style.display = 'block';
      contentDiv.style.display = 'none';
      settingsBtn.textContent = '返回';
      refreshBtn.style.display = 'none'; // 隐藏刷新按钮
      // 立即渲染设置项
      this.renderSettings();
    } else {
      // 隐藏设置面板，显示主要内容
      settingsPanel.style.display = 'none';
      contentDiv.style.display = 'block';
      settingsBtn.textContent = '设置';
      refreshBtn.style.display = 'inline-block'; // 显示刷新按钮
    }
  }
  
  // 渲染设置面板中的平台列表
  renderSettings() {
    const sortable = document.getElementById('platformSortable');
    sortable.innerHTML = '';
    
    // 按当前顺序渲染平台项
    this.platformOrder.forEach(platformKey => {
      if (this.platforms[platformKey]) {
        const platform = this.platforms[platformKey];
        const item = document.createElement('li');
        item.className = 'platform-item';
        item.setAttribute('data-platform', platformKey);
        item.draggable = true;
        item.innerHTML = `
          <div class="drag-handle">≡</div>
          <img class="platform-icon" src="${platform.icon}" alt="${platform.name}">
          <span class="platform-name">${platform.name}</span>
          <label class="platform-switch">
            <input type="checkbox" ${this.enabledPlatforms.includes(platformKey) ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        `;
        sortable.appendChild(item);
      }
    });
    
    // 添加拖拽事件监听器
    this.setupDragAndDrop();
    
    // 为开关添加事件监听器
    this.setupSwitchListeners();
  }
  
  // 为平台开关添加事件监听器
  setupSwitchListeners() {
    const switchInputs = document.querySelectorAll('.platform-switch input');
    switchInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const platformKey = e.target.closest('.platform-item').getAttribute('data-platform');
        const isChecked = e.target.checked;
        
        if (isChecked) {
          // 添加到启用列表
          if (!this.enabledPlatforms.includes(platformKey)) {
            this.enabledPlatforms.push(platformKey);
          }
        } else {
          // 从启用列表移除
          this.enabledPlatforms = this.enabledPlatforms.filter(p => p !== platformKey);
        }
      });
    });
  }
  
  // 设置拖拽功能
  setupDragAndDrop() {
    const sortable = document.getElementById('platformSortable');
    let draggedItem = null;

    sortable.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('platform-item')) {
        draggedItem = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    sortable.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('platform-item')) {
        e.target.classList.remove('dragging');
        draggedItem = null;
      }
    });

    sortable.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(sortable, e.clientY);
      const draggable = document.querySelector('.dragging');
      
      if (afterElement == null) {
        sortable.appendChild(draggable);
      } else {
        sortable.insertBefore(draggable, afterElement);
      }
    });

    sortable.addEventListener('drop', (e) => {
      e.preventDefault();
    });
  }
  
  // 获取拖拽位置
  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.platform-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
  
  // 应用设置
  applySettings() {
    const platformItems = document.querySelectorAll('.platform-item');
    const newOrder = Array.from(platformItems).map(item => 
      item.getAttribute('data-platform')
    );
    
    // 更新平台顺序
    this.platformOrder = newOrder;
    
    // 保存到本地存储
    chrome.storage.local.set({ 
      platformOrder: newOrder,
      enabledPlatforms: this.enabledPlatforms
    });
    
    // 重新渲染主界面
    this.loadFollowedStreamers();
    
    // 显示页面内提示信息
    this.showMessage('设置已保存！');
  }
  
  // 显示页面内提示信息
  showMessage(message) {
    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
      messageContainer.textContent = message;
      messageContainer.style.display = 'block';
      
      // 3秒后自动隐藏
      setTimeout(() => {
        messageContainer.style.display = 'none';
      }, 1000);
    }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new LiveAssistant();
});
