const { app, BrowserWindow, shell, session, Menu, Tray, nativeImage, desktopCapturer } = require('electron');
const path = require('path');

const APP_URL = process.env.VIX_APP_URL || 'https://app.vix-voice.com.br/app/';
const APP_ORIGIN = new URL(APP_URL).origin;
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');
let mainWindow = null;
let tray = null;
let quitting = false;

function trusted(url) {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return createWindow();
  const wasHidden = !mainWindow.isVisible();
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (wasHidden) mainWindow.webContents.reloadIgnoringCache();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 840, minWidth: 960, minHeight: 620, show: false,
    autoHideMenuBar: true, backgroundColor: '#11141a', title: 'Vix Voice', icon: ICON_PATH,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: true }
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!trusted(url)) { event.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function chooseDisplaySource(parent) {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
  if (!sources.length) return null;
  return new Promise(resolve => {
    let settled = false;
    const picker = new BrowserWindow({ width: 780, height: 620, minWidth: 600, minHeight: 430, parent, modal: true, show: false, autoHideMenuBar: true, backgroundColor: '#11141a', title: 'Compartilhar tela', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const cards = sources.map(source => `<a class="source" href="vix-source://select?id=${encodeURIComponent(source.id)}"><img src="${source.thumbnail.toDataURL()}" alt=""><strong>${escapeHtml(source.name)}</strong></a>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Compartilhar tela</title><style>*{box-sizing:border-box}body{margin:0;background:#11141a;color:#f2f3f5;font-family:Segoe UI,system-ui,sans-serif}header{position:sticky;top:0;padding:20px 24px 14px;background:#11141aee;border-bottom:1px solid #2d3340;backdrop-filter:blur(12px)}h1{margin:0 0 5px;font-size:22px}p{margin:0;color:#99a2b4;font-size:13px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px}.source{display:block;overflow:hidden;border:1px solid #303747;border-radius:12px;background:#1b202a;color:#e9ebf1;text-decoration:none;transition:.16s}.source:hover{border-color:#727aff;box-shadow:0 0 0 3px #626bff22;transform:translateY(-2px)}img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#090b0f}.source strong{display:block;overflow:hidden;padding:11px 13px;text-overflow:ellipsis;white-space:nowrap;font-size:13px}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style><header><h1>O que você quer compartilhar?</h1><p>Escolha uma tela ou janela. O Vix Voice nunca inicia a captura sem sua escolha.</p></header><main class="grid">${cards}</main>`;
    const finish = source => { if (settled) return; settled = true; resolve(source); if (!picker.isDestroyed()) picker.destroy(); };
    picker.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (!url.startsWith('vix-source://select')) return;
      const id = new URL(url).searchParams.get('id');
      finish(sources.find(source => source.id === id) || null);
    });
    picker.on('closed', () => finish(null));
    picker.once('ready-to-show', () => picker.show());
    picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

function configurePermissions() {
  const allowed = new Set(['media', 'notifications', 'fullscreen']);
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => trusted(requestingOrigin || webContents?.getURL()) && allowed.has(permission));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => callback(trusted(details.requestingUrl || webContents.getURL()) && allowed.has(permission)));
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!trusted(request.securityOrigin) || !request.userGesture) return callback({});
    try {
      const source = await chooseDisplaySource(mainWindow);
      callback(source ? { video: source, ...(request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {}) } : {});
    } catch { callback({}); }
  });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON_PATH).resize({ width: 20, height: 20 }));
  tray.setToolTip('Vix Voice');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Vix Voice', click: showMainWindow },
    { label: 'Recarregar', click: () => mainWindow?.webContents.reloadIgnoringCache() },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showMainWindow);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId('com.vixvoice.desktop');
    configurePermissions();
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
    app.on('activate', showMainWindow);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {});
}
