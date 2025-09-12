class PlatformAPI {
  constructor() {
    this.platforms = {
      douyu: new DouyuAPI(),
      huya: new HuyaAPI(),
      bilibili: new BilibiliAPI(),
      douyin: new DouyinAPI(),
      twitch: new TwitchAPI(),
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
        loginUrl: result.loginUrl,
      };
    } catch (error) {
      console.error(`获取${platform}关注列表失败:`, error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: this.getLoginUrl(platform),
      };
    }
  }

  getLoginUrl(platform) {
    const urls = {
      douyu: "https://www.douyu.com",
      huya: "https://www.huya.com",
      bilibili: "https://www.bilibili.com",
      douyin: "https://www.douyin.com",
      twitch: "https://www.twitch.tv",
    };
    return urls[platform] || "";
  }
}

// 初始化平台API
class DouyuAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies("https://www.douyu.com");

      const acfUid = cookies.find((c) => c.name === "acf_uid");
      const dyDid = cookies.find((c) => c.name === "dy_did");

      if (!acfUid && !dyDid) {
        console.log("斗鱼未登录");
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: "https://www.douyu.com",
        };
      }

      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      console.log("斗鱼请求cookie:", cookieStr);

      // 斗鱼关注列表API
      const response = await fetch("https://www.douyu.com/wgapi/livenc/liveweb/follow/list?page=1&limit=50", {
        method: "GET",
        headers: {
          Cookie: cookieStr,
        },
      });

      if (!response.ok) {
        console.error("斗鱼API请求失败:", response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      console.log("斗鱼API返回:", data);

      return {
        data: this.parseStreamers(data),
        isLoggedIn: true,
      };
    } catch (error) {
      console.error("斗鱼API错误:", error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: "https://www.douyu.com",
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
      console.log("斗鱼数据格式错误:", data);
      return [];
    }

    return data.data.list.map((item) => {
      // 使用avatar_small字段作为头像
      const avatar = item.avatar_small || item.avatar || item.owner_avatar;
      let avatarUrl = avatar;
      if (avatar && !avatar.startsWith("http")) {
        avatarUrl = avatar.startsWith("//") ? `https:${avatar}` : avatar;
      }

      const streamer = {
        name: item.nickname || item.room_name,
        avatar: avatarUrl,
        url: `https://www.douyu.com/${item.room_id}`,
        isLive: item.show_status === 1 && item.videoLoop === 0,
        title: item.room_name,
        platform: "douyu",
        viewers: item.online,
        followers: 0, // 斗鱼关注列表API不返回粉丝数
        startTime: item.show_time ? new Date(item.show_time * 1000) : null, // 时间戳转换
        thumbnail: item.room_src,
        gameName: item.game_name || "",
      };
      return streamer;
    });
  }
}

// 虎牙 API - 使用正确的API端点
class HuyaAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies("https://www.huya.com");

      const udbUid = cookies.find((c) => c.name === "udb_uid");

      if (!udbUid) {
        console.log("虎牙未登录");
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: "https://www.huya.com",
        };
      }

      const uid = udbUid.value;
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      console.log("虎牙请求cookie:", cookieStr);

      // 使用正确的虎牙API端点
      const response = await fetch(`https://fw.huya.com/dispatch?do=subscribeList&uid=${uid}&page=1&pageSize=22`, {
        method: "GET",
        headers: {
          Cookie: cookieStr,
        },
      });

      if (!response.ok) {
        console.error("虎牙API请求失败:", response.status, response.statusText);
        // 尝试获取响应文本以调试
        const responseText = await response.text();
        console.error("虎牙API响应文本:", responseText);
        return [];
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("虎牙API返回非JSON内容:", contentType);
        const responseText = await response.text();
        console.error("虎牙API响应文本:", responseText);
        return [];
      }

      const data = await response.json();
      console.log("虎牙API返回:", data);

      // 检查虎牙API响应结构
      if (!data || data.status !== 1000 || !data.result || !data.result.list) {
        console.error("虎牙API错误:", data);
        return [];
      }

      return {
        data: this.parseStreamers(data),
        isLoggedIn: true,
      };
    } catch (error) {
      console.error("虎牙API错误:", error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: "https://www.huya.com",
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
      console.log("虎牙数据格式错误:", data);
      return [];
    }

    return data.result.list.map((item) => ({
      name: item.nick,
      avatar: item.avatar180,
      url: `https://www.huya.com/${item.profileRoom}`,
      isLive: item.isLive,
      title: item.intro,
      platform: "huya",
      viewers: item.totalCount || 0,
      followers: item.activityCount || 0,
      startTime: item.startTime ? new Date(item.startTime * 1000) : null,
      thumbnail: item.screenshot,
      gameName: item.gameName || "",
    }));
  }
}

// B站 API
class BilibiliAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies("https://www.bilibili.com");

      const sessdata = cookies.find((c) => c.name === "SESSDATA");
      const uid = cookies.find((c) => c.name === "DedeUserID");

      if (!sessdata || !uid) {
        console.log("B站未登录或cookie不完整");
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: "https://www.bilibili.com",
        };
      }

      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      console.log("B站请求cookie:", cookieStr);

      // B站直播关注列表API
      const response = await fetch("https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList", {
        method: "GET",
        headers: {
          Cookie: cookieStr,
        },
      });

      if (!response.ok) {
        console.error("B站API请求失败:", response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      console.log("B站API返回:", data);

      return {
        data: this.parseStreamers(data),
        isLoggedIn: true,
      };
    } catch (error) {
      console.error("B站API错误:", error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: "https://www.bilibili.com",
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
      console.log("B站数据格式错误:", data);
      return [];
    }

    return data.data.list.map((item) => {
      const streamer = {
        name: item.uname || "未知主播",
        avatar: item.face,
        url: `https://live.bilibili.com/${item.roomid || item.room_id}`,
        isLive: item.live_status === 1,
        title: item.title || "直播中...",
        platform: "bilibili",
        viewers: item.online || 0,
        followers: 0, //b站无法索取粉丝数
        liveTime: item.live_time,
        thumbnail: item.keyframe || item.cover_from_user,
        gameName: item.area_v2_name || "",
      };

      return streamer;
    });
  }
}

// 抖音 API
class DouyinAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies("https://www.douyin.com");
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      console.log("抖音请求cookie:", cookieStr);

      // 抖音关注列表API
      const response = await fetch("https://www.douyin.com/webcast/web/feed/follow/?aid=6383&scene=aweme_pc_follow_top", {
        method: "GET",
        headers: {
          Cookie: cookieStr,
        },
      });

      if (!response.ok) {
        console.error("抖音API请求失败:", response.status, response.statusText);
        // 尝试获取响应文本以调试
        const responseText = await response.text();
        console.error("抖音API响应文本:", responseText);
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: "https://www.douyin.com",
        };
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("抖音API返回非JSON内容:", contentType);
        const responseText = await response.text();
        console.error("抖音API响应文本:", responseText);
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: "https://www.douyin.com",
        };
      }

      const data = await response.json();
      console.log("抖音API返回:", data);

      // 解析抖音返回的数据
      return {
        data: this.parseStreamers(data),
        isLoggedIn: true,
      };
    } catch (error) {
      console.error("抖音API错误:", error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: "https://www.douyin.com",
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
    if (!data || !data.data || !data.data.data) {
      console.log("抖音数据格式错误:", data);
      return [];
    }

    return data.data.data.map((item) => {
      const room = item.room;

      const streamer = {
        name: room.owner.nickname || "未知主播",
        avatar: room.owner.avatar_thumb?.url_list?.[0] || "",
        url: `https://live.douyin.com/${item.web_rid}`,
        isLive: room.status === 0,
        title: room.title || "直播中...",
        platform: "douyin",
        viewers: room.stats?.user_count_str || "0",
        followers: 0, // 抖音API不返回粉丝数
        thumbnail: room.cover?.url_list?.[0] || "",
        gameName: "", // 抖音无法获取游戏名称
      };

      return streamer;
    });
  }
}

// Twitch API
// 使用新的GraphQL实现
class TwitchAPI {
  async getFollowedStreamers() {
    try {
      const cookies = await this.getCookies("https://www.twitch.tv");

      const authTokenCookie = cookies.find((c) => c.name === "auth-token");
      const xDeviceIDCookie = cookies.find((c) => c.name === "unique_id");

      if (!authTokenCookie || !xDeviceIDCookie) {
        console.log("Twitch未找到相关 cookie");
        return {
          data: [],
          isLoggedIn: false,
          loginUrl: "https://www.twitch.tv",
        };
      }

      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      console.log("Twitch请求cookie:", cookieStr);

      const authToken = authTokenCookie.value;
      const xDeviceID = xDeviceIDCookie.value;

      // 构造GraphQL请求
      const graphqlQuery = [
        {
          variables: {
            input: {
              followSortOrder: "RECS",
            },
            creatorAnniversariesFeature: false,
            withFreeformTags: false,
          },
          extensions: {
            persistedQuery: {
              sha256Hash: "b235e7c084bc768d827343cda0b95310535a0956d449e574885b00e176fe5f27",
            },
          },
        },
      ];

      // 发送GraphQL请求到Twitch
      const response = await fetch("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: {
          Authorization: `OAuth ${authToken}`,
          "X-Device-Id": xDeviceID,
        },
        body: JSON.stringify(graphqlQuery),
      });

      if (!response.ok) {
        console.error("Twitch GraphQL请求失败:", response.status, response.statusText);
        // 如果认证失败，返回未登录状态
        if (response.status === 401) {
          return {
            data: [],
            isLoggedIn: false,
            loginUrl: "https://www.twitch.tv",
          };
        }
        return {
          data: [],
          isLoggedIn: true,
        };
      }

      const data = await response.json();
      console.log("Twitch API返回数据:", data);

      return {
        data: this.parseStreamers(data),
        isLoggedIn: true,
      };
    } catch (error) {
      console.error("Twitch API错误:", error);
      return {
        data: [],
        isLoggedIn: false,
        loginUrl: "https://www.twitch.tv",
      };
    }
  }

  async getCookies(url) {
    return new Promise((resolve) => {
      chrome.cookies.getAll({ url }, resolve);
    });
  }

  parseStreamers(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log("Twitch数据格式错误:", data);
      return [];
    }

    const result = data[0];
    if (!result.data || !result.data.sideNav || !result.data.sideNav.sections) {
      return [];
    }

    // 提取所有关注的流数据
    const followedStreams = [];

    const sections = result.data.sideNav.sections.edges;
    sections.forEach((section) => {
      if (section.node.content.edges && section.node.id.includes("followed")) {
        section.node.content.edges.forEach((edge) => {
          const node = edge.node;
          if (node.__typename === "Stream") {
            followedStreams.push(node);
          }
        });
      }
    });

    return followedStreams.map((node) => {
      const streamer = {
        name: node.broadcaster.displayName || "未知主播",
        avatar: node.broadcaster.profileImageURL,
        url: `https://www.twitch.tv/${node.broadcaster.login}`,
        isLive: true,
        title: node.broadcaster.broadcastSettings.title || "",
        platform: "twitch",
        viewers: node.viewersCount || 0,
        followers: 0, // Twitch API不直接提供粉丝数
        thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${node.broadcaster.login}-320x180.jpg`,
        gameName: node.game.displayName || "",
      };

      return streamer;
    });
  }
}

// 初始化平台API
const platformAPI = new PlatformAPI();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getFollowedStreamers") {
    console.log(`开始获取${request.platform}平台数据...`);

    // 添加超时机制，防止某些平台响应过慢
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("请求超时")), 10000); // 10秒超时
    });

    const apiPromise = platformAPI.getFollowedStreamers(request.platform);

    Promise.race([apiPromise, timeoutPromise])
      .then((result) => {
        console.log(`${request.platform}平台返回数据:`, result);
        sendResponse({ success: true, ...result });
      })
      .catch((error) => {
        console.error(`获取${request.platform}数据失败:`, error);
        // 对于超时错误，返回特定的错误信息
        if (error.message === "请求超时") {
          sendResponse({ success: false, error: "请求超时，请稍后重试", isLoggedIn: false });
        } else {
          sendResponse({ success: false, error: error.message, isLoggedIn: false });
        }
      });

    return true; // 保持消息通道开放
  }
});
