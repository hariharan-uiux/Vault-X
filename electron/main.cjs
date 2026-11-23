const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
    show: false,
  });

  mainWindow.removeMenu();

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
    Menu.setApplicationMenu(null);
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
          let lastProgressTime = 0;
          let lastReportedPercent = -1;

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            file.write(chunk);
            if (totalBytes > 0 && onProgress) {
              const now = Date.now();
              const percent = (receivedBytes / totalBytes) * 100;
              // Throttle IPC events to at most once every 80ms or on whole percent changes
              if (now - lastProgressTime >= 80 || receivedBytes >= totalBytes || Math.floor(percent) > lastReportedPercent) {
                lastProgressTime = now;
                lastReportedPercent = Math.floor(percent);
                onProgress(percent, receivedBytes, totalBytes);
              }
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
  const list = (assets || []).filter((a) => a && a.name && !/\.blockmap$/i.test(a.name));
  const isArm = process.arch === 'arm64';

  if (process.platform === 'win32') {
    const exes = list.filter((a) => /\.exe$/i.test(a.name));
    const msis = list.filter((a) => /\.msi$/i.test(a.name));
    const candidates = [...exes, ...msis];
    if (!candidates.length) return list.find((a) => /\.zip$/i.test(a.name)) || null;

    const scored = candidates.map((asset) => {
      const name = asset.name.toLowerCase();
      let score = 0;
      const hasArm = /arm64|aarch64|armv7|arm/i.test(name);
      const hasX64 = /x64|x86_64|amd64|win64/i.test(name);
      const hasX86 = /ia32|x86|win32/i.test(name);
      const isSetup = /setup|install/i.test(name);

      if (isArm) {
        if (hasArm) score += 100;
        else if (!hasX64 && !hasX86) score += 50;
        else score -= 150;
      } else {
        // x64 machine (standard Windows PC)
        if (hasArm) score -= 200; // Heavily penalize ARM binaries on x64 PC!
        else if (hasX64) score += 100; // Strongly prefer explicit x64
        else if (!hasX86) score += 80; // Universal or general setup (e.g. Clack-1.2.0-setup.exe)
        else score += 40; // 32-bit x86 fallback
      }

      if (isSetup) score += 20;
      return { asset, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.asset || candidates[0];
  }

  if (process.platform === 'linux') {
    const appimages = list.filter((a) => /\.appimage$/i.test(a.name));
    const filtered = appimages.filter((a) => (isArm ? /arm64|aarch64/i.test(a.name) : !/arm64|aarch64/i.test(a.name)));
    return (
      filtered[0] ||
      appimages[0] ||
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

  // Check if this application is already installed on the local system
  try {
    const existingExe = findShortcutTarget(app.name) || findProgramDirectoryExe(app.name);
    if (existingExe && fs.existsSync(existingExe)) {
      app.status = 'installed';
      app.installedVersion = latestVersion || '1.0.0';
      app.executablePath = existingExe;
    }
  } catch {}

  return app;
}

// ---------- Windows install helpers ----------

function runProcess(file, args, timeoutMs = 10 * 60 * 1000, hideWindow = false) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(file, args, { stdio: 'ignore', windowsHide: hideWindow });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      resolve(-1);
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.warn(`[runProcess] Failed to execute ${file}:`, err.message);
      resolve(-1);
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(typeof code === 'number' ? code : 0);
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

function findShortcutTarget(appName) {
  if (process.platform !== 'win32') return null;
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.PROGRAMDATA && path.join(process.env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'Desktop'),
    process.env.PUBLIC && path.join(process.env.PUBLIC, 'Desktop'),
  ].filter(Boolean);

  const wanted = normalizeAppName(appName);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            queue.push(full);
          } else if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
            const base = normalizeAppName(path.basename(entry.name, '.lnk'));
            if (base === wanted || (wanted.length > 2 && (base.includes(wanted) || wanted.includes(base)))) {
              try {
                const info = shell.readShortcutLink(full);
                if (
                  info?.target &&
                  fs.existsSync(info.target) &&
                  /\.exe$/i.test(info.target) &&
                  !/unins|uninstall|setup/i.test(info.target)
                ) {
                  return info.target;
                }
              } catch {}
            }
          }
        }
      }
    } catch {}
  }
  return null;
}

function findProgramDirectoryExe(appName) {
  if (process.platform !== 'win32') return null;
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
  ].filter(Boolean);

  const wanted = normalizeAppName(appName);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const candidates = fs.readdirSync(root, { withFileTypes: true });
      for (const item of candidates) {
        if (!item.isDirectory()) continue;
        const base = normalizeAppName(item.name);
        if (base === wanted || (wanted.length > 2 && (base.includes(wanted) || wanted.includes(base)))) {
          const dir = path.join(root, item.name);
          const found = exeFromInstallDir(dir, appName);
          if (found) return found;
        }
      }
    } catch {}
  }
  return null;
}

// Discover applications already installed on this machine (e.g. after Vault X is reinstalled)
function discoverSystemInstalledApps() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return [];
  const programsDir = path.join(process.env.LOCALAPPDATA, 'Programs');
  if (!fs.existsSync(programsDir)) return [];

  const discovered = [];
  try {
    const entries = fs.readdirSync(programsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderName = entry.name;
      // Skip vault-x itself
      if (/vault-?x/i.test(folderName)) continue;

      const fullDirPath = path.join(programsDir, folderName);
      const exe = exeFromInstallDir(fullDirPath, folderName);
      if (exe && fs.existsSync(exe)) {
        const id = `local-${folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const name = prettyRepoName(folderName);
        discovered.push({
          id,
          name,
          description: `Installed on this computer (${folderName})`,
          icon: 'Package',
          category: 'My Repos',
          tags: ['Installed on PC', 'Detected'],
          version: '1.0.0',
          installedVersion: '1.0.0',
          status: 'installed',
          author: 'Local PC',
          size: '—',
          executablePath: exe,
          source: 'custom',
          installTargets: {},
        });
      }
    }
  } catch (e) {
    console.warn('Error discovering system apps:', e);
  }
  return discovered;
}

async function installWindowsPackage(installerFile, appName, version) {
  // 1. Unblock file from Windows SmartScreen
  try {
    await new Promise((res) => {
      exec(
        `powershell -NoProfile -Command "Unblock-File -LiteralPath '${installerFile.replace(/'/g, "''")}'"`,
        { timeout: 10000 },
        () => res()
      );
    });
  } catch {}

  const isSetupOrMsi = /setup|install|\.msi$/i.test(path.basename(installerFile));
  if (!isSetupOrMsi) {
    // Standalone portable executable: already ready to run!
    return {
      executablePath: installerFile,
      installLocation: path.dirname(installerFile),
      uninstallString: null,
      displayName: appName,
    };
  }

  const before = await listWindowsUninstallEntries();
  const beforeKeys = new Set(before.map((e) => e.PSChildName));

  // 2. Execute installer
  if (/\.msi$/i.test(installerFile)) {
    await runProcess('msiexec.exe', ['/i', installerFile, '/qn', '/norestart'], 5 * 60 * 1000, false);
  } else {
    // Try NSIS silent flag first (visible so UAC can be shown if needed)
    let exitCode = await runProcess(installerFile, ['/S'], 60000, false);
    if (exitCode !== 0) {
      // Try InnoSetup silent flags
      exitCode = await runProcess(
        installerFile,
        ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'],
        60000,
        false
      );
    }
    if (exitCode !== 0) {
      // If silent install was blocked or unsupported, launch installer interactively
      await runProcess(installerFile, [], 10 * 60 * 1000, false);
    }
  }

  // Allow Windows to complete writing shortcuts / uninstall entries
  await new Promise((resolve) => setTimeout(resolve, 2500));

  // 3. Resolve the installed executable
  // Priority A: Start Menu / Desktop shortcuts
  const shortcutTarget = findShortcutTarget(appName);
  if (shortcutTarget) {
    return {
      executablePath: shortcutTarget,
      installLocation: path.dirname(shortcutTarget),
      uninstallString: null,
      displayName: appName,
    };
  }

  // Priority B: Registry Programs & Features entry
  const after = await listWindowsUninstallEntries();
  const entry = pickInstallEntry(after, beforeKeys, appName, version);
  const fromRegistry = resolveEntryExecutable(entry, appName);
  if (fromRegistry) {
    return {
      executablePath: fromRegistry,
      installLocation: entry?.InstallLocation || path.dirname(fromRegistry),
      uninstallString: entry?.UninstallString || null,
      displayName: entry?.DisplayName || appName,
    };
  }

  // Priority C: Standard Program directories
  const fromProgramDir = findProgramDirectoryExe(appName);
  if (fromProgramDir) {
    return {
      executablePath: fromProgramDir,
      installLocation: path.dirname(fromProgramDir),
      uninstallString: null,
      displayName: appName,
    };
  }

  return {
    executablePath: installerFile,
    installLocation: path.dirname(installerFile),
    uninstallString: null,
    displayName: appName,
  };
}

function removeAppShortcuts(appName) {
  if (process.platform !== 'win32' || !appName) return;
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.PROGRAMDATA && path.join(process.env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'Desktop'),
    process.env.PUBLIC && path.join(process.env.PUBLIC, 'Desktop'),
  ].filter(Boolean);

  const wanted = normalizeAppName(appName);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const walk = (d) => {
        for (const item of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, item.name);
          if (item.isDirectory()) {
            walk(full);
          } else if (item.isFile() && /\.lnk$/i.test(item.name)) {
            const base = normalizeAppName(path.basename(item.name, '.lnk'));
            if (base === wanted || (wanted.length > 2 && (base.includes(wanted) || wanted.includes(base)))) {
              try { fs.unlinkSync(full); } catch {}
            }
          }
        }
      };
      walk(root);
    } catch {}
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

  // Check true installed state from disk and scan system for already installed apps
  ipcMain.handle('catalog:get-installed-state', async (_, appsToCheck = []) => {
    try {
      const record = getInstalledRecord();
      const valid = {};
      let didUpdateRecord = false;

      // 1. Verify any entries already saved in record
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

      // 2. Aggregate apps to check: custom apps stored on disk + apps passed from UI
      const customApps = readCustomApps();
      const allApps = [...customApps];
      if (Array.isArray(appsToCheck)) {
        for (const a of appsToCheck) {
          if (a && a.id && !allApps.some((x) => x.id === a.id)) {
            allApps.push(a);
          }
        }
      }

      // 3. Scan the system to recognize apps already installed on the machine
      let registryEntries = null;

      for (const app of allApps) {
        if (valid[app.id]) continue;

        const name = app.name || app.id;
        let detected = findShortcutTarget(name);
        if (!detected) {
          detected = findProgramDirectoryExe(name);
        }

        let detectedVersion = null;
        if (!detected && process.platform === 'win32') {
          if (!registryEntries) {
            registryEntries = await listWindowsUninstallEntries();
          }
          const match = registryEntries.find((e) => {
            const n = normalizeAppName(e.DisplayName);
            const wanted = normalizeAppName(name);
            return n === wanted || (wanted.length > 2 && (n.includes(wanted) || wanted.includes(n)));
          });
          if (match) {
            detectedVersion = match.DisplayVersion ? versionFromTag(match.DisplayVersion) : null;
            detected = resolveEntryExecutable(match, name);
          }
        }

        if (detected && fs.existsSync(detected)) {
          const finalVersion = detectedVersion || app.installedVersion || app.version || '1.0.0';
          valid[app.id] = {
            status: 'installed',
            installedVersion: finalVersion,
            executablePath: detected,
            installedAt: new Date().toISOString(),
          };
          record[app.id] = {
            ...valid[app.id],
          };
          didUpdateRecord = true;
        }
      }

      // 4. Auto-discover system apps if custom apps list is empty (e.g. fresh install after uninstaller)
      const discoveredApps = [];
      if (customApps.length === 0 && process.platform === 'win32') {
        const systemDiscovered = discoverSystemInstalledApps();
        for (const disc of systemDiscovered) {
          discoveredApps.push(disc);
          valid[disc.id] = {
            status: 'installed',
            installedVersion: disc.installedVersion || '1.0.0',
            executablePath: disc.executablePath,
            installedAt: new Date().toISOString(),
          };
          record[disc.id] = {
            ...valid[disc.id],
          };
          didUpdateRecord = true;
        }
        if (discoveredApps.length > 0) {
          saveCustomApps(discoveredApps);
        }
      }

      if (didUpdateRecord) {
        saveInstalledRecord(record);
      }

      return { ok: true, installed: valid, discoveredApps };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Prefer a real installer over a portable build and match architecture.
  function pickWindowsAsset(assets) {
    return pickAssetForPlatform(assets);
  }

  // Handle install / update logic
  async function performInstall(appItem, actionName = 'installing') {
    const appId = appItem.id;
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
      sendProgress(15, `Downloading ${appItem.name}...`);
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
            `Downloading ${appItem.name}: ${mbReceived}MB / ${mbTotal}MB (${Math.round(percent)}%)`
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

      // On Windows: unblock the downloaded file to prevent Windows SmartScreen blocks
      if (process.platform === 'win32') {
        try {
          await new Promise((res) => {
            exec(
              `powershell -NoProfile -Command "Unblock-File -LiteralPath '${destFile.replace(/'/g, "''")}'"`,
              { timeout: 10000 },
              () => res()
            );
          });
        } catch {}

        const isInstaller = /setup|install|\.msi$/i.test(targetAsset.name);
        if (isInstaller) {
          sendProgress(95, `Opening ${appItem.name} setup wizard on your screen...`);
          try {
            if (/\.msi$/i.test(destFile)) {
              exec(`msiexec.exe /i "${destFile}"`);
            } else {
              await shell.openPath(destFile);
            }
          } catch (e) {
            spawn(destFile, [], { detached: true });
          }

          sendProgress(100, `Setup wizard opened! Complete the installation on your screen.`);

          // Look for any existing or immediately created shortcut / program directory
          const detected = findShortcutTarget(appItem.name) || findProgramDirectoryExe(appItem.name);

          const record = getInstalledRecord();
          record[appId] = {
            status: 'installed',
            installedVersion: targetVersion,
            installerPath: destFile,
            executablePath: detected || null,
            installedAt: new Date().toISOString(),
          };
          saveInstalledRecord(record);

          return {
            ok: true,
            version: targetVersion,
            executablePath: detected || null,
            message: `Setup wizard opened! Complete installation on your screen.`,
          };
        }
      }
    } else {
      return {
        ok: false,
        error: `No release installer assets found on GitHub for ${appItem.name} (${process.platform}).`,
      };
    }

    sendProgress(100, `${appItem.name} v${targetVersion} ready to launch!`);

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
      message: `${appItem.name} v${targetVersion} ready to launch!`,
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
    const record = getInstalledRecord();
    const targetId = appId || (appName ? appName.toLowerCase() : '');
    const appInfo = record[targetId] || {};

    let execPath = appInfo.executablePath;
    // Don't treat an uninstaller or installer as the launchable app executable
    if (execPath && /unins.*\.exe$|setup.*\.exe$/i.test(path.basename(execPath))) {
      execPath = null;
    }

    // Auto-detect the real installed executable from Start Menu, Desktop, and Program directories
    if (!execPath || !fs.existsSync(execPath)) {
      const detected = findShortcutTarget(appName || targetId) || findProgramDirectoryExe(appName || targetId);
      if (detected) {
        execPath = detected;
        appInfo.executablePath = detected;
        saveInstalledRecord(record);
      }
    }

    if (!execPath || !fs.existsSync(execPath)) {
      if (command && fs.existsSync(command) && !/unins.*\.exe$/i.test(path.basename(command))) {
        execPath = command;
      }
    }

    // If still no installed executable found, the user may still need to run/finish the setup wizard
    if (!execPath || !fs.existsSync(execPath)) {
      const installer = appInfo.installerPath;
      if (installer && fs.existsSync(installer)) {
        await shell.openPath(installer);
        return {
          ok: true,
          message: `Opened ${path.basename(installer)}. Complete setup to finish installing ${appName || targetId}.`,
        };
      }
      return {
        ok: false,
        error: `Could not find executable for ${appName || targetId}. Run the installer to finish setup.`,
      };
    }

    try {
      const child = spawn(execPath, [], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, message: `Launched ${appName || targetId}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Real App Uninstall
  ipcMain.handle('app:uninstall', async (_, arg) => {
    try {
      const appId = typeof arg === 'string' ? arg : arg?.appId || '';
      let appName = typeof arg === 'object' ? arg?.appName : null;

      if (!appName) {
        const custom = readCustomApps().find((a) => a.id === appId);
        if (custom) appName = custom.name;
        else {
          try {
            const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/apps.json'), 'utf-8'));
            const found = (catalog.apps || []).find((a) => a.id === appId);
            if (found) appName = found.name;
          } catch {}
        }
      }
      if (!appName) appName = appId;

      const record = getInstalledRecord();
      const appInfo = record[appId] || {};
      const appDir = path.join(getInstalledAppsDir(), appId);

      let uninstallerExe = null;

      // 1. Check registry uninstall string
      const uninstallString = appInfo.uninstallString;
      if (uninstallString) {
        const match = String(uninstallString).match(/"([^"]+)"|^(\S+\.exe)/i);
        const parsedExe = match ? match[1] || match[2] : null;
        if (parsedExe && fs.existsSync(parsedExe)) {
          uninstallerExe = parsedExe;
        }
      }

      // 2. If not found from registry, check the app's install directory
      let installDir = appInfo.installLocation;
      if (!installDir && appInfo.executablePath && fs.existsSync(appInfo.executablePath)) {
        installDir = path.dirname(appInfo.executablePath);
      }
      if (!installDir) {
        const detectedExe = findShortcutTarget(appName) || findProgramDirectoryExe(appName);
        if (detectedExe) installDir = path.dirname(detectedExe);
      }

      if (installDir && fs.existsSync(installDir)) {
        try {
          const files = fs.readdirSync(installDir);
          const found = files.find((f) => /^unins.*\.exe$|^uninstall.*\.exe$/i.test(f));
          if (found) {
            uninstallerExe = path.join(installDir, found);
          }
        } catch {}
      }

      // 3. Check %LOCALAPPDATA%\Programs\<appName>
      if (!uninstallerExe && process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const candDir = path.join(process.env.LOCALAPPDATA, 'Programs', appName);
        if (fs.existsSync(candDir)) {
          installDir = candDir;
          try {
            const files = fs.readdirSync(candDir);
            const found = files.find((f) => /^unins.*\.exe$|^uninstall.*\.exe$/i.test(f));
            if (found) {
              uninstallerExe = path.join(candDir, found);
            }
          } catch {}
        }
      }

      // 4. Run the uninstaller if found
      if (uninstallerExe && fs.existsSync(uninstallerExe)) {
        try {
          exec(`powershell -NoProfile -Command "Unblock-File -LiteralPath '${uninstallerExe.replace(/'/g, "''")}'"`);
        } catch {}

        try {
          await shell.openPath(uninstallerExe);
        } catch {
          const child = spawn(uninstallerExe, [], { detached: true });
          child.unref();
        }
      } else if (installDir && fs.existsSync(installDir)) {
        // If it was a portable install with no separate uninstaller, clean up directory safely
        const isSafeDir =
          (process.env.LOCALAPPDATA &&
            installDir.toLowerCase().startsWith(path.join(process.env.LOCALAPPDATA, 'Programs').toLowerCase())) ||
          installDir.toLowerCase().startsWith(path.resolve(getInstalledAppsDir()).toLowerCase());
        if (isSafeDir) {
          try {
            fs.rmSync(installDir, { recursive: true, force: true });
          } catch (e) {
            console.warn(`Could not delete install directory ${installDir}:`, e);
          }
        }
      }

      // 5. Remove desktop / Start Menu shortcuts
      if (process.platform === 'win32') {
        removeAppShortcuts(appName);
      }

      // 6. Remove cached downloaded installer package in userData/installed-apps/<appId>
      if (fs.existsSync(appDir)) {
        try {
          fs.rmSync(appDir, { recursive: true, force: true });
        } catch {}
      }

      // 7. Update installed record
      delete record[appId];
      saveInstalledRecord(record);

      return {
        ok: true,
        message: uninstallerExe
          ? `Uninstaller opened for ${appName}. Complete the prompt to finish removal.`
          : `${appName} uninstalled successfully.`,
      };
    } catch (err) {
      console.error('Uninstall error:', err);
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
    let app = null;

    if (input && typeof input === 'object' && input.id) {
      app = input;
    } else {
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
      app = buildAppFromRepo(repoInfo || { full_name: fullName }, latest);
    }

    if (!app || !app.id) {
      return { ok: false, error: 'Could not create application entry.' };
    }

    const list = readCustomApps().filter((a) => a.id !== app.id && a.github !== app.github);
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
          sendProgress(15, `Downloading Vault X...`);
          await downloadFileWithProgress(asset.downloadUrl, destFile, (percent, received, total) => {
            const mappedProgress = 15 + percent * 0.75;
            const mbReceived = (received / 1024 / 1024).toFixed(1);
            const mbTotal = (total / 1024 / 1024).toFixed(1);
            sendProgress(
              mappedProgress,
              `Downloading Vault X: ${mbReceived}MB / ${mbTotal}MB (${Math.round(percent)}%)`,
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
          isQuitting = true;

          // Unblock the downloaded installer to prevent Windows SmartScreen from aborting it
          try {
            exec(`powershell -NoProfile -Command "Unblock-File -LiteralPath '${destFile.replace(/'/g, "''")}'"`);
          } catch {}

          // Create an update script that terminates running Vault X processes (releasing file locks),
          // executes the installer, and relaunches the upgraded application.
          const scriptFile = path.join(cacheDir, 'apply-vaultx-update.cmd');
          const script = [
            '@echo off',
            'setlocal enabledelayedexpansion',
            'timeout /t 1 /nobreak >nul',
            'taskkill /F /IM "Vault X.exe" >nul 2>&1',
            'timeout /t 1 /nobreak >nul',
            `start "" /wait "${destFile}"`,
            'timeout /t 1 /nobreak >nul',
            'set "TARGET=%LOCALAPPDATA%\\Programs\\vault-x\\Vault X.exe"',
            'if exist "!TARGET!" (',
            '  start "" "!TARGET!"',
            '  exit /b 0',
            ')',
            'set "TARGET=%ProgramFiles%\\Vault X\\Vault X.exe"',
            'if exist "!TARGET!" (',
            '  start "" "!TARGET!"',
            '  exit /b 0',
            ')',
          ].join('\r\n');

          fs.writeFileSync(scriptFile, script, 'utf-8');

          const launcher = spawn('cmd.exe', ['/c', scriptFile], {
            detached: true,
            stdio: 'ignore',
          });
          launcher.on('error', (e) => console.error('Failed to start the installer:', e));
          launcher.unref();

          sendProgress(100, 'Installing the update. Vault X will reopen automatically...');
          setTimeout(() => app.exit(0), 500);
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
