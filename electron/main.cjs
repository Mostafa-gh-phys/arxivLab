const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');

const PORT = process.env.PORT || '31415';
let serverProc = null;
let mainWindow = null;

function waitForServer(url, retries = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const probe = () => {
      attempts += 1;
      http
        .get(`${url}/api/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
          } else if (attempts < retries) {
            setTimeout(probe, 200);
          } else {
            reject(new Error(`Server responded with ${res.statusCode}`));
          }
        })
        .on('error', () => {
          if (attempts < retries) {
            setTimeout(probe, 200);
          } else {
            reject(new Error('Timed out waiting for embedded arXivLab backend'));
          }
        });
    };
    probe();
  });
}

function startBackend() {
  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '..');
  const distDir = path.join(resourcesRoot, 'dist');
  const userDataDir = app.getPath('userData');
  const bundledServer = path.join(resourcesRoot, 'dist-electron', 'server.cjs');

  serverProc = spawn(process.execPath, [bundledServer], {
    cwd: userDataDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT,
      ARXIVLAB_DIST_DIR: distDir,
    },
    stdio: 'ignore',
  });
}

async function createWindow() {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  startBackend();
  await waitForServer(baseUrl);

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'arXivLab',
    icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(baseUrl);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProc) {
    serverProc.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProc) {
    serverProc.kill();
  }
});
