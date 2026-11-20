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

// Persistent store for repositories the user added by URL
const getCustomAppsFile = () => path.join(app.getPath('userData'), 'custom-apps.json');

function readCustomApps() {
  try {
    const file = getCustomAppsFile();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to read custom-apps.json:', e);
  }
  return [];
}

function saveCustomApps(list) {
  try {
    const file = getCustomAppsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to save custom-apps.json:', e);
    return false;
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

// Accepts "owner/repo", a full github.com URL, or just "repo" (defaults to user's account).
function normalizeRepoInput(input, defaultOwner = 'hariharan-uiux') {
  if (!input || typeof input !== 'string') return null;
  let value = input.trim();
  value = value.replace(/^git@github\.com:/i, '');
  value = value.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
  value = value.replace(/^github\.com\//i, '');
  value = value.split(/[?#]/)[0];
  value = value.replace(/\.git$/i, '').replace(/\/+$/, '');
  const parts = value.split('/').filter(Boolean);
  if (parts.length === 1 && /^[\w.-]+$/.test(parts[0])) {
    return `${defaultOwner}/${parts[0]}`;
  }
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1];
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return `${owner}/${repo}`;
}

// "vault-x-v1.2.0", "relay-v1.0.7" and "v1.2.3" all resolve to "1.2.0" style versions.
function versionFromTag(tag) {
  if (!tag) return '';
  const match = String(tag).match(/(\d+\.\d+(?:\.\d+)?)/);
  if (match) return match[1];
  return String(tag).replace(/^[vV]/, '').trim();
}

function githubJson(url) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Vault-X',
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
    req.setTimeout(20000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function queryGitHubRelease(githubRepo) {
  const cleanRepo = normalizeRepoInput(githubRepo);
  if (!cleanRepo) return null;
  return githubJson(`https://api.github.com/repos/${cleanRepo}/releases/latest`);
}

async function queryGitHubReleases(githubRepo, limit = 12) {
  const cleanRepo = normalizeRepoInput(githubRepo);
  if (!cleanRepo) return [];
  const list = await githubJson(`https://api.github.com/repos/${cleanRepo}/releases?per_page=${limit}`);
  return Array.isArray(list) ? list : [];
}

// Pick the best downloadable file for this machine from a release asset list.
function pickAssetForPlatform(assets) {
  const list = (assets || []).filter((a) => a && a.name);
  if (process.platform === 'win32') {
    const exes = list.filter((a) => /\.exe$/i.test(a.name) && !/\.blockmap$/i.test(a.name));
    return (
      exes.find((a) => /setup|install/i.test(a.name)) ||
      exes[0] ||
      list.find((a) => /\.msi$/i.test(a.name)) ||
      list.find((a) => /\.zip$/i.test(a.name)) ||
      null
    );
  }
  if (process.platform === 'linux') {
    return (
      list.find((a) => /\.appimage$/i.test(a.name)) ||
      list.find((a) => /\.deb$/i.test(a.name)) ||
      list.find((a) => /\.tar\.gz$/i.test(a.name)) ||
      null
    );
  }
  return list.find((a) => /\.dmg$/i.test(a.name)) || list.find((a) => /\.zip$/i.test(a.name)) || null;
}

function prettyRepoName(name) {
  if (!name) return name;
  // "clack-windows" -> "Clack Windows"; leave names that already use capitals.
  if (/[A-Z]/.test(name)) return name;
  return name
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildAppFromRepo(repoInfo, release) {
  const fullName = repoInfo?.full_name || repoInfo?.repo || '';
  const [owner, repoName] = fullName.split('/');
  const latestVersion = versionFromTag(release?.tag_name || '');
  const asset = pickAssetForPlatform(release?.assets);
  const id = `gh-${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  const app = {
    id,
    name: prettyRepoName(repoInfo?.name || repoName || fullName),
    description: repoInfo?.description || release?.name || `GitHub project ${fullName}`,
    icon: 'Package',
    category: 'My Repos',
    tags: ['GitHub', 'Added by you'],
    version: latestVersion || '0.0.0',
    installedVersion: null,
    status: 'not_installed',
    author: repoInfo?.owner?.login || owner || 'GitHub',
    size: asset ? `${(asset.size / 1024 / 1024).toFixed(0)} MB` : '—',
    homepage: repoInfo?.html_url || `https://github.com/${fullName}`,
    github: fullName,
    releaseNotes: release?.body || '',
    releaseUrl: release?.html_url || `https://github.com/${fullName}/releases`,
    source: 'custom',
    installTargets: {},
  };

  if (asset) {
    const target = {
      type: /\.msi$/i.test(asset.name) ? 'msi' : 'exe',
      command: asset.name,
      downloadUrl: asset.browser_download_url,
    };
    if (process.platform === 'win32') app.installTargets.windows = target;
    else if (process.platform === 'darwin') app.installTargets.macos = target;
    else app.installTargets.linux = target;
  }

  return app;
}

// ---------- Windows install helpers ----------

function runProcess(file, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(file, args, { stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(new Error(`${file} did not finish within ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code);
    });
  });
}

const normalizeAppName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Reads the Windows "Programs and Features" registry list, newest-agnostic.
function listWindowsUninstallEntries() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);

    const script = [
      "$paths = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
      "$items = Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName,DisplayVersion,InstallLocation,DisplayIcon,UninstallString,PSChildName",
      "if ($items) { $items | ConvertTo-Json -Compress }",
    ].join('; ');

    const scriptPath = path.join(app.getPath('temp'), `vaultx-registry-${process.pid}.ps1`);
    try {
      fs.writeFileSync(scriptPath, script, 'utf-8');
    } catch {
      return resolve([]);
    }

    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { maxBuffer: 8 * 1024 * 1024, windowsHide: true, timeout: 30000 },
      (err, stdout) => {
        try { fs.unlinkSync(scriptPath); } catch {}
        if (err || !stdout) return resolve([]);
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function exeFromInstallDir(dir, appName) {
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    const exes = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.exe$/i.test(e.name) && !/unins|uninstall|update|setup|crash/i.test(e.name))
      .map((e) => path.join(dir, e.name));
    if (!exes.length) return null;
    const wanted = normalizeAppName(appName);
    return (
      exes.find((p) => normalizeAppName(path.basename(p, '.exe')) === wanted) ||
      exes.find((p) => normalizeAppName(path.basename(p, '.exe')).includes(wanted) && wanted.length > 2) ||
      exes[0]
    );
  } catch {
    return null;
  }
}

function pickInstallEntry(entries, beforeKeys, appName, version) {
  const wanted = normalizeAppName(appName);
  const scored = (entries || [])
    .map((entry) => {
      const name = normalizeAppName(entry.DisplayName);
      let score = 0;
      if (name === wanted) score += 100;
      else if (wanted.length > 2 && (name.includes(wanted) || wanted.includes(name))) score += 60;
      if (entry.DisplayVersion && version && versionFromTag(entry.DisplayVersion) === version) score += 30;
      if (!beforeKeys.has(entry.PSChildName)) score += 25;
      if (entry.InstallLocation) score += 10;
      return { entry, score };
    })
    .filter((item) => item.score >= 50)
    .sort((a, b) => b.score - a.score);

  return scored.length ? scored[0].entry : null;
}

function resolveEntryExecutable(entry, appName) {
  if (!entry) return null;

  const icon = String(entry.DisplayIcon || '').replace(/^"|"$/g, '').split(',')[0].trim();
  if (/\.exe$/i.test(icon) && fs.existsSync(icon)) return icon;

  const fromLocation = exeFromInstallDir(entry.InstallLocation, appName);
  if (fromLocation) return fromLocation;

  const fromIconDir = icon ? exeFromInstallDir(path.dirname(icon), appName) : null;
  if (fromIconDir) return fromIconDir;

  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
  ].filter(Boolean);
  const wanted = normalizeAppName(appName);

  for (const root of roots) {
    const direct = path.join(root, appName);
    const directExe = exeFromInstallDir(direct, appName);
    if (directExe) return directExe;
    try {
      const match = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && normalizeAppName(e.name).includes(wanted))
        .map((e) => path.join(root, e.name))[0];
      const exe = exeFromInstallDir(match, appName);
      if (exe) return exe;
    } catch {}
  }

  return null;
}

async function installWindowsPackage(installerFile, appName, version) {
  const before = await listWindowsUninstallEntries();
  const beforeKeys = new Set(before.map((e) => e.PSChildName));

  if (/\.msi$/i.test(installerFile)) {
    await runProcess('msiexec.exe', ['/i', installerFile, '/qn', '/norestart']);
  } else {
    await runProcess(installerFile, ['/S']);
  }

  // NSIS/MSI write their uninstall entry just after the process exits.
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const after = await listWindowsUninstallEntries();
  const entry = pickInstallEntry(after, beforeKeys, appName, version);
  const executablePath = resolveEntryExecutable(entry, appName);

  return {
    executablePath,
    installLocation: entry?.InstallLocation || (executablePath ? path.dirname(executablePath) : null),
    uninstallString: entry?.UninstallString || null,
    displayName: entry?.DisplayName || appName,
  };
}

async function runUninstaller(uninstallString) {
  if (!uninstallString) return false;
  const match = String(uninstallString).match(/"([^"]+)"|^(\S+\.exe)/i);
  const exe = match ? match[1] || match[2] : null;
  if (!exe || !fs.existsSync(exe)) return false;
  try {
    await runProcess(exe, ['/S'], 3 * 60 * 1000);
    return true;
  } catch (e) {
    console.warn('Could not run uninstaller silently:', e.message);
    return false;
  }
}

// Removes the previous copy of an app after a successful upgrade.
async function removePreviousInstall(previous, newExecutablePath, appId, keepFileName) {
  const appDir = path.join(getInstalledAppsDir(), appId);
  const keep = keepFileName ? path.resolve(path.join(appDir, keepFileName)) : null;
  const installedPath = newExecutablePath ? path.resolve(newExecutablePath) : null;

  // Drop older cached installers / old portable builds in our own folder only.
  try {
    for (const name of fs.readdirSync(appDir)) {
      const full = path.resolve(path.join(appDir, name));
      if (full === keep || full === installedPath) continue;
      if (/setup|install|\.appimage$/i.test(name)) {
        try { fs.rmSync(full, { force: true }); } catch {}
      }
    }
  } catch {}

  if (!previous) return;
  const oldExe = previous.executablePath;
  if (!oldExe || !fs.existsSync(oldExe)) return;

  const oldDir = path.resolve(path.dirname(oldExe));
  const newDir = newExecutablePath ? path.resolve(path.dirname(newExecutablePath)) : null;
  if (newDir && oldDir.toLowerCase() === newDir.toLowerCase()) return; // upgraded in place

  if (previous.uninstallString) {
    await runUninstaller(previous.uninstallString);
  }

  // Only delete folders we created ourselves; never touch user program folders.
  if (fs.existsSync(oldDir) && oldDir.toLowerCase().startsWith(path.resolve(getInstalledAppsDir()).toLowerCase())) {
    try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch {}
  }
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

    const githubRepo = normalizeRepoInput(appItem.github) || appItem.github;
    const previous = getInstalledRecord()[appId] || null;
    const release = githubRepo ? await queryGitHubRelease(githubRepo) : null;

    let targetAsset = null;
    let targetVersion = versionFromTag(appItem.version) || appItem.version || '1.0.0';

    if (release && release.tag_name) {
      targetVersion = versionFromTag(release.tag_name);
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
    let installed = null;

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

      // On Windows the downloaded file is an installer, not the app itself.
      // Run it silently, then remember the real executable it installed.
      if (process.platform === 'win32' && /\.(exe|msi)$/i.test(targetAsset.name)) {
        sendProgress(96, `Installing ${appItem.name} v${targetVersion} on this PC...`);
        try {
          installed = await installWindowsPackage(destFile, appItem.name, targetVersion);
        } catch (err) {
          return { ok: false, error: `Installer failed: ${err.message}` };
        }
        if (installed?.executablePath) {
          executablePath = installed.executablePath;
        }
      }
    } else if (githubRepo) {
      return {
        ok: false,
        error: `The latest ${appItem.name} release has no installer for ${process.platform}.`,
      };
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

    sendProgress(97, 'Removing the previous version...');
    await removePreviousInstall(previous, executablePath, appId, targetAsset?.name);

    sendProgress(100, `${appItem.name} v${targetVersion} installed successfully!`);

    const record = getInstalledRecord();
    record[appId] = {
      status: 'installed',
      installedVersion: targetVersion,
      executablePath,
      installLocation: installed?.installLocation || (executablePath ? path.dirname(executablePath) : null),
      uninstallString: installed?.uninstallString || null,
      installedAt: new Date().toISOString(),
    };
    saveInstalledRecord(record);

    return {
      ok: true,
      version: targetVersion,
      executablePath,
      installLocation: record[appId].installLocation,
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
      const info = record[targetId] || null;

      // Remove the real installed copy first (Program Files / LocalAppData).
      if (info?.uninstallString) {
        await runUninstaller(info.uninstallString);
      } else if (info?.executablePath && fs.existsSync(info.executablePath)) {
        const exeDir = path.dirname(info.executablePath);
        try {
          const uninstaller = fs
            .readdirSync(exeDir)
            .find((name) => /^unins.*\.exe$/i.test(name) || /^uninstall.*\.exe$/i.test(name));
          if (uninstaller) await runUninstaller(`"${path.join(exeDir, uninstaller)}"`);
        } catch {}
      }

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

  // ---------- User-added GitHub repositories ----------

  ipcMain.handle('repos:list', async () => {
    return { ok: true, apps: readCustomApps() };
  });

  ipcMain.handle('repos:inspect', async (_, input) => {
    const fullName = normalizeRepoInput(input);
    if (!fullName) {
      return { ok: false, error: 'That does not look like a GitHub repository link.' };
    }

    const [repoInfo, releases] = await Promise.all([
      githubJson(`https://api.github.com/repos/${fullName}`),
      queryGitHubReleases(fullName),
    ]);

    if (!repoInfo && !releases.length) {
      return {
        ok: false,
        error: `Could not read ${fullName}. Check the link, or that the repository is public.`,
      };
    }

    const published = releases.filter((r) => !r.draft);
    const latest = published.find((r) => !r.prerelease) || published[0] || null;
    const app = buildAppFromRepo(repoInfo || { full_name: fullName }, latest);

    return {
      ok: true,
      app,
      repo: fullName,
      releases: published.map((r) => ({
        tag: r.tag_name,
        name: r.name,
        publishedAt: r.published_at,
        prerelease: !!r.prerelease,
        htmlUrl: r.html_url,
        notes: r.body,
        asset: pickAssetForPlatform(r.assets)?.name || null,
      })),
    };
  });

  ipcMain.handle('repos:add', async (_, input) => {
    const fullName = normalizeRepoInput(input);
    if (!fullName) {
      return { ok: false, error: 'That does not look like a GitHub repository link.' };
    }

    const [repoInfo, releases] = await Promise.all([
      githubJson(`https://api.github.com/repos/${fullName}`),
      queryGitHubReleases(fullName),
    ]);

    if (!repoInfo && !releases.length) {
      return { ok: false, error: `Could not read ${fullName} from GitHub.` };
    }

    const published = releases.filter((r) => !r.draft);
    const latest = published.find((r) => !r.prerelease) || published[0] || null;
    const app = buildAppFromRepo(repoInfo || { full_name: fullName }, latest);

    const list = readCustomApps().filter((a) => a.github !== app.github);
    list.push(app);
    if (!saveCustomApps(list)) {
      return { ok: false, error: 'Could not save the repository list.' };
    }

    return { ok: true, app, apps: list };
  });

  ipcMain.handle('repos:remove', async (_, appId) => {
    const list = readCustomApps().filter((a) => a.id !== appId);
    if (!saveCustomApps(list)) {
      return { ok: false, error: 'Could not update the repository list.' };
    }
    return { ok: true, apps: list };
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
