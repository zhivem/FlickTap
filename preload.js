const { contextBridge, ipcRenderer } = require('electron');

const createApiMethod = (methodName) => (...args) => ipcRenderer.invoke(methodName, ...args);

const electronAPI = {
  minimizeWindow: createApiMethod('window-minimize'),
  toggleMaximizeWindow: createApiMethod('window-maximize'),
  closeWindow: createApiMethod('window-close'),
  
  getMovieList: createApiMethod('get-movie-list'),
  getMovieDetails: createApiMethod('get-movie-details'),
  getTmdbPoster: createApiMethod('get-tmdb-poster'),
  getTmdbDescription: createApiMethod('get-tmdb-description'),
  
  openExternalUrl: createApiMethod('open-external-url'),
  
  getSettings: createApiMethod('get-settings'),
  setBlockAds: createApiMethod('set-block-ads'),
  setAutoStart: createApiMethod('set-auto-start'),
  setHighQualityPosters: createApiMethod('set-high-quality-posters'),
  setUseTmdbDescriptions: createApiMethod('set-use-tmdb-descriptions'),
  clearCache: createApiMethod('clear-cache'),
  
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