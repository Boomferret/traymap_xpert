const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backend;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const frontendURL = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../out/index.html')}`;

  mainWindow.loadURL(frontendURL);
}

function startBackend() {
  const backendPath = path.join(__dirname, '../backend/app/main.py');
  backend = spawn('python', [backendPath]);

  backend.stdout.on('data', (data) => {
    console.log(`[FastAPI] ${data}`);
  });

  backend.stderr.on('data', (data) => {
    console.error(`[FastAPI Error] ${data}`);
  });
}


app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backend) backend.kill();
  if (process.platform !== 'darwin') app.quit();
});
