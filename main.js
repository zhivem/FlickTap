import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import Store from 'electron-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
app.disableHardwareAcceleration();

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
    this.config = this.getConfig();
  }

  getConfig() {
    return {
      API_TOKEN: "API",
      API_BASE: "API",
      TMDB_API_KEY: "API",
      TMDB_BASE_URL: "API",
      TMDB_IMAGE_BASE: "API",
      WINDOW: {
        width: 1200,
        height: 750,
        minWidth: 1200,
        minHeight: 750,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0f0f0f'
      }
    };
  }

  async createWindow() {
    this.mainWindow = new BrowserWindow({
      ...this.config.WINDOW,
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

    this.mainWindow.on('close', () => {
      cache.clear();
    });

    await this.initializeAdBlocker();
    await this.mainWindow.loadFile('index.html');
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
  constructor(config) {
    this.config = config;
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
      const response = await this.axiosInstance.get(url, {
        params,
        ...options
      });
      
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
      token: this.config.API_TOKEN,
      limit: params.limit || 12,
      page: params.page || 1
    };
    return await this.makeRequest(`${this.config.API_BASE}/list`, { ...defaultParams, ...params });
  }

  async getMovieDetails(params) {
    return await this.makeRequest(
      `${this.config.API_BASE}/franchise/details`,
      { token: this.config.API_TOKEN, ...params },
      { timeout: 8000 }
    );
  }

  async getTmdbId(kinopoiskId) {
    const cacheKey = `tmdb_id_${kinopoiskId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.makeRequest(
      `https://api.apbugall.org/`,
      {
        token: 'b156e6d24abe787bc067a873c04975',
        kp: kinopoiskId
      },
      { timeout: 5000 }
    );

    if (!result.success) return result;

    try {
      const data = result.data;
      if (data.status === 'success' && data.data && data.data.id_tmdb) {
        const tmdbResult = { success: true, data: { tmdbId: data.data.id_tmdb } };
        cache.set(cacheKey, tmdbResult);
        return tmdbResult;
      }
      return { success: false, error: 'TMDB ID not found' };
    } catch (error) {
      return { success: false, error: 'Failed to parse TMDB API response' };
    }
  }

  async getTmdbData(kinopoiskId, dataType = 'poster', mediaType = 'movie') {
    const cacheKey = `tmdb_${dataType}_${kinopoiskId}_${mediaType}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const tmdbResult = await this.getTmdbId(kinopoiskId);
      if (!tmdbResult.success) {
        return tmdbResult;
      }

      const response = await this.axiosInstance.get(
        `${this.config.TMDB_BASE_URL}/${mediaType}/${tmdbResult.data.tmdbId}`,
        {
          params: {
            api_key: this.config.TMDB_API_KEY,
            language: 'ru-RU'
          }
        }
      );

      let resultData = null;
      
      if (dataType === 'poster') {
        const posterPath = response.data.poster_path;
        if (posterPath) {
          resultData = {
            success: true,
            data: {
              posterUrl: `${this.config.TMDB_IMAGE_BASE}${posterPath}`
            }
          };
        }
      } else if (dataType === 'description') {
        const description = response.data.overview;
        if (description && description.trim() !== '') {
          resultData = {
            success: true,
            data: {
              description: description,
              source: 'tmdb'
            }
          };
        }
      }

      if (resultData) {
        cache.set(cacheKey, resultData);
        return resultData;
      }
      
      return { success: false, error: `${dataType} not found in TMDB` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getTmdbPoster(kinopoiskId, mediaType = 'movie') {
    return this.getTmdbData(kinopoiskId, 'poster', mediaType);
  }

  async getTmdbDescription(kinopoiskId, mediaType = 'movie') {
    return this.getTmdbData(kinopoiskId, 'description', mediaType);
  }
}

class SettingsService {
  constructor(store, app) {
    this.store = store;
    this.app = app;
  }

  getSettings() {
    return {
      blockAds: this.store.get('blockAds', true),
      autoStart: this.app.getLoginItemSettings().openAtLogin,
      highQualityPosters: this.store.get('highQualityPosters', false),
      useTmdbDescriptions: this.store.get('useTmdbDescriptions', true)
    };
  }

  async setBlockAds(enabled, adBlocker) {
    try {
      this.store.set('blockAds', enabled);
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

  setAutoStart(enabled) {
    try {
      this.app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: []
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  setHighQualityPosters(enabled) {
    try {
      this.store.set('highQualityPosters', enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  setUseTmdbDescriptions(enabled) {
    try {
      this.store.set('useTmdbDescriptions', enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

const movieApp = new MovieApp();
const apiService = new ApiService(movieApp.config);
const settingsService = new SettingsService(store, app);

const ipcHandlers = {
  'window-minimize': () => movieApp.mainWindow.minimize(),
  'window-maximize': () => {
    if (movieApp.mainWindow.isMaximized()) {
      movieApp.mainWindow.unmaximize();
    } else {
      movieApp.mainWindow.maximize();
    }
  },
  'window-close': () => movieApp.mainWindow.close(),
  'get-movie-list': (_, params) => apiService.getMovieList(params),
  'get-movie-details': (_, params) => apiService.getMovieDetails(params),
  'get-tmdb-poster': (_, { kinopoiskId, mediaType }) => 
    apiService.getTmdbPoster(kinopoiskId, mediaType),
  'get-tmdb-description': (_, { kinopoiskId, mediaType }) =>
    apiService.getTmdbDescription(kinopoiskId, mediaType),
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
  'set-high-quality-posters': (_, enabled) => settingsService.setHighQualityPosters(enabled),
  'set-use-tmdb-descriptions': (_, enabled) => settingsService.setUseTmdbDescriptions(enabled),
  'clear-cache': () => {
    cache.clear();
    return { success: true };
  }
};

Object.entries(ipcHandlers).forEach(([channel, handler]) => {
  ipcMain.handle(channel, handler);
});

app.whenReady().then(() => movieApp.createWindow());

app.on('before-quit', () => {
  cache.clear();
  if (movieApp.mainWindow) {
    movieApp.mainWindow.removeAllListeners();
    movieApp.mainWindow = null;
  }
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