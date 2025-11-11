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
  }

  async makeRequest(url, params = {}, options = {}) {
    try {
      const response = await axios.get(url, {
        params,
        timeout: options.timeout || 15000,
        headers: options.headers || {},
        ...options
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
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
      { timeout: 10000 }
    );
  }

  async getKinopoiskRatings(kinopoiskId) {
    const result = await this.makeRequest(
      `https://rating.kinopoisk.ru/${kinopoiskId}.xml`,
      {},
      {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!result.success) return result;

    const kpMatch = result.data.match(/<kp_rating[^>]*>([^<]*)<\/kp_rating>/);
    const imdbMatch = result.data.match(/<imdb_rating[^>]*>([^<]*)<\/imdb_rating>/);
    
    return {
      success: true,
      data: {
        kinopoisk: kpMatch?.[1] || null,
        imdb: imdbMatch?.[1] || null
      }
    };
  }

  async getTmdbId(kinopoiskId) {
    const result = await this.makeRequest(
      `https://api.apbugall.org/`,
      {
        token: 'b156e6d24abe787bc067a873c04975',
        kp: kinopoiskId
      },
      {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!result.success) return result;

    try {
      const data = result.data;
      if (data.status === 'success' && data.data && data.data.id_tmdb) {
        return { success: true, data: { tmdbId: data.data.id_tmdb } };
      }
      return { success: false, error: 'TMDB ID not found' };
    } catch (error) {
      return { success: false, error: 'Failed to parse TMDB API response' };
    }
  }

  async getTmdbPoster(tmdbId, mediaType = 'movie') {
    try {
      const response = await axios.get(
        `${this.config.TMDB_BASE_URL}/${mediaType}/${tmdbId}`,
        {
          params: {
            api_key: this.config.TMDB_API_KEY,
            language: 'ru-RU'
          },
          timeout: 10000
        }
      );

      const posterPath = response.data.poster_path;
      if (posterPath) {
        return {
          success: true,
          data: {
            posterUrl: `${this.config.TMDB_IMAGE_BASE}${posterPath}`
          }
        };
      }
      return { success: false, error: 'Poster not found in TMDB' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getTmdbPosterByKinopoiskId(kinopoiskId, mediaType) {
    const tmdbResult = await this.getTmdbId(kinopoiskId);
    if (!tmdbResult.success) {
      return tmdbResult;
    }
    return await this.getTmdbPoster(tmdbResult.data.tmdbId, mediaType);
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
      highQualityPosters: this.store.get('highQualityPosters', false)
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
}

// Initialize services
const movieApp = new MovieApp();
const apiService = new ApiService(movieApp.config);
const settingsService = new SettingsService(store, app);

// IPC Handlers
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
  'get-kinopoisk-ratings': (_, kinopoiskId) => apiService.getKinopoiskRatings(kinopoiskId),
  'get-tmdb-poster': (_, { kinopoiskId, mediaType }) => 
    apiService.getTmdbPosterByKinopoiskId(kinopoiskId, mediaType),
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
  'set-high-quality-posters': (_, enabled) => settingsService.setHighQualityPosters(enabled)
};

Object.entries(ipcHandlers).forEach(([channel, handler]) => {
  ipcMain.handle(channel, handler);
});

app.whenReady().then(() => movieApp.createWindow());

app.on('before-quit', () => {
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