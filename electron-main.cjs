const { app, BrowserWindow, shell, session, Menu } = require('electron');

// O aplicativo abre a versão atual do Vix Voice; o endereço pode ser trocado em testes via VIX_APP_URL.
const APP_URL = process.env.VIX_APP_URL || 'https://vix-voice-preview.abnerlemoscanal.workers.dev';

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#1e1f22',
    title: 'Vix Voice',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadURL(APP_URL);
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== APP_URL) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'microphone', 'camera'].includes(permission));
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Vix Voice',
      submenu: [
        { label: 'Sobre o Vix Voice', role: 'about' },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' }
      ]
    },
    {
      label: 'Janela',
      submenu: [
        { label: 'Recarregar', role: 'reload' },
        { label: 'Forçar recarregamento', role: 'forceReload' },
        { type: 'separator' },
        { label: 'Minimizar', role: 'minimize' },
        { label: 'Fechar', role: 'close' }
      ]
    }
  ]));
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
