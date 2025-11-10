const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
	getMovieList: (params) => ipcRenderer.invoke('get-movie-list', params),
	getMovieDetails: (params) => ipcRenderer.invoke('get-movie-details', params),
	getKinopoiskRatings: (kinopoiskId) => ipcRenderer.invoke('get-kinopoisk-ratings', kinopoiskId),
	openTrailer: (url) => ipcRenderer.invoke('open-trailer', url),
	openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
	getSettings: () => ipcRenderer.invoke('get-settings'),
	setBlockAds: (enabled) => ipcRenderer.invoke('set-block-ads', enabled),
	minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
	toggleMaximizeWindow: () => ipcRenderer.invoke('window-maximize'),
	closeWindow: () => ipcRenderer.invoke('window-close'),
	onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
	onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
	removeWindowMaximizedListener: (callback) => ipcRenderer.removeListener('window-maximized', callback),
	removeWindowUnmaximizedListener: (callback) => ipcRenderer.removeListener('window-unmaximized', callback)
};
contextBridge.exposeInMainWorld('electronAPI', electronAPI);