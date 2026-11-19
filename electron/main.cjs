const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, exec } = require('child_process');

// Optimize memory and CPU footprint
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

let mainWindow = null;
let isQuitting = false;
let userSettings = {
  runInBackground: true,
  autoUpdate: true,
  startOnBoot: false,
  minimizeToTray: true,
};
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 780,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#09090b',
    title: 'Vault X',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = 'http://localhost:3300';
  const prodIndex = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    mainWindow.loadURL(devUrl).catch(() => {
      if (fs.existsSync(prodIndex)) {
        mainWindow.loadFile(prodIndex);
      }
    });
  } else if (fs.existsSync(prodIndex)) {
    mainWindow.loadFile(prodIndex);
  } else {
    mainWindow.loadURL(devUrl);
  }

  mainWindow.on('close', (event) => {
    if (userSettings.runInBackground && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Track when app is truly quitting
app.on('before-quit', () => {
  isQuitting = true;
});

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Persistent local installed apps store
const getInstalledAppsFile = () => path.join(app.getPath('userData'), 'installed-apps.json');
const getInstalledAppsDir = () => path.join(app.getPath('userData'), 'installed-apps');

function getInstalledRecord() {
  try {
    const file = getInstalledAppsFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to read installed-apps.json:', e);
  }
  return {};
}

function saveInstalledRecord(record) {
  try {
    const file = getInstalledAppsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save installed-apps.json:', e);
  }
}

function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    function request(currentUrl, redirects = 0) {
      if (redirects > 5) {
        return reject(new Error('Too many redirects while downloading'));
      }

      const client = currentUrl.startsWith('https') ? https : http;
      const req = client.get(
        currentUrl,
        {
          headers: {
            'User-Agent': 'Vault-X/1.1.0',
            Accept: 'application/octet-stream, */*',
          },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return request(res.headers.location, redirects + 1);
          }

          if (res.statusCode !== 200) {
            file.destroy();
            fs.unlink(destPath, () => {});
            return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            file.write(chunk);
            if (totalBytes > 0 && onProgress) {
              const percent = (receivedBytes / totalBytes) * 100;
              onProgress(percent, receivedBytes, totalBytes);
            }
          });

          res.on('end', () => {
            file.end();
            resolve();
          });

          res.on('error', (err) => {
            file.destroy();
            fs.unlink(destPath, () => {});
            reject(err);
          });
        }
      );

      req.on('error', (err) => {
        file.destroy();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    request(url);
  });
}

async function queryGitHubRelease(githubRepo) {
  return new Promise((resolve) => {
    const cleanRepo = githubRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '').trim();
    if (!cleanRepo || !cleanRepo.includes('/')) {
      return resolve(null);
    }

    const url = `https://api.github.com/repos/${cleanRepo}/releases/latest`;
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Vault-X/1.1.0',
          Accept: 'application/vnd.github.v3+json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
  });
}

function setupIpc() {
  // Read local catalog file
  ipcMain.handle('catalog:read-local', async (_, filePath) => {
    try {
      const target = filePath || path.join(__dirname, '../public/apps.json');
      const content = fs.readFileSync(target, 'utf-8');
      return { ok: true, data: JSON.parse(content) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Save local catalog file
  ipcMain.handle('catalog:save-local', async (_, { filePath, data }) => {
    try {
      const target = filePath || path.join(__dirname, '../public/apps.json');
      fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf-8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Check true installed state from disk
  ipcMain.handle('catalog:get-installed-state', async () => {
    try {
      const record = getInstalledRecord();
      const valid = {};
      for (const [id, info] of Object.entries(record)) {
        if (info && info.executablePath && fs.existsSync(info.executablePath)) {
          valid[id] = {
            status: 'installed',
            installedVersion: info.installedVersion || '1.0.0',
            executablePath: info.executablePath,
            installedAt: info.installedAt,
          };
        }
      }
      return { ok: true, installed: valid };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Prefer a real installer over a portable build when a release ships both.
  function pickWindowsAsset(assets) {
    const exes = (assets || []).filter((a) => /\.exe$/i.test(a.name) && !a.name.includes('blockmap'));
    return exes.find((a) => /setup|install/i.test(a.name)) || exes[0] ||
      (assets || []).find((a) => a.name.endsWith('.msi') || a.name.endsWith('.zip'));
  }

  // Handle install / update logic
  async function performInstall(appItem, actionName = 'installing') {
    const appId = appItem.id || 'relay';
    const appDir = path.join(getInstalledAppsDir(), appId);
    fs.mkdirSync(appDir, { recursive: true });

    const sendProgress = (progress, statusText) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:install-progress', {
          appId,
          progress: Math.min(100, Math.max(0, Math.round(progress))),
          statusText,
          action: actionName,
        });
      }
    };

    sendProgress(5, `Querying GitHub releases for ${appItem.name}...`);

    const githubRepo = appItem.github || 'hariharan-uiux/Relay';
    const release = await queryGitHubRelease(githubRepo);

    let targetAsset = null;
    let targetVersion = appItem.version || '1.0.0';

    if (release && release.tag_name) {
      targetVersion = release.tag_name.replace(/^[vV]/, '').trim();
      const assets = release.assets || [];

      if (process.platform === 'linux') {
        targetAsset =
          assets.find((a) => a.name.endsWith('.AppImage') || a.name.endsWith('.appimage')) ||
          assets.find((a) => a.name.endsWith('.deb') || a.name.endsWith('.tar.gz'));
      } else if (process.platform === 'win32') {
        targetAsset = pickWindowsAsset(assets);
      } else if (process.platform === 'darwin') {
        targetAsset = assets.find((a) => a.name.endsWith('.dmg') || a.name.endsWith('.zip'));
      }
    }

    let executablePath = null;

    if (targetAsset && targetAsset.browser_download_url) {
      sendProgress(15, `Downloading ${targetAsset.name} from GitHub...`);
      const destFile = path.join(appDir, targetAsset.name);

      await downloadFileWithProgress(
        targetAsset.browser_download_url,
        destFile,
        (percent, received, total) => {
          const mappedProgress = 15 + percent * 0.8;
          const mbReceived = (received / 1024 / 1024).toFixed(1);
          const mbTotal = (total / 1024 / 1024).toFixed(1);
          sendProgress(
            mappedProgress,
            `Downloading ${targetAsset.name}: ${mbReceived}MB / ${mbTotal}MB (${Math.round(percent)}%)`
          );
        }
      );

      executablePath = destFile;
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(destFile, 0o755);
        } catch (e) {
          console.warn('Could not chmod executable:', e);
        }
      }
    } else {
      // Local fallback if GitHub release assets are not yet published
      const localRelayCandidates = [
        path.join(__dirname, '../../relay'),
        path.join(__dirname, '../../Relay'),
        '/var/lib/openbot/OpenBot/Shared/repos/relay',
        '/var/lib/openbot/OpenBot/Shared/repos/Relay',
      ];
      const localRepo = localRelayCandidates.find((p) => fs.existsSync(p));

      if (localRepo) {
        sendProgress(25, 'Found local Relay repository. Configuring standalone launcher...');
        await new Promise((r) => setTimeout(r, 200));

        sendProgress(60, 'Creating executable launcher script...');
        const isWindows = process.platform === 'win32';
        const scriptName = isWindows ? 'relay-launcher.cmd' : 'relay-launcher.sh';
        const scriptPath = path.join(appDir, scriptName);

        if (isWindows) {
          fs.writeFileSync(scriptPath, `@echo off\r\ncd /d "${localRepo}"\r\ncall npm start\r\n`, 'utf-8');
        } else {
          fs.writeFileSync(
            scriptPath,
            `#!/usr/bin/env bash\ncd "${localRepo}"\nif command -v electron >/dev/null 2>&1; then\n  exec electron . "$@"\nelse\n  exec npm start "$@"\nfi\n`,
            'utf-8'
          );
          fs.chmodSync(scriptPath, 0o755);
        }

        executablePath = scriptPath;
        sendProgress(90, 'Configuring permissions and local storage...');
        await new Promise((r) => setTimeout(r, 150));
      } else {
        return {
          ok: false,
          error: `No release assets found on GitHub for ${githubRepo} and local repository was not found.`,
        };
      }
    }

    sendProgress(100, `${appItem.name} v${targetVersion} installed successfully!`);

    const record = getInstalledRecord();
    record[appId] = {
      status: 'installed',
      installedVersion: targetVersion,
      executablePath,
      installedAt: new Date().toISOString(),
    };
    saveInstalledRecord(record);

    return {
      ok: true,
      version: targetVersion,
      executablePath,
    };
  }

  // Real App Install
  ipcMain.handle('app:install', async (_, appItem) => {
    try {
      return await performInstall(appItem, 'installing');
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Real App Update
  ipcMain.handle('app:update', async (_, appItem) => {
    try {
      return await performInstall(appItem, 'updating');
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Real App Launch
  ipcMain.handle('app:launch', async (_, { command, appName, appId }) => {
    return new Promise((resolve) => {
      const record = getInstalledRecord();
      const targetId = appId || (appName ? appName.toLowerCase() : 'relay');
      const appInfo = record[targetId];

      let execPath = appInfo?.executablePath;
      if (!execPath || !fs.existsSync(execPath)) {
        execPath = command;
      }

      if (!execPath) {
        return resolve({ ok: false, error: `No executable found for ${appName || targetId}` });
      }

      try {
        if (fs.existsSync(execPath)) {
          const child = spawn(execPath, [], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          resolve({ ok: true, message: `Launched ${appName || targetId}` });
        } else {
          const child = exec(execPath, (err) => {
            if (err) console.error(`Error launching ${appName}:`, err);
          });
          child.unref();
          resolve({ ok: true, message: `Launched ${appName || targetId}` });
        }
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });
  });

  // Real App Uninstall
  ipcMain.handle('app:uninstall', async (_, { appId }) => {
    try {
      const targetId = appId || 'relay';
      const record = getInstalledRecord();
      const appDir = path.join(getInstalledAppsDir(), targetId);

      if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
      }

      delete record[targetId];
      saveInstalledRecord(record);

      return { ok: true, message: `Uninstalled ${targetId}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Open external URL
  ipcMain.handle('system:open-url', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // System info
  ipcMain.handle('system:info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
    };
  });

  // Settings IPC
  ipcMain.handle('settings:get', async () => {
    return { ok: true, settings: userSettings };
  });

  ipcMain.handle('settings:set', async (_, newSettings) => {
    userSettings = { ...userSettings, ...newSettings };
    if (typeof newSettings.startOnBoot === 'boolean') {
      try {
        app.setLoginItemSettings({ openAtLogin: newSettings.startOnBoot });
      } catch (e) {
        console.error('Error updating login item settings:', e);
      }
    }
    return { ok: true, settings: userSettings };
  });

  // Semver comparison helper
  function compareSemver(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const cleanA = a.replace(/^vault-x-v/i, '').replace(/^[vV]/, '').trim();
    const cleanB = b.replace(/^vault-x-v/i, '').replace(/^[vV]/, '').trim();
    const partsA = cleanA.split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
    const partsB = cleanB.split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(partsA.length, partsB.length, 3);
    for (let i = 0; i < len; i++) {
      const numA = partsA[i] ?? 0;
      const numB = partsB[i] ?? 0;
      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }
    return 0;
  }

  // Launcher updater check
  ipcMain.handle('updater:check', async () => {
    try {
      const currentVersion = app.getVersion();
      const release = await queryGitHubRelease('hariharan-uiux/Vault-X');
      if (!release || !release.tag_name) {
        return {
          ok: true,
          currentVersion,
          latestVersion: currentVersion,
          hasUpdate: false,
          upToDate: true,
          message: 'Could not fetch releases from GitHub',
        };
      }

      const rawTag = release.tag_name;
      const latestVersion = rawTag.replace(/^vault-x-v/i, '').replace(/^[vV]/, '').trim();
      const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

      let targetAsset = null;
      const assets = release.assets || [];
      if (process.platform === 'win32') {
        targetAsset = pickWindowsAsset(assets);
      } else if (process.platform === 'linux') {
        targetAsset =
          assets.find((a) => a.name.endsWith('.AppImage') || a.name.endsWith('.appimage')) ||
          assets.find((a) => a.name.endsWith('.deb') || a.name.endsWith('.tar.gz'));
      } else if (process.platform === 'darwin') {
        targetAsset = assets.find((a) => a.name.endsWith('.dmg') || a.name.endsWith('.zip'));
      }

      return {
        ok: true,
        currentVersion,
        latestVersion,
        hasUpdate,
        upToDate: !hasUpdate,
        releaseName: release.name || `Vault X v${latestVersion}`,
        releaseNotes: release.body || '',
        releaseUrl: release.html_url,
        publishedAt: release.published_at,
        asset: targetAsset
          ? {
              name: targetAsset.name,
              size: targetAsset.size,
              downloadUrl: targetAsset.browser_download_url,
            }
          : null,
        message: hasUpdate
          ? `Vault X v${latestVersion} is available`
          : `Vault X is up to date (v${currentVersion})`,
      };
    } catch (err) {
      console.error('Error checking Vault X updates:', err);
      return {
        ok: false,
        error: err.message,
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        hasUpdate: false,
        upToDate: true,
      };
    }
  });

  // Launcher updater apply (download, install new version, clean up previous version)
  ipcMain.handle('updater:apply', async (_, updateInfo) => {
    try {
      const sendProgress = (progress, statusText, bytesReceived = 0, totalBytes = 0) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:progress', {
            progress: Math.min(100, Math.max(0, Math.round(progress))),
            statusText,
            bytesReceived,
            totalBytes,
          });
        }
      };

      sendProgress(5, 'Querying latest Vault X release package...');

      let asset = updateInfo?.asset;
      let targetVersion = updateInfo?.latestVersion;

      if (!asset || !asset.downloadUrl) {
        const release = await queryGitHubRelease('hariharan-uiux/Vault-X');
        if (!release) {
          throw new Error('Unable to connect to GitHub releases.');
        }
        targetVersion = (release.tag_name || '').replace(/^vault-x-v/i, '').replace(/^[vV]/, '').trim();
        const assets = release.assets || [];
        let matched = null;
        if (process.platform === 'win32') {
          matched = pickWindowsAsset(assets);
        } else if (process.platform === 'linux') {
          matched = assets.find((a) => a.name.endsWith('.AppImage') || a.name.endsWith('.deb') || a.name.endsWith('.tar.gz'));
        } else if (process.platform === 'darwin') {
          matched = assets.find((a) => a.name.endsWith('.dmg'));
        }
        if (matched) {
          asset = {
            name: matched.name,
            size: matched.size,
            downloadUrl: matched.browser_download_url,
          };
        }
      }

      if (asset && asset.downloadUrl) {
        // Cache the installer so a second click does not download 100+ MB again.
        const cacheDir = path.join(app.getPath('userData'), 'updates');
        fs.mkdirSync(cacheDir, { recursive: true });
        const destFile = path.join(cacheDir, asset.name);
        const expectedSize = Number(asset.size) || 0;
        const cachedSize = fs.existsSync(destFile) ? fs.statSync(destFile).size : 0;
        const isCached = cachedSize > 1024 * 1024 && (!expectedSize || cachedSize === expectedSize);

        if (isCached) {
          sendProgress(85, `Reusing the installer downloaded earlier (${asset.name}).`);
        } else {
          if (cachedSize) {
            try { fs.rmSync(destFile, { force: true }); } catch {}
          }
          sendProgress(15, `Downloading ${asset.name}...`);
          await downloadFileWithProgress(asset.downloadUrl, destFile, (percent, received, total) => {
            const mappedProgress = 15 + percent * 0.75;
            const mbReceived = (received / 1024 / 1024).toFixed(1);
            const mbTotal = (total / 1024 / 1024).toFixed(1);
            sendProgress(
              mappedProgress,
              `Downloading ${asset.name}: ${mbReceived}MB / ${mbTotal}MB (${Math.round(percent)}%)`,
              received,
              total
            );
          });
          const downloadedSize = fs.existsSync(destFile) ? fs.statSync(destFile).size : 0;
          if (downloadedSize < 1024 * 1024) {
            throw new Error('The downloaded installer is incomplete. Please try again.');
          }
        }

        sendProgress(95, 'Installer ready. Closing Vault X to apply the update...');

        if (process.platform === 'win32') {
          if (!app.isPackaged) {
            return {
              ok: false,
              error: `Installer ready at ${destFile}. Close Vault X and run it manually to update this development build.`,
            };
          }
          // Quit BEFORE the silent installer runs: a running app keeps its files locked,
          // which made the installer do nothing and the old version reappear.
          isQuitting = true;
          const quoted = destFile.replace(/"/g, '""');
          const launcher = spawn(
            'cmd.exe',
            ['/c', `ping 127.0.0.1 -n 4 > nul & start "" "${quoted}" /S --updated`],
            { detached: true, stdio: 'ignore', windowsHide: true }
          );
          launcher.on('error', (e) => console.error('Failed to start the installer:', e));
          launcher.unref();

          sendProgress(100, 'Installing the update. Vault X will reopen automatically...');
          setTimeout(() => app.exit(0), 800);
          return { ok: true, message: 'Installing the update. Vault X will reopen automatically...' };
        } else if (process.platform === 'linux') {
          try {
            fs.chmodSync(destFile, 0o755);
          } catch (e) {
            console.warn('Could not chmod:', e);
          }
          if (destFile.endsWith('.AppImage')) {
            // Replace the running AppImage so the new version actually sticks.
            const runningImage = process.env.APPIMAGE;
            if (runningImage && fs.existsSync(runningImage)) {
              try {
                fs.copyFileSync(destFile, runningImage);
                fs.chmodSync(runningImage, 0o755);
              } catch (e) {
                console.warn('Could not replace the AppImage in place:', e);
              }
            }
            const child = spawn(runningImage || destFile, [], { detached: true, stdio: 'ignore' });
            child.unref();
            isQuitting = true;
            setTimeout(() => app.exit(0), 800);
            return { ok: true, message: 'Updated Vault X. Restarting...' };
          }
        }
        return { ok: true, message: `Update downloaded to ${destFile}` };
      } else {
        // Fallback for git-managed or local workspace installations
        const repoDir = path.resolve(__dirname, '..');
        const gitDir = path.join(repoDir, '.git');
        if (fs.existsSync(gitDir)) {
          sendProgress(40, 'Updating local workspace from GitHub master...');
          await new Promise((resolve, reject) => {
            exec('git pull origin master && npm run build', { cwd: repoDir }, (err, stdout, stderr) => {
              if (err) return reject(new Error(stderr || err.message));
              resolve(stdout);
            });
          });
          sendProgress(100, 'Vault X updated to latest release. Restarting application...');
          setTimeout(() => {
            app.relaunch();
            app.exit(0);
          }, 1500);
          return { ok: true, message: 'Updated to latest release and restarted.' };
        }

        return {
          ok: false,
          error: 'No direct installer asset available for this platform on GitHub.',
        };
      }
    } catch (err) {
      console.error('Update apply error:', err);
      return { ok: false, error: err.message };
    }
  });
}
