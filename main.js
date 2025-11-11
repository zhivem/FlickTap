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

let mainWindow;
let adBlocker = null;

const CONFIG = {
  API_TOKEN: "API",
  API_BASE: "API",
  TMDB_API_KEY: "API",
  TMDB_BASE_URL: "API",
  TMDB_IMAGE_BASE: "API",
  WINDOW: {
    width: 1200,
    height: 700,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f'
  }
};

async function createWindow() {
  mainWindow = new BrowserWindow({
    ...CONFIG.WINDOW,
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

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-unmaximized'));

  await initializeAdBlocker();
  await mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  if (process.argv.includes('--debug')) {
    mainWindow.webContents.openDevTools();
  }
}

async function initializeAdBlocker() {
  try {
    adBlocker = await ElectronBlocker.fromLists(fetch, [
      'https://cdn.jsdelivr.net/gh/dimisa-RUAdList/RUAdListCDN@main/lists/ruadlist.ubo.min.txt',
    ], {
      enableCompression: true,
      loadNetworkFilters: true,
    });

    const blockAds = store.get('blockAds', true);
    if (blockAds && adBlocker) {
      adBlocker.enableBlockingInSession(session.defaultSession);
    }
  } catch (error) {
    console.error('AdBlocker initialization failed');
  }
}

async function apiRequest(url, params = {}, options = {}) {
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

async function getMovieList(params = {}) {
  const defaultParams = {
    token: CONFIG.API_TOKEN,
    limit: params.limit || 12,
    page: params.page || 1
  };
  return await apiRequest(`${CONFIG.API_BASE}/list`, { ...defaultParams, ...params });
}

async function getMovieDetails(params) {
  return await apiRequest(`${CONFIG.API_BASE}/franchise/details`, 
    { token: CONFIG.API_TOKEN, ...params }, 
    { timeout: 10000 }
  );
}

async function getKinopoiskRatings(kinopoiskId) {
  const result = await apiRequest(`https://rating.kinopoisk.ru/${kinopoiskId}.xml`, 
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

async function getTmdbId(kinopoiskId) {
  const result = await apiRequest(`https://api.apbugall.org/`, 
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
    } else {
      return { success: false, error: 'TMDB ID not found' };
    }
  } catch (error) {
    return { success: false, error: 'Failed to parse TMDB API response' };
  }
}

async function getTmdbPoster(tmdbId, mediaType = 'movie') {
  try {
    const response = await axios.get(
      `${CONFIG.TMDB_BASE_URL}/${mediaType}/${tmdbId}`,
      {
        params: {
          api_key: CONFIG.TMDB_API_KEY,
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
          posterUrl: `${CONFIG.TMDB_IMAGE_BASE}${posterPath}`
        } 
      };
    } else {
      return { success: false, error: 'Poster not found in TMDB' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const ipcHandlers = {
  'window-minimize': () => mainWindow.minimize(),
  'window-maximize': () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  },
  'window-close': () => mainWindow.close(),
  'get-movie-list': (_, params) => getMovieList(params),
  'get-movie-details': (_, params) => getMovieDetails(params),
  'get-kinopoisk-ratings': (_, kinopoiskId) => getKinopoiskRatings(kinopoiskId),
  'get-tmdb-poster': async (_, { kinopoiskId, mediaType }) => {
    const tmdbResult = await getTmdbId(kinopoiskId);
    if (!tmdbResult.success) {
      return tmdbResult;
    }

    const posterResult = await getTmdbPoster(tmdbResult.data.tmdbId, mediaType);
    return posterResult;
  },
  'open-external-url': async (_, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL' };
  },
  'get-settings': () => ({
    blockAds: store.get('blockAds', true),
    autoStart: app.getLoginItemSettings().openAtLogin,
    highQualityPosters: store.get('highQualityPosters', false)
  }),
  'set-block-ads': async (_, enabled) => {
    try {
      store.set('blockAds', enabled);
      await session.defaultSession.clearCache();
      if (enabled && !adBlocker) {
        await initializeAdBlocker();
      } else if (!enabled && adBlocker) {
        adBlocker.disableBlockingInSession(session.defaultSession);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  'set-auto-start': async (_, enabled) => {
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
  },
  'set-high-quality-posters': async (_, enabled) => {
    try {
      store.set('highQualityPosters', enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

Object.entries(ipcHandlers).forEach(([channel, handler]) => {
  ipcMain.handle(channel, handler);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});