const { app, BrowserWindow, shell, session, Menu, Tray, nativeImage, desktopCapturer, dialog, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const APP_URL = process.env.VIX_APP_URL || 'https://app.vix-voice.com.br/app/';
const APP_ORIGIN = new URL(APP_URL).origin;
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');
const PRELOAD_PATH = path.join(__dirname, 'electron-preload.cjs');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
let mainWindow = null;
let tray = null;
let quitting = false;
let updateCheckRunning = false;
let updateReady = false;

function desktopAppUrl() {
  const url = new URL(APP_URL);
  url.searchParams.set('desktop-version', app.getVersion());
  return url.toString();
}

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

function sendDesktopAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('vix-desktop-action', action);
}

function launchAtLoginEnabled() {
  return app.isPackaged && app.getLoginItemSettings().openAtLogin;
}

function setLaunchAtLogin(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
}

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Atualizações do Vix Voice', message: 'A verificação automática funciona na versão instalada.', detail: `Versão de desenvolvimento: ${app.getVersion()}` });
    return;
  }
  if (updateCheckRunning || updateReady) return;
  updateCheckRunning = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    if (manual && result?.updateInfo?.version === app.getVersion()) await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Vix Voice atualizado', message: 'Você já está usando a versão mais recente.', detail: `Versão ${app.getVersion()}` });
  } catch (error) {
    console.error('Falha ao verificar atualização:', error);
    if (manual) await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Atualização indisponível', message: 'Não foi possível verificar atualizações agora.', detail: 'Tente novamente em alguns minutos.' });
  } finally { updateCheckRunning = false; }
}

function configureAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('download-progress', progress => mainWindow?.setProgressBar(Math.max(0, Math.min(1, progress.percent / 100))));
  autoUpdater.on('update-not-available', () => mainWindow?.setProgressBar(-1));
  autoUpdater.on('error', error => { mainWindow?.setProgressBar(-1); console.error('Atualizador do Vix Voice:', error); });
  autoUpdater.on('update-downloaded', async info => {
    if (updateReady) return; updateReady = true; mainWindow?.setProgressBar(-1);
    const result = await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Atualização pronta', message: `Vix Voice ${info.version} está pronto para instalar.`, detail: 'O aplicativo será reaberto automaticamente.', buttons: ['Reiniciar e atualizar', 'Depois'], defaultId: 0, cancelId: 1 });
    if (result.response === 0) { quitting = true; autoUpdater.quitAndInstall(false, true); }
  });
  setTimeout(() => checkForUpdates(false), 12000);
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 840, minWidth: 960, minHeight: 620, show: false,
    autoHideMenuBar: true, backgroundColor: '#11141a', title: 'Vix Voice', icon: ICON_PATH,
    webPreferences: { preload: PRELOAD_PATH, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: true }
  });
  mainWindow.loadURL(desktopAppUrl());
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
    const sourceCard = (source, kind) => {
      const icon = source.appIcon && !source.appIcon.isEmpty() ? `<img class="app-icon" src="${source.appIcon.toDataURL()}" alt="">` : '';
      return `<a class="source" href="vix-source://select?id=${encodeURIComponent(source.id)}"><span class="preview"><img src="${source.thumbnail.toDataURL()}" alt="">${icon}<span class="kind">${kind}</span></span><strong>${escapeHtml(source.name)}</strong><small>${kind === 'Tela inteira' ? 'Tudo que aparecer neste monitor será transmitido' : 'Somente esta janela ou jogo será transmitido'}</small></a>`;
    };
    const screens = sources.filter(source => source.id.startsWith('screen:')).map(source => sourceCard(source, 'Tela inteira')).join('');
    const windows = sources.filter(source => !source.id.startsWith('screen:')).map(source => sourceCard(source, 'Janela ou jogo')).join('');
    const section = (id, title, copy, cards) => cards ? `<section id="${id}"><div class="section-title"><div><h2>${title}</h2><p>${copy}</p></div><span>${cards.match(/class="source"/g)?.length || 0}</span></div><div class="grid">${cards}</div></section>` : '';
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Compartilhar tela</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#0d1017;color:#f2f3f5;font-family:Segoe UI,system-ui,sans-serif}header{position:sticky;top:0;z-index:3;padding:20px 24px 16px;background:#11141aee;border-bottom:1px solid #2d3340;backdrop-filter:blur(16px)}h1{margin:0 0 5px;font-size:24px;letter-spacing:-.025em}p{margin:0;color:#99a2b4;font-size:13px;line-height:1.45}.tabs{display:flex;gap:8px;margin-top:15px}.tabs a{padding:8px 12px;border:1px solid #343b4c;border-radius:9px;background:#1a1f29;color:#d9dceb;text-decoration:none;font-size:12px;font-weight:700}.tabs a:hover{border-color:#727aff;background:#252b45}.section-title{display:flex;align-items:end;justify-content:space-between;padding:22px 24px 4px}.section-title h2{margin:0 0 4px;font-size:16px}.section-title span{min-width:25px;padding:3px 7px;border:1px solid #343b4c;border-radius:999px;color:#aeb5c7;text-align:center;font-size:11px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:12px 24px 8px}.source{display:block;overflow:hidden;border:1px solid #303747;border-radius:14px;background:#171c25;color:#e9ebf1;text-decoration:none;transition:.16s}.source:hover,.source:focus{outline:0;border-color:#727aff;box-shadow:0 0 0 3px #626bff22,0 14px 35px #0006;transform:translateY(-2px)}.preview{position:relative;display:block}.preview>img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#090b0f}.app-icon{position:absolute;left:10px;bottom:10px;width:28px;height:28px;border:1px solid #ffffff33;border-radius:7px;background:#10131a;box-shadow:0 4px 12px #0008}.kind{position:absolute;right:9px;bottom:9px;padding:5px 8px;border:1px solid #ffffff1c;border-radius:7px;background:#090b0dcc;color:#e2e5ef;font-size:10px;font-weight:750;backdrop-filter:blur(8px)}.source strong,.source small{display:block;overflow:hidden;padding:0 13px;text-overflow:ellipsis;white-space:nowrap}.source strong{padding-top:11px;font-size:13px}.source small{padding-top:3px;padding-bottom:12px;color:#8992a5;font-size:10px}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style><header><h1>Escolha o que transmitir</h1><p>Compartilhe um monitor completo ou apenas a janela do seu jogo ou aplicativo.</p><nav class="tabs">${screens ? '<a href="#screens">Telas</a>' : ''}${windows ? '<a href="#windows">Janelas e jogos</a>' : ''}</nav></header><main>${section('screens','Telas','Compartilhe tudo o que aparece em um monitor.',screens)}${section('windows','Janelas e jogos','Escolha um jogo aberto ou outro aplicativo.',windows)}</main>`;
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
  const refreshMenu = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Vix Voice', click: showMainWindow },
    { type: 'separator' },
    { label: 'Silenciar ou ativar microfone', accelerator: 'CommandOrControl+Shift+M', click: () => sendDesktopAction('toggle-mute') },
    { label: 'Silenciar ou ativar áudio', accelerator: 'CommandOrControl+Shift+D', click: () => sendDesktopAction('toggle-deafen') },
    { type: 'separator' },
    { label: 'Iniciar com o Windows', type: 'checkbox', checked: launchAtLoginEnabled(), click: item => { setLaunchAtLogin(item.checked); refreshMenu(); } },
    { label: 'Recarregar', click: () => mainWindow?.webContents.reloadIgnoringCache() },
    { label: 'Verificar atualizações', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } }
  ]));
  refreshMenu();
  tray.on('click', showMainWindow);
}

function registerDesktopShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+M', () => sendDesktopAction('toggle-mute'));
  globalShortcut.register('CommandOrControl+Shift+D', () => sendDesktopAction('toggle-deafen'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.vixvoice.desktop');
    await session.defaultSession.clearCache();
    configurePermissions();
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
    registerDesktopShortcuts();
    configureAutoUpdates();
    app.on('activate', showMainWindow);
  });
  app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); });
  app.on('window-all-closed', () => {});
}
