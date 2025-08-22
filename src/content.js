// Content script for extracting follow data from pages
class ContentExtractor {
  constructor() {
    this.platform = this.detectPlatform();
    this.init();
  }
  
  detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('douyu.com')) return 'douyu';
    if (hostname.includes('huya.com')) return 'huya';
    if (hostname.includes('bilibili.com')) return 'bilibili';
    if (hostname.includes('douyin.com')) return 'douyin';
    if (hostname.includes('twitch.tv')) return 'twitch';
    
    return null;
  }
  
  init() {
    if (!this.platform) return;
    
    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractFollowData') {
        this.extractFollowData()
          .then(data => sendResponse({ success: true, data }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      }
    });
  }
  
  async extractFollowData() {
    switch (this.platform) {
      case 'douyu':
        return this.extractDouyuData();
      case 'huya':
        return this.extractHuyaData();
      case 'bilibili':
        return this.extractBilibiliData();
      case 'douyin':
        return this.extractDouyinData();
      case 'twitch':
        return this.extractTwitchData();
      default:
        return [];
    }
  }
  
  extractDouyuData() {
    // 从斗鱼页面提取关注数据
    const followItems = document.querySelectorAll('.follow-card, .room-card');
    const streamers = [];
    
    followItems.forEach(item => {
      try {
        const nameEl = item.querySelector('.room-name, .anchor-name');
        const avatarEl = item.querySelector('.room-cover img, .anchor-avatar img');
        const linkEl = item.querySelector('a');
        const statusEl = item.querySelector('.room-status, .live-status');
        
        if (nameEl && avatarEl && linkEl) {
          streamers.push({
            name: nameEl.textContent.trim(),
            avatar: avatarEl.src,
            url: linkEl.href,
            isLive: statusEl ? statusEl.textContent.includes('直播中') : false,
            title: nameEl.textContent.trim(),
            platform: 'douyu'
          });
        }
      } catch (error) {
        console.error('解析斗鱼数据错误:', error);
      }
    });
    
    return streamers;
  }
  
  extractHuyaData() {
    // 从虎牙页面提取关注数据
    const followItems = document.querySelectorAll('.follow-item, .room-item');
    const streamers = [];
    
    followItems.forEach(item => {
      try {
        const nameEl = item.querySelector('.room-name, .nick');
        const avatarEl = item.querySelector('.room-pic img, .avatar img');
        const linkEl = item.querySelector('a');
        const statusEl = item.querySelector('.room-status');
        
        if (nameEl && avatarEl && linkEl) {
          streamers.push({
            name: nameEl.textContent.trim(),
            avatar: avatarEl.src,
            url: linkEl.href,
            isLive: item.classList.contains('on') || statusEl?.textContent.includes('直播中'),
            title: nameEl.textContent.trim(),
            platform: 'huya'
          });
        }
      } catch (error) {
        console.error('解析虎牙数据错误:', error);
      }
    });
    
    return streamers;
  }
  
  extractBilibiliData() {
    // 从B站页面提取关注数据
    const followItems = document.querySelectorAll('.follow-card, .live-card');
    const streamers = [];
    
    followItems.forEach(item => {
      try {
        const nameEl = item.querySelector('.uname, .room-name');
        const avatarEl = item.querySelector('.face img, .cover img');
        const linkEl = item.querySelector('a');
        const statusEl = item.querySelector('.live-status, .room-status');
        
        if (nameEl && avatarEl && linkEl) {
          streamers.push({
            name: nameEl.textContent.trim(),
            avatar: avatarEl.src,
            url: linkEl.href,
            isLive: statusEl ? statusEl.textContent.includes('直播中') : false,
            title: nameEl.textContent.trim(),
            platform: 'bilibili'
          });
        }
      } catch (error) {
        console.error('解析B站数据错误:', error);
      }
    });
    
    return streamers;
  }
  
  extractDouyinData() {
    // 抖音数据提取（需要根据实际页面结构调整）
    return [];
  }
  
  extractTwitchData() {
    // 从Twitch页面提取关注数据
    const followItems = document.querySelectorAll(
      '.tw-follow-card, .side-nav-card, [data-test-selector="followed-channel"], ' +
      '[data-a-target="side-nav-channel-link"], [data-a-target="followed-channel-item"]'
    );
    const streamers = [];
    
    followItems.forEach(item => {
      try {
        // 尝试多种选择器来获取主播信息
        const nameEl = item.querySelector(
          '.tw-title, .side-nav-title, [data-a-target="side-nav-title"], ' +
          '[data-a-target="followed-channel-username"], [data-a-target="chat-line-username"]'
        );
        const avatarEl = item.querySelector('img');
        const linkEl = item.querySelector('a');
        const statusEl = item.querySelector(
          '.tw-channel-status, .side-nav-live-indicator, [data-a-target="side-nav-live-indicator"], ' +
          '.live-indicator, [data-a-target="live-indicator"]'
        );
        
        if (nameEl && avatarEl) {
          // 获取主播名称
          const name = nameEl.textContent.trim();
          
          // 获取头像URL
          let avatar = avatarEl.src;
          if (avatar && avatar.includes('profile_image')) {
            // 确保使用合适的头像尺寸
            avatar = avatar.replace(/-[0-9]+x[0-9]+/, '-70x70');
          }
          
          // 构建主播URL
          let url = '';
          if (linkEl && linkEl.href) {
            url = linkEl.href;
          } else if (name) {
            // 如果没有链接元素，根据用户名构建URL
            url = `https://www.twitch.tv/${name.toLowerCase()}`;
          }
          
          // 检查是否正在直播
          const isLive = statusEl ? 
            (statusEl.textContent.includes('直播中') || 
             statusEl.textContent.includes('LIVE') || 
             statusEl.classList.contains('live') ||
             statusEl.getAttribute('data-a-target') === 'side-nav-live-indicator') : 
            false;
          
          streamers.push({
            name: name,
            avatar: avatar,
            url: url,
            isLive: isLive,
            title: name,
            platform: 'twitch'
          });
        }
      } catch (error) {
        console.error('解析Twitch数据错误:', error);
      }
    });
    
    // 如果没有找到标准的关注卡片，尝试从侧边栏获取
    if (streamers.length === 0) {
      const sidebarItems = document.querySelectorAll('[data-a-target="side-nav-channel-link"]');
      sidebarItems.forEach(item => {
        try {
          const nameEl = item.querySelector('[data-a-target="side-nav-title"]');
          const avatarEl = item.querySelector('img');
          
          if (nameEl && avatarEl) {
            const name = nameEl.textContent.trim();
            let avatar = avatarEl.src;
            if (avatar && avatar.includes('profile_image')) {
              avatar = avatar.replace(/-[0-9]+x[0-9]+/, '-70x70');
            }
            
            // 从链接中提取用户名
            let url = `https://www.twitch.tv/${name.toLowerCase()}`;
            const linkEl = item.querySelector('a');
            if (linkEl && linkEl.href) {
              url = linkEl.href;
            }
            
            streamers.push({
              name: name,
              avatar: avatar,
              url: url,
              isLive: false, // 侧边栏不显示直播状态
              title: name,
              platform: 'twitch'
            });
          }
        } catch (error) {
          console.error('解析Twitch侧边栏数据错误:', error);
        }
      });
    }
    
    // 去重处理
    const uniqueStreamers = [];
    const seenUrls = new Set();
    
    streamers.forEach(streamer => {
      if (!seenUrls.has(streamer.url)) {
        seenUrls.add(streamer.url);
        uniqueStreamers.push(streamer);
      }
    });
    
    console.log('Twitch提取到的数据:', uniqueStreamers);
    return uniqueStreamers;
  }
}

// 初始化内容脚本
new ContentExtractor();
