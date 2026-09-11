const { app, BrowserWindow, session } = require('electron');

const base = process.env.VIX_STAGING_URL || 'http://127.0.0.1:8878';
const password = 'TesteSeguro123!';
const timeout = (promise, ms, message) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
]);

async function request(path, options = {}, token = '') {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function credentials() {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const first = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'SFU Origem', email: `sfu-origin-${stamp}@vix.local`, password }) });
  const second = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'SFU Destino', email: `sfu-target-${stamp}@vix.local`, password }) });
  const server = await request('/api/servers', { method: 'POST', body: JSON.stringify({ name: 'Teste de mídia SFU' }) }, first.token);
  await request(`/api/servers/join/${server.invite}`, { method: 'POST', body: '{}' }, second.token);
  const channels = await request(`/api/servers/${server.id}/voice-channels`, {}, first.token);
  const channel = channels.channels[0].id;
  const [publisher, subscriber] = await Promise.all([
    request(`/api/servers/${server.id}/sfu-token`, { method: 'POST', body: JSON.stringify({ channel }) }, first.token),
    request(`/api/servers/${server.id}/sfu-token`, { method: 'POST', body: JSON.stringify({ channel }) }, second.token)
  ]);
  return { publisher, subscriber };
}

async function openClient(partition) {
  const window = new BrowserWindow({ show: false, webPreferences: { partition, contextIsolation: true } });
  await window.loadURL(`${base}/app/`);
  return window;
}

app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(async () => {
  try {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(true));
    const { publisher, subscriber } = await credentials();
    const receiver = await openClient(`temporary:sfu-receiver-${Date.now()}`);
    const sender = await openClient(`temporary:sfu-sender-${Date.now()}`);
    await receiver.webContents.executeJavaScript(`
      globalThis.__sfuRoom = new LivekitClient.Room({ adaptiveStream: true });
      globalThis.__receivedAudio = new Promise(resolve => __sfuRoom.once(LivekitClient.RoomEvent.TrackSubscribed, track => resolve(track.kind)));
      __sfuRoom.connect(${JSON.stringify(subscriber.url)}, ${JSON.stringify(subscriber.token)}, { autoSubscribe: true });
    `);
    await sender.webContents.executeJavaScript(`
      globalThis.__sfuRoom = new LivekitClient.Room();
      (async () => {
        await __sfuRoom.connect(${JSON.stringify(publisher.url)}, ${JSON.stringify(publisher.token)});
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await __sfuRoom.localParticipant.publishTrack(stream.getAudioTracks()[0], { source: LivekitClient.Track.Source.Microphone });
      })();
    `);
    const kind = await timeout(receiver.webContents.executeJavaScript('__receivedAudio'), 15000, 'O segundo cliente não recebeu o áudio.');
    if (kind !== 'audio') throw new Error(`Faixa recebida com tipo inesperado: ${kind}`);
    console.log('LIVEKIT_TWO_CLIENT_AUDIO_OK');
    await Promise.allSettled([
      receiver.webContents.executeJavaScript('__sfuRoom.disconnect()'),
      sender.webContents.executeJavaScript('__sfuRoom.disconnect()')
    ]);
    receiver.destroy(); sender.destroy(); app.quit();
  } catch (error) {
    console.error(`LIVEKIT_TWO_CLIENT_AUDIO_ERROR: ${error.message}`);
    app.exit(1);
  }
});
