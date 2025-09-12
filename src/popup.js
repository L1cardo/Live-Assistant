class LiveAssistant {
  constructor() {
    this.platforms = {
      douyu: {
        name: "斗鱼",
        color: "#ff6c00",
        icon: "https://www.douyu.com/favicon.ico",
      },
      huya: {
        name: "虎牙",
        color: "#ff7700",
        icon: "https://www.huya.com/favicon.ico",
      },
      bilibili: {
        name: "B站",
        color: "#00a1d6",
        icon: "https://www.bilibili.com/favicon.ico",
      },
      douyin: {
        name: "抖音",
        color: "#fe2c55",
        icon: "https://www.douyin.com/favicon.ico",
      },
      twitch: {
        name: "Twitch",
        color: "#9146ff",
        icon: "https://www.twitch.tv/favicon.ico",
      },
    };

    this.platformOrder = Object.keys(this.platforms);
    this.enabledPlatforms = Object.keys(this.platforms); // 默认所有平台都启用
    this.floatingButtonsVisible = true; // 默认悬浮按钮可见
    this.floatingButtonsCollapsed = false; // 默认悬浮按钮不折叠
    this.favoriteStreamers = new Set(); // 收藏的主播集合
    this.init();
  }

  async init() {
    // 先加载收藏状态
    await this.loadFavorites();
    // 再加载缓存数据
    await this.loadCachedData();
    // 然后异步加载最新数据
    this.loadFollowedStreamers(true);
    this.bindEvents();

    // 获取并显示版本号
    this.displayVersion();
  }

  // 获取并显示版本号
  displayVersion() {
    try {
      const manifest = chrome.runtime.getManifest();
      const version = manifest.version;
      const versionElement = document.getElementById("version");
      if (versionElement) {
        versionElement.textContent = `版本: v${version}`;
      }
    } catch (error) {
      console.error("获取版本号失败:", error);
    }
  }

  bindEvents() {
    document.getElementById("refreshBtn").addEventListener("click", (event) => {
      // 显示加载动画并执行后台刷新
      this.showRefreshLoading();

      // 立即执行后台刷新
      this.refreshInBackground();
    });

    document.getElementById("settingsBtn").addEventListener("click", () => {
      this.toggleSettings();
    });

    document.getElementById("applySettingsBtn").addEventListener("click", () => {
      this.applySettings();
    });

    document.getElementById("resetSettingsBtn").addEventListener("click", () => {
      this.resetSettings();
    });
  }

  async loadFollowedStreamers(isBackgroundUpdate = false) {
    const content = document.getElementById("content");

    try {
      console.log("开始获取关注列表...");
      // 获取所有平台数据
      const followedData = await this.getFollowedStreamers();
      console.log("获取到的数据:", followedData);

      // 缓存数据
      await this.cacheData(followedData);

      this.renderStreamers(followedData);
    } catch (error) {
      console.error("加载失败:", error);
      if (!isBackgroundUpdate) {
        content.innerHTML = '<div class="empty">刷新失败，请稍后重试<br>请检查控制台查看详细错误信息</div>';
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
          loginUrl: `https://www.${platform}.com`,
        };
      }
    });

    await Promise.all(promises);
    return results;
  }

  async getPlatformData(platform) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getFollowedStreamers", platform }, (response) => {
        resolve({
          data: response?.data || [],
          isLoggedIn: response?.isLoggedIn !== false,
          loginUrl: response?.loginUrl,
        });
      });
    });
  }

  // 缓存数据到本地存储
  async cacheData(data) {
    try {
      await chrome.storage.local.set({ cachedStreamers: data, cachedTimestamp: Date.now() });
    } catch (error) {
      console.error("缓存数据失败:", error);
    }
  }

  // 从本地存储加载缓存数据
  async loadCachedData() {
    try {
      const result = await chrome.storage.local.get(["cachedStreamers", "cachedTimestamp", "platformOrder", "enabledPlatforms", "floatingButtonsVisible", "floatingButtonsCollapsed"]);
      if (result.cachedStreamers) {
        // 如果有自定义平台顺序，则使用它
        if (result.platformOrder) {
          this.platformOrder = result.platformOrder;
        }
        // 如果有启用的平台设置，则使用它
        if (result.enabledPlatforms) {
          this.enabledPlatforms = result.enabledPlatforms;
        }
        // 如果有悬浮按钮显示设置，则使用它
        if (result.floatingButtonsVisible !== undefined) {
          this.floatingButtonsVisible = result.floatingButtonsVisible;
        }
        // 如果有悬浮按钮折叠状态设置，则使用它
        if (result.floatingButtonsCollapsed !== undefined) {
          this.floatingButtonsCollapsed = result.floatingButtonsCollapsed;
        }
        // 显示缓存数据
        this.renderStreamers(result.cachedStreamers);
        console.log("已加载缓存数据");
        return result.cachedStreamers;
      }
    } catch (error) {
      console.error("加载缓存数据失败:", error);
    }
    return null;
  }

  renderStreamers(followedData) {
    const content = document.getElementById("content");
    let html = "";

    // 按照自定义顺序显示平台，只显示启用的平台
    this.platformOrder.forEach((platformKey) => {
      // 检查平台是否启用
      if (!this.enabledPlatforms.includes(platformKey)) {
        return; // 跳过未启用的平台
      }

      const platformInfo = this.platforms[platformKey];
      // 安全检查：确保 platformInfo 存在
      if (!platformInfo) {
        console.warn(`跳过无效的平台配置: ${platformKey}`, platformInfo);
        return;
      }

      const platformData = followedData[platformKey];

      // 计算正在直播的主播数量
      const liveStreamers = platformData?.data ? platformData.data.filter((streamer) => streamer.isLive) : [];

      // 先对主播进行排序，收藏的主播排在前面
      const sortedLiveStreamers = this.sortFavoritesFirst(liveStreamers);

      html += `
        <div class="platform-section" id="platform-${platformKey}">
          <div class="platform-title">
            <div class="platform-header" data-url="https://www.${platformKey}.com">
              <img class="platform-icon" src="${platformInfo.icon}" alt="${platformInfo.name}">
              <span class="platform-name">${platformInfo.name}</span>
            </div>
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

          const defaultAvatar = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiNlMGUwZTAiLz4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxMiIgcj0iNSIgZmlsbD0iIzk5OTk5OSIvPgo8cGF0aCBkPSJNNiAyNmMwLTUuNSA0LjUtMTAgMTAtMTBzMTAgNC41IDEwIDEwIiBmaWxsPSIjOTk5OTk5Ii8+Cjwvc3ZnPg==";

          sortedLiveStreamers.forEach((streamer) => {
            // 对于斗鱼和虎牙平台，添加缩略图显示
            let thumbnailHtml = "";
            if (streamer.thumbnail) {
              thumbnailHtml = `
                <img class="streamer-thumbnail" src="${streamer.thumbnail}" alt="${streamer.name} 缩略图">
              `;
            }

            // 生成收藏按钮HTML
            const isFavorite = this.isFavorite(streamer);
            const favoriteIcon = isFavorite ? "★" : "☆";
            const favoriteClass = isFavorite ? "favorite-button favorited" : "favorite-button not-favorited";

            html += `
              <li class="streamer-item live" data-url="${streamer.url}" data-streamer-id="${streamer.id || streamer.name}">
                ${thumbnailHtml}
                <div class="streamer-content">
                  <div class="streamer-info">
                    <img class="streamer-avatar" src="${streamer.avatar || defaultAvatar}" alt="${streamer.name}" data-default="${defaultAvatar}" data-original="${streamer.avatar}">
                    <div class="streamer-basic-info">
                      <div class="streamer-name-container">
                        <span class="streamer-name">${streamer.name}</span>
                        <span class="game-name">${streamer.gameName}</span>
                      </div>
                        <div class="streamer-title-container">
                          <span class="streamer-title">${streamer.title || "直播中..."}</span>
                          <button class="${favoriteClass}" data-streamer-id="${streamer.id || streamer.name}">
                            ${favoriteIcon}
                          </button>
                        </div>
                    </div>
                  </div>
                  <div class="streamer-stats">
                    ${this.getViewerStats(streamer)}
                    ${streamer.platform === "huya" ? `<span class="stat-item"><span class="icon">❤️</span>${this.formatNumber(streamer.followers)}</span>` : ""}
                    ${streamer.liveTime ? `<span class="stat-item"><span class="icon">⏰</span>${this.formatTime(streamer.liveTime)}</span>` : ""}
                    ${streamer.startTime ? `<span class="stat-item"><span class="icon">⏰</span>${this.formatTime(streamer.startTime)}</span>` : ""}
                  </div>
                </div>
              </li>
            `;
          });

          html += "</ul>";
        } else {
          html += '<div class="no-live">暂无正在直播的主播</div>';
        }
      } else {
        // 已登录但没有关注的主播
        html += '<div class="no-follow">还没有关注任何主播</div>';
      }

      html += "</div>";
    });

    content.innerHTML = html;

    // 创建悬浮按钮
    this.createFloatingButtons();

    // 绑定点击事件
    document.querySelectorAll(".streamer-item").forEach((item) => {
      item.addEventListener("click", () => {
        const url = item.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });

    // 绑定收藏按钮点击事件
    document.querySelectorAll(".favorite-button").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation(); // 防止事件冒泡

        // 获取父级streamer-item元素
        const streamerItem = button.closest(".streamer-item");
        if (streamerItem) {
          // 从streamer-item中提取数据
          const streamerId = streamerItem.dataset.streamerId;
          const streamerName = button.dataset.streamerName || streamerId;

          // 创建streamer对象
          const streamer = {
            id: streamerId,
            name: streamerName,
          };

          this.toggleFavorite(streamer);
        }
      });
    });

    // 绑定登录按钮点击事件
    document.querySelectorAll(".login-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });

    // 绑定头像错误处理事件
    document.querySelectorAll(".streamer-avatar").forEach((img) => {
      img.addEventListener("error", () => {
        const defaultAvatar = img.dataset.default;
        const originalUrl = img.dataset.original;
        console.error("头像加载失败:", originalUrl);
        if (defaultAvatar && img.src !== defaultAvatar) {
          img.src = defaultAvatar;
        }
      });
    });

    // 绑定平台图标错误处理事件
    document.querySelectorAll(".platform-icon").forEach((img) => {
      img.addEventListener("error", () => {
        console.error("平台图标加载失败:", img.src);
        img.style.display = "none";
      });
    });

    // 绑定平台标题点击事件
    document.querySelectorAll(".platform-header").forEach((header) => {
      header.addEventListener("click", () => {
        const url = header.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  // 创建悬浮按钮
  createFloatingButtons() {
    // 移除已存在的浮动按钮容器
    const existingContainer = document.querySelector(".floating-buttons-container");
    if (existingContainer) {
      existingContainer.remove();
    }

    // 创建浮动按钮容器
    const container = document.createElement("div");
    container.className = "floating-buttons-container";

    // 创建浮动按钮容器
    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "floating-buttons";

    // 按照用户自定义的平台顺序创建按钮
    this.platformOrder.forEach((platformKey) => {
      // 检查该平台是否被启用
      if (!this.enabledPlatforms.includes(platformKey)) {
        return; // 跳过未启用的平台
      }

      const platformInfo = this.platforms[platformKey];
      // 安全检查：确保 platformInfo 存在且包含 icon 属性
      if (!platformInfo || !platformInfo.icon) {
        console.warn(`跳过无效的平台配置: ${platformKey}`, platformInfo);
        return;
      }

      const button = document.createElement("button");
      button.className = "floating-button";
      button.title = platformInfo.name;
      button.dataset.platform = platformKey;

      // 创建图标
      const icon = document.createElement("img");
      icon.className = "floating-button-icon";
      // 为B站添加特殊类名
      if (platformKey === "bilibili") {
        icon.classList.add("bilibili-icon");
      }
      icon.src = platformInfo.icon;
      icon.alt = platformInfo.name;

      // 创建标签
      const label = document.createElement("span");
      label.className = "floating-button-label";
      label.textContent = platformInfo.name;

      // 添加点击事件
      button.addEventListener("click", () => {
        this.scrollToPlatform(platformKey);
      });

      button.appendChild(icon);
      button.appendChild(label);
      buttonsContainer.appendChild(button);
    });

    // 添加返回顶部按钮
    const topButton = document.createElement("button");
    topButton.className = "top-button";
    topButton.title = "返回顶部";

    // 创建返回顶部图标
    const topIcon = document.createElement("img");
    topIcon.className = "top-button-icon";
    topIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7 14l5-5 5 5z"/></svg>';
    topIcon.alt = "返回顶部";

    // 添加返回顶部点击事件
    topButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    topButton.appendChild(topIcon);
    buttonsContainer.appendChild(topButton);

    // 添加折叠按钮
    const collapseButton = document.createElement("button");
    collapseButton.className = "collapse-button";
    collapseButton.title = this.floatingButtonsCollapsed ? "展开悬浮按钮" : "折叠悬浮按钮";

    // 创建折叠按钮图标
    const collapseIcon = document.createElement("img");
    collapseIcon.className = "collapse-button-icon";
    // 根据保存的状态设置初始图标
    if (this.floatingButtonsCollapsed) {
      // 折叠状态 - 显示上箭头
      collapseIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7 14l5-5 5 5z"/></svg>';
    } else {
      // 展开状态 - 显示下箭头
      collapseIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7 10l5 5 5-5z"/></svg>';
    }
    collapseIcon.alt = "折叠按钮";

    // 添加折叠按钮点击事件
    collapseButton.addEventListener("click", () => {
      this.toggleFloatingButtons();
    });

    collapseButton.appendChild(collapseIcon);
    buttonsContainer.appendChild(collapseButton);

    container.appendChild(buttonsContainer);
    document.body.appendChild(container);

    // 根据设置决定是否显示悬浮按钮
    const floatingButtonsContainer = document.querySelector(".floating-buttons-container");
    if (floatingButtonsContainer) {
      floatingButtonsContainer.style.display = this.floatingButtonsVisible ? "block" : "none";
    }

    // 根据折叠状态设置按钮显示
    if (this.floatingButtonsCollapsed) {
      buttonsContainer.classList.add("collapsed");
      // 隐藏所有按钮，只显示折叠按钮
      const allButtons = buttonsContainer.querySelectorAll(".floating-button, .top-button");
      allButtons.forEach((button) => {
        button.style.display = "none";
      });
      // 显示折叠按钮
      collapseButton.style.display = "flex";
    } else {
      buttonsContainer.classList.remove("collapsed");
    }
  }

  // 滚动到指定平台
  scrollToPlatform(platformKey) {
    const platformElement = document.getElementById(`platform-${platformKey}`);
    if (platformElement) {
      platformElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // 格式化数字显示
  formatNumber(num) {
    if (!num) return "0";
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + "万";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k";
    }
    return num.toString();
  }

  // 获取观看数据统计
  getViewerStats(streamer) {
    if (streamer.platform === "douyu" || streamer.platform === "huya") {
      // 斗鱼和虎牙的viewers字段实际是热度，强制显示
      const heat = streamer.viewers;
      return `<span class="stat-item"><span class="icon">🔥</span>${this.formatNumber(heat)}</span>`;
    } else {
      if (streamer.platform === "douyin") {
        //抖音的观看数是 str 格式，所以直接显示
        const viewers = streamer.viewers;
        return `<span class="stat-item"><span class="icon">👥</span>${viewers}</span>`;
      } else {
        const viewers = streamer.viewers;
        return `<span class="stat-item"><span class="icon">👥</span>${this.formatNumber(viewers)}</span>`;
      }
    }
  }

  // 格式化时间显示（修复直播时间显示问题）
  formatTime(timeValue) {
    if (!timeValue) return "";

    // 处理不同的时间格式
    if (typeof timeValue === "number") {
      // 如果是数字，假设是秒数（如B站的liveTime）
      const seconds = timeValue;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);

      if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
      } else if (minutes > 0) {
        return `${minutes}分钟`;
      } else {
        return "刚开始";
      }
    } else {
      // 如果是字符串或日期对象，尝试作为时间戳处理
      try {
        const time = new Date(timeValue);
        const now = new Date();
        const diff = now - time;

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
          return `${hours}小时${minutes}分钟`;
        } else if (minutes > 0) {
          return `${minutes}分钟`;
        } else {
          return "刚开始";
        }
      } catch (error) {
        return timeValue;
      }
    }
  }

  // 切换设置面板显示
  toggleSettings() {
    const settingsPanel = document.getElementById("settingsPanel");
    const settingsBtn = document.getElementById("settingsBtn");
    const contentDiv = document.getElementById("content");
    const refreshBtn = document.getElementById("refreshBtn");
    const floatingButtonsContainer = document.querySelector(".floating-buttons-container");

    // 切换显示状态
    if (settingsPanel.style.display === "none" || settingsPanel.style.display === "") {
      // 显示设置面板
      settingsPanel.style.display = "block";
      contentDiv.style.display = "none";
      settingsBtn.textContent = "返回";
      refreshBtn.style.display = "none"; // 隐藏刷新按钮
      // 隐藏悬浮按钮
      if (floatingButtonsContainer) {
        floatingButtonsContainer.style.display = "none";
      }
      // 立即渲染设置项
      this.renderSettings();
    } else {
      // 隐藏设置面板，显示主要内容
      settingsPanel.style.display = "none";
      contentDiv.style.display = "block";
      settingsBtn.textContent = "设置";
      refreshBtn.style.display = "inline-block"; // 显示刷新按钮
      // 显示悬浮按钮
      if (floatingButtonsContainer) {
        floatingButtonsContainer.style.display = this.floatingButtonsVisible ? "block" : "none";
      }
    }
  }

  // 渲染设置面板中的平台列表
  renderSettings() {
    const sortable = document.getElementById("platformSortable");
    sortable.innerHTML = "";

    // 按当前顺序渲染平台项
    this.platformOrder.forEach((platformKey) => {
      // 安全检查：确保平台配置存在且不为null
      if (!this.platforms[platformKey] || typeof this.platforms[platformKey] !== "object") {
        console.warn(`跳过无效的平台配置: ${platformKey}`, this.platforms[platformKey]);
        return;
      }

      const platform = this.platforms[platformKey];
      const item = document.createElement("li");
      item.className = "platform-item";
      item.setAttribute("data-platform", platformKey);
      item.draggable = true;
      item.innerHTML = `
        <div class="drag-handle">≡</div>
        <img class="platform-icon" src="${platform.icon}" alt="${platform.name}">
        <span class="platform-name">${platform.name}</span>
        <label class="platform-switch">
          <input type="checkbox" ${this.enabledPlatforms.includes(platformKey) ? "checked" : ""}>
          <span class="switch-slider"></span>
        </label>
      `;
      sortable.appendChild(item);
    });

    // 添加拖拽事件监听器
    this.setupDragAndDrop();

    // 为开关添加事件监听器
    this.setupSwitchListeners();

    // 初始化悬浮按钮开关状态
    // 延迟执行，确保DOM已经更新
    setTimeout(() => {
      const floatingButtonToggle = document.getElementById("floatingButtonToggle");
      if (floatingButtonToggle) {
        floatingButtonToggle.checked = this.floatingButtonsVisible;
      }
    }, 0);
  }

  // 为平台开关添加事件监听器
  setupSwitchListeners() {
    const switchInputs = document.querySelectorAll(".platform-switch input");
    switchInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        const platformItem = e.target.closest(".platform-item");
        if (!platformItem) return; // 安全检查

        const platformKey = platformItem.getAttribute("data-platform");
        const isChecked = e.target.checked;

        if (isChecked) {
          // 添加到启用列表
          if (!this.enabledPlatforms.includes(platformKey)) {
            this.enabledPlatforms.push(platformKey);
          }
        } else {
          // 从启用列表移除
          this.enabledPlatforms = this.enabledPlatforms.filter((p) => p !== platformKey);
        }
      });
    });
  }

  // 设置拖拽功能
  setupDragAndDrop() {
    const sortable = document.getElementById("platformSortable");
    let draggedItem = null;

    sortable.addEventListener("dragstart", (e) => {
      if (e.target.classList.contains("platform-item")) {
        draggedItem = e.target;
        e.target.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      }
    });

    sortable.addEventListener("dragend", (e) => {
      if (e.target.classList.contains("platform-item")) {
        e.target.classList.remove("dragging");
        draggedItem = null;
      }
    });

    sortable.addEventListener("dragover", (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(sortable, e.clientY);
      const draggable = document.querySelector(".dragging");

      if (afterElement == null) {
        sortable.appendChild(draggable);
      } else {
        sortable.insertBefore(draggable, afterElement);
      }
    });

    sortable.addEventListener("drop", (e) => {
      e.preventDefault();
    });
  }

  // 获取拖拽位置
  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll(".platform-item:not(.dragging)")];

    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  }

  // 应用设置
  applySettings() {
    const platformItems = document.querySelectorAll(".platform-item");
    const newOrder = Array.from(platformItems).map((item) => item.getAttribute("data-platform"));

    // 更新平台顺序
    this.platformOrder = newOrder;

    // 过滤掉无效的平台ID，确保只保留有效的平台
    this.enabledPlatforms = this.enabledPlatforms.filter((platformKey) => this.platforms[platformKey] !== undefined);

    // 获取悬浮按钮开关状态
    const floatingButtonToggle = document.getElementById("floatingButtonToggle");
    if (floatingButtonToggle) {
      this.floatingButtonsVisible = floatingButtonToggle.checked;
    }

    // 保存到本地存储
    chrome.storage.local.set({
      platformOrder: newOrder,
      enabledPlatforms: this.enabledPlatforms,
      floatingButtonsVisible: this.floatingButtonsVisible,
    });

    // 重新渲染主界面
    this.loadFollowedStreamers();

    // 显示页面内提示信息
    this.showMessage("设置已保存！");
  }

  // 在后台刷新数据
  async refreshInBackground() {
    try {
      // 获取最新数据
      const followedData = await this.getFollowedStreamers();

      // 缓存新数据
      await this.cacheData(followedData);

      // 更新UI显示（即使是在后台刷新，也要更新显示）
      this.renderStreamers(followedData);

      console.log("后台刷新完成");
    } catch (error) {
      console.error("后台刷新失败:", error);
    } finally {
      // 无论成功与否，都恢复按钮状态
      this.resetRefreshButton();
    }
  }

  // 显示刷新按钮的加载状态
  showRefreshLoading() {
    const refreshBtn = document.getElementById("refreshBtn");
    // 保存原始文本
    refreshBtn.dataset.originalText = refreshBtn.textContent;
    // 显示加载动画
    refreshBtn.innerHTML = '<span class="refresh-spinner"></span>刷新中';
    refreshBtn.disabled = true;
  }

  // 恢复刷新按钮的正常状态
  resetRefreshButton() {
    const refreshBtn = document.getElementById("refreshBtn");
    // 恢复原始文本
    if (refreshBtn.dataset.originalText) {
      refreshBtn.textContent = refreshBtn.dataset.originalText;
    }
    refreshBtn.disabled = false;
  }

  // 显示页面内提示信息
  showMessage(message) {
    const messageContainer = document.getElementById("messageContainer");
    if (messageContainer) {
      messageContainer.textContent = message;
      messageContainer.style.display = "block";

      // 3秒后自动隐藏
      setTimeout(() => {
        messageContainer.style.display = "none";
      }, 1000);
    }
  }

  // 检查主播是否被收藏
  isFavorite(streamer) {
    // 使用主播唯一标识符进行判断
    const streamerId = streamer.id || streamer.name;
    return this.favoriteStreamers.has(streamerId);
  }

  // 切换主播收藏状态
  toggleFavorite(streamer) {
    const streamerId = streamer.id || streamer.name;

    if (this.favoriteStreamers.has(streamerId)) {
      // 取消收藏
      this.favoriteStreamers.delete(streamerId);
    } else {
      // 添加收藏
      this.favoriteStreamers.add(streamerId);
    }

    // 保存到本地存储
    this.saveFavorites();

    // 重新渲染页面
    this.loadFollowedStreamers();
  }

  // 保存收藏状态到本地存储
  async saveFavorites() {
    try {
      await chrome.storage.local.set({ favoriteStreamers: Array.from(this.favoriteStreamers) });
    } catch (error) {
      console.error("保存收藏状态失败:", error);
    }
  }

  // 从本地存储加载收藏状态
  async loadFavorites() {
    try {
      const result = await chrome.storage.local.get(["favoriteStreamers"]);
      if (result.favoriteStreamers) {
        this.favoriteStreamers = new Set(result.favoriteStreamers);
      }
    } catch (error) {
      console.error("加载收藏状态失败:", error);
    }
  }

  // 对主播列表进行排序，收藏的主播排在前面
  sortFavoritesFirst(streamers) {
    return streamers.slice().sort((a, b) => {
      const aIsFavorite = this.isFavorite(a);
      const bIsFavorite = this.isFavorite(b);

      // 收藏的主播排在前面
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return 0;
    });
  }

  // 切换悬浮按钮折叠状态
  toggleFloatingButtons() {
    const buttonsContainer = document.querySelector(".floating-buttons");
    const collapseButton = document.querySelector(".collapse-button");
    const allButtons = buttonsContainer.querySelectorAll(".floating-button, .top-button");

    if (!buttonsContainer || !collapseButton) return;

    // 获取当前折叠状态（通过检查是否有collapsed类）
    const isCollapsed = buttonsContainer.classList.contains("collapsed");

    if (isCollapsed) {
      // 展开状态
      buttonsContainer.classList.remove("collapsed");
      collapseButton.title = "折叠悬浮按钮";

      // 更新图标为下箭头（展开状态）
      const collapseIcon = collapseButton.querySelector(".collapse-button-icon");
      if (collapseIcon) {
        collapseIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7 10l5 5 5-5z"/></svg>';
      }

      // 显示所有按钮
      allButtons.forEach((button) => {
        button.style.display = "flex";
      });

      // 保存状态到本地存储
      this.floatingButtonsCollapsed = false;
      chrome.storage.local.set({ floatingButtonsCollapsed: false });
    } else {
      // 折叠状态
      buttonsContainer.classList.add("collapsed");
      collapseButton.title = "展开悬浮按钮";

      // 更新图标为上箭头（折叠状态）
      const collapseIcon = collapseButton.querySelector(".collapse-button-icon");
      if (collapseIcon) {
        collapseIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7 14l5-5 5 5z"/></svg>';
      }

      // 只显示折叠按钮，隐藏其他按钮
      allButtons.forEach((button) => {
        button.style.display = "none";
      });

      // 显示折叠按钮
      collapseButton.style.display = "flex";

      // 保存状态到本地存储
      this.floatingButtonsCollapsed = true;
      chrome.storage.local.set({ floatingButtonsCollapsed: true });
    }
  }

  // 重置所有设置
  resetSettings() {
    if (!confirm("确定要重置所有设置吗？此操作不可撤销。")) {
      return;
    }

    // 重置为默认值
    this.platformOrder = Object.keys(this.platforms);
    this.enabledPlatforms = Object.keys(this.platforms);
    this.floatingButtonsVisible = true;
    this.floatingButtonsCollapsed = false; // 重置折叠状态
    this.favoriteStreamers = new Set();

    // 从本地存储中删除所有设置数据
    chrome.storage.local.remove(
      [
        "platformOrder",
        "enabledPlatforms",
        "floatingButtonsVisible",
        "floatingButtonsCollapsed", // 添加这个字段
        "favoriteStreamers",
        "cachedStreamers",
        "cachedTimestamp",
      ],
      () => {
        // 重新加载数据以应用重置后的设置
        this.loadFollowedStreamers();

        // 重新渲染设置面板
        this.renderSettings();

        // 显示提示信息
        this.showMessage("所有设置已重置为默认值！");
      }
    );
  }
}

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  new LiveAssistant();
});
