import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import Store from 'electron-store';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
app.disableHardwareAcceleration();

let mainWindow;

const CONFIG = {
    API_TOKEN: process.env.API_TOKEN,
    API_BASE: process.env.API_BASE,
    ALT_API_TOKEN: process.env.ALT_API_TOKEN,
    ALT_API_BASE: process.env.ALT_API_BASE,
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

function validateConfig() {
    const required = ['API_TOKEN', 'API_BASE', 'ALT_API_TOKEN', 'ALT_API_BASE'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Отсутствуют обязательные переменные окружения:', missing.join(', '));
        console.log('💡 Создайте файл .env на основе .env.example');
        app.quit();
        return false;
    }
    
    console.log('✅ Все переменные окружения загружены');
    return true;
}

async function createWindow() {
    if (!validateConfig()) return;
    mainWindow = new BrowserWindow({
        ...CONFIG.WINDOW,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'movie.png'),
        title: "Каталог фильмов",
        show: false 
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized'));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-unmaximized'));

    await initializeAdBlocker();
    mainWindow.loadFile('index.html');
    mainWindow.setMenuBarVisibility(false);

    if (process.argv.includes('--debug')) {
        mainWindow.webContents.openDevTools();
    }
}

async function initializeAdBlocker() {
    try {
        const blocker = await ElectronBlocker.fromLists(fetch, [
            'https://cdn.jsdelivr.net/gh/dimisa-RUAdList/RUAdListCDN@main/lists/ruadlist.ubo.min.txt',
        ], {
            enableCompression: true,
            loadNetworkFilters: true,
        });

        const blockAds = store.get('blockAds', true);
        if (blockAds) {
            blocker.enableBlockingInSession(session.defaultSession);
        }
    } catch (error) {
        console.error('AdBlocker error:', error);
    }
}

async function apiRequest(url, params = {}, options = {}) {
    try {
        const response = await axios.get(url, {
            params,
            timeout: options.timeout || 15000,
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

async function getAlternativePlayer(kinopoiskId) {
    const result = await apiRequest(CONFIG.ALT_API_BASE, {
        api_token: CONFIG.ALT_API_TOKEN,
        kinopoisk_id: kinopoiskId
    }, { timeout: 10000 });

    if (!result.success) return result;

    const videoData = result.data?.data?.[0];
    if (videoData?.iframe_src && videoData.iframe_src !== 'null') {
        return { 
            success: true, 
            data: { iframe_url: videoData.iframe_src } 
        };
    }
    
    return { success: false, error: 'Ссылка на плеер не найдена' };
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

const ipcHandlers = {
    'window-minimize': () => mainWindow.minimize(),
    'window-maximize': () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(),
    'window-close': () => mainWindow.close(),
    'get-movie-list': (_, params) => getMovieList(params),
    'get-movie-details': (_, params) => getMovieDetails(params),
    'get-alternative-player': (_, kinopoiskId) => getAlternativePlayer(kinopoiskId),
    'get-kinopoisk-ratings': (_, kinopoiskId) => getKinopoiskRatings(kinopoiskId),
    'open-trailer': async (_, url) => {
        if (url && url !== 'null') await shell.openExternal(url);
        return { success: true };
    },
    'open-external-url': async (_, url) => {
        if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
            await shell.openExternal(url);
            return { success: true };
        }
        return { success: false, error: 'Недопустимый URL' };
    },
    'get-settings': () => ({ blockAds: store.get('blockAds', true) }),
    'set-block-ads': async (_, enabled) => {
        store.set('blockAds', enabled);
        await session.defaultSession.clearCache();
        if (enabled) initializeAdBlocker();
        return { success: true };
    }
};

Object.entries(ipcHandlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });