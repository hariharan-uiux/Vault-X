const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readLocalCatalog: (filePath) => ipcRenderer.invoke('catalog:read-local', filePath),
  saveLocalCatalog: (filePath, data) => ipcRenderer.invoke('catalog:save-local', { filePath, data }),
  getInstalledState: (apps) => ipcRenderer.invoke('catalog:get-installed-state', apps),
  installApp: (appItem) => ipcRenderer.invoke('app:install', appItem),
  launchApp: (command, appName, appId) => ipcRenderer.invoke('app:launch', { command, appName, appId }),
  updateApp: (appItem) => ipcRenderer.invoke('app:update', appItem),
  uninstallApp: (appId, appName) => ipcRenderer.invoke('app:uninstall', { appId, appName }),
  onInstallProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('app:install-progress', handler);
    return () => ipcRenderer.removeListener('app:install-progress', handler);
  },
  openExternalUrl: (url) => ipcRenderer.invoke('system:open-url', url),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  checkForLauncherUpdates: () => ipcRenderer.invoke('updater:check'),
  applyLauncherUpdate: (updateInfo) => ipcRenderer.invoke('updater:apply', updateInfo),
  onUpdaterProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
  listRepos: () => ipcRenderer.invoke('repos:list'),
  inspectRepo: (input) => ipcRenderer.invoke('repos:inspect', input),
  addRepo: (input) => ipcRenderer.invoke('repos:add', input),
  removeRepo: (appId) => ipcRenderer.invoke('repos:remove', appId),
});
