const { contextBridge, ipcRenderer } = require('electron');

const createApiMethod = (methodName) => (...args) => ipcRenderer.invoke(methodName, ...args);

const electronAPI = {
  // Window controls
  minimizeWindow: createApiMethod('window-minimize'),
  toggleMaximizeWindow: createApiMethod('window-maximize'),
  closeWindow: createApiMethod('window-close'),
  
  // Movie API
  getMovieList: createApiMethod('get-movie-list'),
  getMovieDetails: createApiMethod('get-movie-details'),
  getNews: createApiMethod('get-news'),
  
  // External
  openExternalUrl: createApiMethod('open-external-url'),
  openExternal: createApiMethod('open-external-url'),
  
  // Settings
  getSettings: createApiMethod('get-settings'),
  setBlockAds: createApiMethod('set-block-ads'),
  setAutoStart: createApiMethod('set-auto-start'),
  setKinopoiskPosters: createApiMethod('set-kinopoisk-posters'),
  setTheme: createApiMethod('set-theme'),
  clearCache: createApiMethod('clear-cache'),
  
  // Updates
  checkUpdates: createApiMethod('check-updates'),
  getVersion: createApiMethod('get-version'),
  
  // Events
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
  removeWindowMaximizedListener: (callback) => ipcRenderer.removeListener('window-maximized', callback),
  removeWindowUnmaximizedListener: (callback) => ipcRenderer.removeListener('window-unmaximized', callback),
  
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('window-maximized');
    ipcRenderer.removeAllListeners('window-unmaximized');
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

window.addEventListener('beforeunload', () => {
  electronAPI.removeAllListeners();
});