import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import axios from 'axios';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import Store from 'electron-store';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

// Конфигурация приложения из переменных окружения
const APP_CONFIG = {
  API_TOKEN: config.api.token,
  API_BASE: config.api.base,
  WINDOW: config.app.window
};

class LimitedCache {
  constructor(maxSize = 100, ttl = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      timestamp: Date.now(),
      data
    });
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new LimitedCache(100, 5 * 60 * 1000);

class MovieApp {
  constructor() {
    this.mainWindow = null;
    this.adBlocker = null;
  }

  async createWindow() {
    this.mainWindow = new BrowserWindow({
      ...APP_CONFIG.WINDOW,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, 'assets', 'movie.ico'),
      title: "Каталог фильмов",
      show: false
    });

    this.mainWindow.once('ready-to-show', () => this.mainWindow.show());
    this.mainWindow.on('maximize', () => this.mainWindow.webContents.send('window-maximized'));
    this.mainWindow.on('unmaximize', () => this.mainWindow.webContents.send('window-unmaximized'));
    this.mainWindow.on('close', () => cache.clear());

    await this.initializeAdBlocker();
    await this.mainWindow.loadFile('src/renderer/index.html');
    this.mainWindow.setMenuBarVisibility(false);

    if (process.argv.includes('--debug')) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  async initializeAdBlocker() {
    try {
      this.adBlocker = await ElectronBlocker.fromLists(fetch, [
        'https://cdn.jsdelivr.net/gh/dimisa-RUAdList/RUAdListCDN@main/lists/ruadlist.ubo.min.txt',
      ], {
        enableCompression: true,
        loadNetworkFilters: true,
      });

      const blockAds = store.get('blockAds', true);
      if (blockAds && this.adBlocker) {
        this.adBlocker.enableBlockingInSession(session.defaultSession);
      }
    } catch (error) {
      console.error('AdBlocker initialization failed:', error);
    }
  }
}

class ApiService {
  constructor() {
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  }

  async makeRequest(url, params = {}, options = {}) {
    const cacheKey = `req_${url}_${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await this.axiosInstance.get(url, { params, ...options });
      const result = { success: true, data: response.data };
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        code: error.code
      };
    }
  }

  async getMovieList(params = {}) {
    const defaultParams = {
      token: APP_CONFIG.API_TOKEN,
      limit: params.limit || 12,
      page: params.page || 1
    };
    return await this.makeRequest(`${APP_CONFIG.API_BASE}/list`, { ...defaultParams, ...params });
  }

  async getMovieDetails(params) {
    return await this.makeRequest(
      `${APP_CONFIG.API_BASE}/franchise/details`,
      { token: APP_CONFIG.API_TOKEN, ...params },
      { timeout: 8000 }
    );
  }

  async getNews(params = {}) {
    const requestedLimit = parseInt(params.limit, 10) || 20;
    const limit = Math.max(20, Math.min(500, requestedLimit));
    const defaultParams = {
      token: APP_CONFIG.API_TOKEN,
      limit,
      page: params.page || 1,
      format: params.format || 'json',
      ...params
    };

    // Ensure we don't pass a lower-than-min limit
    defaultParams.limit = limit;

    return await this.makeRequest(`${APP_CONFIG.API_BASE}/video/news`, defaultParams, { timeout: 8000 });
  }
}

class UpdateService {
  constructor() {
    this.GITHUB_REPO = 'zhivem/FlickTap';
    this.VERSION_URL = 'https://raw.githubusercontent.com/zhivem/FlickTap/main/version.json';
    this.RELEASES_URL = 'https://github.com/zhivem/FlickTap/releases';
    this.versionFilePath = path.join(path.dirname(__dirname), 'version.json');
  }

  async getCurrentVersion() {
    try {
      const data = await fs.readFile(this.versionFilePath, 'utf-8');
      const versionData = JSON.parse(data);
      return versionData.version || '1.0.0';
    } catch (error) {
      console.error('Failed to read local version:', error);
      return '1.0.0';
    }
  }

  async checkForUpdates() {
    try {
      const response = await fetch(this.VERSION_URL, { timeout: 5000 });
      if (!response.ok) {
        return { hasUpdate: false, error: 'Failed to fetch version' };
      }

      const remoteData = await response.json();
      const remoteVersion = remoteData.version;

      // Get current version from local version.json
      const currentVersion = await this.getCurrentVersion();

      if (this.isNewerVersion(remoteVersion, currentVersion)) {
        return {
          hasUpdate: true,
          currentVersion,
          remoteVersion,
          releasesUrl: this.RELEASES_URL
        };
      }

      return { hasUpdate: false };
    } catch (error) {
      console.error('Update check failed:', error);
      return { hasUpdate: false, error: error.message };
    }
  }

  isNewerVersion(remote, current) {
    // Simple semver comparison: 1.0.5 vs 1.0.4
    const remoteArr = remote.split('.').map(Number);
    const currentArr = current.split('.').map(Number);

    for (let i = 0; i < Math.max(remoteArr.length, currentArr.length); i++) {
      const r = remoteArr[i] || 0;
      const c = currentArr[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  }
}

class SettingsService {
  constructor() {}

  getSettings() {
    return {
      blockAds: store.get('blockAds', true),
      autoStart: app.getLoginItemSettings().openAtLogin,
      useKinopoiskPosters: store.get('useKinopoiskPosters', true),
      theme: store.get('theme', 'dark')
    };
  }

  async setBlockAds(enabled, adBlocker) {
    try {
      store.set('blockAds', enabled);
      await session.defaultSession.clearCache();
      if (enabled && !adBlocker) {
        return { success: true };
      } else if (!enabled && adBlocker) {
        adBlocker.disableBlockingInSession(session.defaultSession);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

    async clearAllCache() {
      try {
        cache.clear();
        
        await session.defaultSession.clearCache();
        
        await session.defaultSession.clearStorageData();
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

  async setAutoStart(enabled) {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: []
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setKinopoiskPosters(enabled) {
    try {
      store.set('useKinopoiskPosters', enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setTheme(theme) {
    try {
      const validThemes = ['light', 'dark', 'system'];
      if (!validThemes.includes(theme)) {
        return { success: false, error: 'Invalid theme value' };
      }
      store.set('theme', theme);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

const movieApp = new MovieApp();
const apiService = new ApiService();
const settingsService = new SettingsService();
const updateService = new UpdateService();

const ipcHandlers = {
  'window-minimize': () => movieApp.mainWindow.minimize(),
  'window-maximize': () => {
    movieApp.mainWindow.isMaximized() 
      ? movieApp.mainWindow.unmaximize() 
      : movieApp.mainWindow.maximize();
  },
  'window-close': () => movieApp.mainWindow.close(),
  'get-movie-list': (_, params) => apiService.getMovieList(params),
  'get-movie-details': (_, params) => apiService.getMovieDetails(params),
  'get-news': (_, params) => apiService.getNews(params),
  'open-external-url': async (_, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL' };
  },
  'get-settings': () => settingsService.getSettings(),
  'set-block-ads': (_, enabled) => settingsService.setBlockAds(enabled, movieApp.adBlocker),
  'set-auto-start': (_, enabled) => settingsService.setAutoStart(enabled),
  'set-kinopoisk-posters': (_, enabled) => settingsService.setKinopoiskPosters(enabled),
  'set-theme': (_, theme) => settingsService.setTheme(theme),
  'clear-cache': () => settingsService.clearAllCache(),
  'check-updates': () => updateService.checkForUpdates() 
};

Object.entries(ipcHandlers).forEach(([channel, handler]) => {
  ipcMain.handle(channel, handler);
});

app.whenReady().then(() => movieApp.createWindow());

app.on('before-quit', () => {
  cache.clear();
  movieApp.mainWindow?.removeAllListeners();
  movieApp.mainWindow = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    movieApp.createWindow();
  }
});