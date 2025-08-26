class PlatformAPI {
  constructor() {
    this.platforms = {
      douyu: new DouyuAPI(),
      huya: new HuyaAPI(),
      bilibili: new BilibiliAPI(),
      douyin: new DouyinAPI(),
      twitch: new TwitchAPI()
    };
  }

  async getFollowedStreamers(platform) {
    const api = this.platforms[platform];
    if (!api) {
      throw new Error(`不支持的平台: ${platform}`);
    }

    try {
      const result = await api.getFollowedStreamers();
      return {
        data: result.data || [],
        isLoggedIn: result.isLoggedIn !== false,
        loginUrl: result.loginUrl
      };
    } catch (error) {
      console.error(`获取${platform}关注列表失败:`, error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: this.getLoginUrl(platform)
      };
    }
  }

  getLoginUrl(platform) {
    const urls = {
      douyu: 'https://www.douyu.com',
      huya: 'https://www.huya.com',
      bilibili: 'https://www.bilibili.com',
      douyin: 'https://www.douyin.com',
      twitch: 'https://www.twitch.tv'
    };
    return urls[platform] || '';
  }
}

// 初始化平台API
class DouyuAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies('https://www.douyu.com');
      console.log('斗鱼cookies:', cookies.map(c => c.name));

      const acfUid = cookies.find(c => c.name === 'acf_uid');
      const dyDid = cookies.find(c => c.name === 'dy_did');

      if (!acfUid && !dyDid) {
        console.log('斗鱼未登录');
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: 'https://www.douyu.com'
        };
      }

      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('斗鱼请求cookie:', cookieStr);

      // 斗鱼关注列表API
      const response = await fetch('https://www.douyu.com/wgapi/livenc/liveweb/follow/list?page=1&limit=50', {
        method: 'GET',
        headers: {
          'Cookie': cookieStr,
          'Referer': 'https://www.douyu.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!response.ok) {
        console.error('斗鱼API请求失败:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      console.log('斗鱼API返回:', data);

      return {
        data: this.parseStreamers(data),
        isLoggedIn: true
      };
    } catch (error) {
      console.error('斗鱼API错误:', error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: 'https://www.douyu.com'
      };
    }
  }

  async getCookies(url) {
    return new Promise((resolve) => {
      chrome.cookies.getAll({ url }, resolve);
    });
  }

  parseStreamers(data) {
    if (!data || data.error !== 0 || !data.data || !data.data.list) {
      console.log('斗鱼数据格式错误:', data);
      return [];
    }

    return data.data.list.map(item => {
      console.log('斗鱼单个主播数据:', item);

      // 使用avatar_small字段作为头像
      const avatar = item.avatar_small || item.avatar || item.owner_avatar;
      let avatarUrl = avatar;
      if (avatar && !avatar.startsWith('http')) {
        avatarUrl = avatar.startsWith('//') ? `https:${avatar}` : avatar;
      }

      const streamer = {
        name: item.nickname || item.room_name,
        avatar: avatarUrl,
        url: `https://www.douyu.com/${item.room_id}`,
        isLive: item.show_status === 1 && item.videoLoop === 0,
        title: item.room_name,
        platform: 'douyu',
        viewers: item.online,
        followers: 0, // 斗鱼关注列表API不返回粉丝数
        startTime: item.show_time ? new Date(item.show_time * 1000) : null, // 时间戳转换
        thumbnail: item.room_src // 添加缩略图URL
      };

      console.log('解析的热度:', streamer.viewers, '原始数据:', item.online);
      console.log('解析后的斗鱼主播:', streamer);
      return streamer;
    });
  }
}

// 虎牙 API - 使用正确的API端点
class HuyaAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies('https://www.huya.com');
      console.log('虎牙cookies:', cookies.map(c => c.name));

      const udbUid = cookies.find(c => c.name === 'udb_uid');
      
      if (!udbUid) {
        console.log('虎牙未登录');
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: 'https://www.huya.com'
        };
      }

      const uid = udbUid.value;
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('虎牙请求cookie:', cookieStr);

      // 使用正确的虎牙API端点
      const response = await fetch(`https://fw.huya.com/dispatch?do=subscribeList&uid=${uid}&page=1&pageSize=22`, {
        method: 'GET',
        headers: {
          'Cookie': cookieStr,
          'Referer': 'https://www.huya.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Host': 'fw.huya.com',
          'Connection': 'keep-alive'
        }
      });

      if (!response.ok) {
        console.error('虎牙API请求失败:', response.status, response.statusText);
        // 尝试获取响应文本以调试
        const responseText = await response.text();
        console.error('虎牙API响应文本:', responseText);
        return [];
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('虎牙API返回非JSON内容:', contentType);
        const responseText = await response.text();
        console.error('虎牙API响应文本:', responseText);
        return [];
      }

      const data = await response.json();
      console.log('虎牙API返回:', data);

      // 检查虎牙API响应结构
      if (!data || data.status !== 1000 || !data.result || !data.result.list) {
        console.error('虎牙API错误:', data);
        return [];
      }

      return {
        data: this.parseStreamers(data),
        isLoggedIn: true
      };
    } catch (error) {
      console.error('虎牙API错误:', error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: 'https://www.huya.com'
      };
    }
  }

  async getCookies(url) {
    return new Promise((resolve) => {
      chrome.cookies.getAll({ url }, resolve);
    });
  }

  parseStreamers(data) {
    // 根据提供的API响应格式解析数据
    if (!data || !data.result || !data.result.list) {
      console.log('虎牙数据格式错误:', data);
      return [];
    }

    return data.result.list.map(item => ({
      name: item.nick,
      avatar: item.avatar180,
      url: `https://www.huya.com/${item.profileRoom}`,
      isLive: item.isLive,
      title: item.intro,
      platform: 'huya',
      viewers: item.totalCount || 0, // totalCount代表热度
      followers: item.activityCount || 0, // 根据反馈，粉丝字段是activityCount
      startTime: item.startTime ? new Date(item.startTime * 1000) : null
    }));
  }
}

// B站 API
class BilibiliAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies('https://www.bilibili.com');
      console.log('B站cookies:', cookies.map(c => c.name));

      const sessdata = cookies.find(c => c.name === 'SESSDATA');
      const uid = cookies.find(c => c.name === 'DedeUserID');

      if (!sessdata || !uid) {
        console.log('B站未登录或cookie不完整');
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: 'https://www.bilibili.com'
        };
      }

      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('B站请求cookie:', cookieStr);

      // B站直播关注列表API
      const response = await fetch('https://api.live.bilibili.com/xlive/web-ucenter/user/following?page=1&page_size=29', {
        method: 'GET',
        headers: {
          'Cookie': cookieStr,
          'Referer': 'https://live.bilibili.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        console.error('B站API请求失败:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      console.log('B站API返回:', data);

      return {
        data: this.parseStreamers(data),
        isLoggedIn: true
      };
    } catch (error) {
      console.error('B站API错误:', error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: 'https://www.bilibili.com'
      };
    }
  }

  async getCookies(url) {
    return new Promise((resolve) => {
      chrome.cookies.getAll({ url }, resolve);
    });
  }

  parseStreamers(data) {
    if (!data || data.code !== 0 || !data.data || !data.data.list) {
      console.log('B站数据格式错误:', data);
      return [];
    }

    return data.data.list.map(item => ({
      name: item.uname,
      avatar: item.face,
      url: `https://live.bilibili.com/${item.roomid}`,
      isLive: item.live_status === 1,
      title: item.title || item.uname,
      platform: 'bilibili',
      viewers: item.online || 0,
      followers: item.attention || 0,
      startTime: item.live_time
    }));
  }
}

// 抖音 API (简化实现)
class DouyinAPI {
  async getFollowedStreamers() {
    // 抖音的API比较复杂，这里提供基础框架
    try {
      const cookies = await this.getCookies('https://live.douyin.com');
      // 抖音需要更复杂的认证机制
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: 'https://www.douyin.com'
      };
    } catch (error) {
      console.error('抖音API错误:', error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: 'https://www.douyin.com'
      };
    }
  }

  async getCookies(url) {
    return new Promise((resolve) => {
      chrome.cookies.getAll({ url }, resolve);
    });
  }
}

// Twitch API
class TwitchAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies('https://www.twitch.tv');

      const authTokenCookie = cookies.find(c => c.name === 'auth-token');
      const uniqueIDCookie = cookies.find(c => c.name === 'unique_id');
      
      if (!authTokenCookie || !uniqueIDCookie) {
        console.log('Twitch未找到相关 cookie');
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: 'https://www.twitch.tv'
        };
      }

      const authToken = authTokenCookie.value;
      const uniqueID =  uniqueIDCookie.value;
      
      // 使用Twitch的Helix API获取用户ID
      const userResponse = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
        }
      });

      if (!userResponse.ok) {
        console.error('Twitch获取用户信息失败:', userResponse.status);
        // 如果认证失败，返回未登录状态
        if (userResponse.status === 401) {
          return {
            data: [],
            isLoggedIn: false,
            loginUrl: 'https://www.twitch.tv'
          };
        }
        return {
          data: [],
          isLoggedIn: true
        };
      }

      const userData = await userResponse.json();
      const userId = userData.data && userData.data[0] ? userData.data[0].id : null;
      
      if (!userId) {
        console.log('Twitch无法获取用户ID');
        return {
          data: [],
          isLoggedIn: true
        };
      }

      // 获取关注的频道
      const followedResponse = await fetch(`https://api.twitch.tv/helix/channels/followed?user_id=${userId}&first=100`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
        }
      });

      if (!followedResponse.ok) {
        console.error('Twitch获取关注列表失败:', followedResponse.status);
        return {
          data: [],
          isLoggedIn: true
        };
      }

      const followedData = await followedResponse.json();
      const channelIds = followedData.data.map(channel => channel.broadcaster_id);
      
      if (channelIds.length === 0) {
        console.log('Twitch没有关注的频道');
        return {
          data: [],
          isLoggedIn: true
        };
      }

      // 获取这些频道的直播状态（分批处理，API限制每次最多100个）
      const batchSize = 100;
      const batches = [];
      for (let i = 0; i < channelIds.length; i += batchSize) {
        batches.push(channelIds.slice(i, i + batchSize));
      }

      let allLiveStreams = [];
      for (const batch of batches) {
        const idsParam = batch.join('&user_id=');
        const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?user_id=${idsParam}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
          }
        });

        if (streamsResponse.ok) {
          const streamsData = await streamsResponse.json();
          if (streamsData.data) {
            allLiveStreams = allLiveStreams.concat(streamsData.data);
          }
        }
      }

      // 获取频道详细信息
      const channelInfoMap = {};
      for (const batch of batches) {
        const idsParam = batch.join('&broadcaster_id=');
        const channelResponse = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${idsParam}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
          }
        });

        if (channelResponse.ok) {
          const channelData = await channelResponse.json();
          if (channelData.data) {
            channelData.data.forEach(channel => {
              channelInfoMap[channel.broadcaster_id] = channel;
            });
          }
        }
      }

      // 合并直播数据和频道信息
      const streamersWithInfo = allLiveStreams.map(stream => {
        const channelInfo = channelInfoMap[stream.user_id] || {};
        return {
          ...stream,
          ...channelInfo
        };
      });

      console.log('Twitch返回数据:', streamersWithInfo);

      return {
        data: this.parseStreamers(streamersWithInfo),
        isLoggedIn: true
      };
    } catch (error) {
      console.error('Twitch API错误:', error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: 'https://www.twitch.tv'
      };
    }
  }

  async getCookies(url) {
    return new Promise((resolve) => {
      chrome.cookies.getAll({ url }, resolve);
    });
  }

  parseStreamers(streams) {
    if (!streams || !Array.isArray(streams)) {
      return [];
    }

    return streams.map(stream => ({
      name: stream.user_name || stream.broadcaster_name,
      avatar: stream.thumbnail_url ? stream.thumbnail_url.replace('{width}', '70').replace('{height}', '70') : '',
      url: `https://www.twitch.tv/${stream.user_login || stream.broadcaster_login}`,
      isLive: true, // 只返回正在直播的
      title: stream.title,
      platform: 'twitch',
      viewers: stream.viewer_count || 0,
      followers: 0, // Twitch API不直接提供粉丝数
      startTime: stream.started_at ? new Date(stream.started_at) : null
    }));
  }
}

// 初始化平台API
const platformAPI = new PlatformAPI();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getFollowedStreamers') {
    console.log(`开始获取${request.platform}平台数据...`);

    // 添加超时机制，防止某些平台响应过慢
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 10000); // 10秒超时
    });

    const apiPromise = platformAPI.getFollowedStreamers(request.platform);

    Promise.race([apiPromise, timeoutPromise])
      .then(result => {
        console.log(`${request.platform}平台返回数据:`, result);
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        console.error(`获取${request.platform}数据失败:`, error);
        // 对于超时错误，返回特定的错误信息
        if (error.message === '请求超时') {
          sendResponse({ success: false, error: '请求超时，请稍后重试', isLoggedIn: false });
        } else {
          sendResponse({ success: false, error: error.message, isLoggedIn: false });
        }
      });

    return true; // 保持消息通道开放
  }
});
