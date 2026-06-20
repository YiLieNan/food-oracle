import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.foodoracle.app',
  appName: '食神签',
  webDir: 'mobile',

  // Android 平台配置
  android: {
    allowMixedContent: true,        // 允许 HTTP 请求（开发环境连本地服务器）
    captureInput: true,
    webContentsDebuggingEnabled: true, // debug 模式允许 WebView 调试
  },

  // 服务器配置（开发时使用）
  server: {
    // 开发时可取消注释以下行以从开发服务器加载
    // url: 'http://192.168.1.100:3456',
    // cleartext: true,
  },

  // 插件配置
  plugins: {
    Preferences: {
      // 使用 Capacitor Preferences 存储服务器地址等设置
    },
  },
};

export default config;
