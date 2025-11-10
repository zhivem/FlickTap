const { contextBridge, ipcRenderer } = require('electron');

/**
 * Electron API exposed to renderer process.
 * Handles IPC communication securely.
 */
const electronAPI = {
  // Movie data fetching
  getMovieList: (params) => ipcRenderer.invoke('get-movie-list', params),
  getMovieDetails: (params) => ipcRenderer.invoke('get-movie-details', params),
  getKinopoiskRatings: (kinopoiskId) => ipcRenderer.invoke('get-kinopoisk-ratings', kinopoiskId),

  // External actions
  openTrailer: (url) => ipcRenderer.invoke('open-trailer', url),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setBlockAds: (enabled) => ipcRenderer.invoke('set-block-ads', enabled),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // Window events
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
  removeWindowMaximizedListener: (callback) => ipcRenderer.removeListener('window-maximized', callback),
  removeWindowUnmaximizedListener: (callback) => ipcRenderer.removeListener('window-unmaximized', callback),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);