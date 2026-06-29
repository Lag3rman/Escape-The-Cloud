const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');
const crypto = require('crypto');

if (!process.versions.electron) {
  console.error('Run this app with "npm start" to launch Electron.');
  process.exit(1);
}

let mainWindow = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function readSettings() {
  try {
    const p = settingsPath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}
function writeSettings(obj) {
  try {
    const p = settingsPath();
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
  });

  win.loadFile('index.html');

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Failed to load page: ${errorDescription} (code: ${errorCode})`);
  });
  mainWindow = win;
}

app.whenReady().then(() => {
  try {
    createWindow();
  } catch (error) {
    console.error('An error occurred during window creation:', error);
  }
});
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

app.on('will-quit', () => {
  console.log('Application is about to quit.');
});

ipcMain.handle('get-paths', async () => {
  const s = readSettings();
  const saved = s.googleCredsPath || '';
  const fallback = path.join(__dirname, 'credentials.json');
  const picked = saved || fallback;
  return { appDir: __dirname, googleCreds: picked, googleToken: path.join(app.getPath('userData'), 'google_token.json'), userData: app.getPath('userData') };
});

ipcMain.handle('pick-google-credentials', async () => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const src = res.filePaths[0];
    const s = readSettings();
    s.googleCredsPath = src;
    writeSettings(s);
    return { ok: true, path: src };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('check-setup-status', async () => {
  try {
    const s = readSettings();
    const saved = s.googleCredsPath || '';
    const googleCredsExists = saved ? fs.existsSync(saved) : fs.existsSync(path.join(__dirname, 'credentials.json'));
    return { ok: true, googleCredsExists };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('delete-google-credentials', async () => {
  try {
    const credPath = path.join(__dirname, 'credentials.json');
    if (fs.existsSync(credPath)) {
      await fs.promises.unlink(credPath);
      return { ok: true, deleted: true, path: credPath };
    }
    return { ok: true, deleted: false, path: credPath };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('clear-google-token', async () => {
  const tokenPath = path.join(app.getPath('userData'), 'google_token.json');
  try {
    await fs.promises.unlink(tokenPath);
    return { ok: true, cleared: true, path: tokenPath };
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { ok: true, cleared: false, path: tokenPath };
    }
    return { ok: false, error: String(e && e.message ? e.message : e), path: tokenPath };
  }
});

async function selectLocalDirectory() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

async function hashFileMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function walkAndHashMD5(dirPath) {
  const result = new Map();
  async function walk(current) {
    const items = await fs.promises.readdir(current, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        try {
          const md5 = await hashFileMD5(full);
          result.set(full, md5);
        } catch (_) {
        }
      }
    }
  }
  await walk(dirPath);
  return result;
}

async function getOAuth2Client(requestedScopes) {
  const s = readSettings();
  const saved = s.googleCredsPath || '';
  const fallback = path.join(__dirname, 'credentials.json');
  const credPath = saved && fs.existsSync(saved) ? saved : fallback;
  if (!fs.existsSync(credPath)) {
    dialog.showErrorBox('Missing credentials.json', `Pick your Google OAuth credentials.json using “Pick credentials.json”.\n\nCurrently not found at:\n${credPath}`);
    return null;
  }
  let raw;
  try {
    raw = fs.readFileSync(credPath, 'utf8');
  } catch (e) {
    dialog.showErrorBox('Read error', `Could not read:\n${credPath}\n\n${String(e && e.message ? e.message : e)}`);
    return null;
  }
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    dialog.showErrorBox('Invalid credentials.json', `JSON parse error in:\n${credPath}\n\n${String(e && e.message ? e.message : e)}`);
    return null;
  }
  const installed = creds.installed || creds.web || {};
  const clientId = installed.client_id;
  const clientSecret = installed.client_secret;
  if (!clientId || !clientSecret) {
    dialog.showErrorBox('Invalid credentials.json', 'Expected client_id and client_secret under "installed" (Desktop app).');
    return null;
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://127.0.0.1');

  const tokenPath = path.join(app.getPath('userData'), 'google_token.json');
  if (fs.existsSync(tokenPath)) {
    try {
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      const haveScopes = token && token.scope && Array.isArray(requestedScopes)
        ? requestedScopes.every(s => String(token.scope).includes(s))
        : true;
      if (haveScopes) {
        oauth2Client.setCredentials(token);
        return oauth2Client;
      }
    } catch (_) {}
  }

  const scopes = Array.isArray(requestedScopes) && requestedScopes.length > 0
    ? requestedScopes
    : ['https://www.googleapis.com/auth/drive'];
  const server = http.createServer();
  const authCode = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1');
        const code = url.searchParams.get('code');
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Authentication complete. You can close this window.');
          resolve(code);
          server.close();
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code');
        }
      } catch (e) {
        reject(e);
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}`;
      oauth2Client.redirectUri = redirectUri;
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        redirect_uri: redirectUri,
        prompt: 'consent',
      });
      shell.openExternal(authUrl);
    });
  });

  const { tokens } = await oauth2Client.getToken({ code: authCode, redirect_uri: oauth2Client.redirectUri });
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens), 'utf8');
  return oauth2Client;
}

async function listDriveFiles(oauth2Client) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const files = [];
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: "trashed = false",
      fields: 'nextPageToken, files(id, name, md5Checksum, size, mimeType)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (res.data && Array.isArray(res.data.files)) {
      for (const f of res.data.files) {
        if (f.md5Checksum) {
          files.push({ id: f.id, name: f.name, md5: f.md5Checksum });
        }
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

async function deleteDriveFiles(oauth2Client, ids) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  let deleted = 0;
  for (const id of ids) {
    try {
      await drive.files.delete({ fileId: id, supportsAllDrives: true });
      deleted += 1;
    } catch (_) {
    }
  }
  return deleted;
}

ipcMain.handle('start-google-flow', async () => {
  try {
    if (!mainWindow) return { ok: false, error: 'no-window' };
    const dir = await selectLocalDirectory();
    if (!dir) return { ok: false, canceled: true };
    const oauth2Client = await getOAuth2Client(['https://www.googleapis.com/auth/drive']);
    if (!oauth2Client) return { ok: false, error: 'auth-failed' };
    const [localMap, driveFiles] = await Promise.all([
      walkAndHashMD5(dir),
      listDriveFiles(oauth2Client),
    ]);
    const localHashes = new Set(localMap.values());
    const matches = driveFiles.filter(f => localHashes.has(f.md5));
    const count = matches.length;
    if (count === 0) {
      dialog.showMessageBox(mainWindow, { type: 'info', message: 'No matching cloud files found.' });
      return { ok: true, deleted: 0, found: 0 };
    }
    const resp = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Delete', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Found ${count} matching cloud files. Delete them?`,
    });
    if (resp.response !== 0) {
      return { ok: true, deleted: 0, found: count, canceled: true };
    }
    const ids = matches.map(m => m.id);
    const deleted = await deleteDriveFiles(oauth2Client, ids);
    dialog.showMessageBox(mainWindow, { type: 'info', message: `Deleted ${deleted} cloud files.` });
    return { ok: true, deleted, found: count };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

 
