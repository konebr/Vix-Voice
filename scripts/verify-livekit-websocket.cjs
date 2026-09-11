const token = process.env.LIVEKIT_TEST_TOKEN;
const endpoint = process.env.LIVEKIT_TEST_URL || 'wss://app.vix-voice.com.br';
if (!token) throw new Error('LIVEKIT_TEST_TOKEN is required');

const url = new URL('/rtc', endpoint);
url.searchParams.set('access_token', token);
url.searchParams.set('protocol', '15');
url.searchParams.set('auto_subscribe', '1');
url.searchParams.set('sdk', 'js');
url.searchParams.set('version', '2.22.3');

const socket = new WebSocket(url);
const timeout = setTimeout(() => {
  console.error('LIVEKIT_WEBSOCKET_TIMEOUT');
  socket.close();
  process.exitCode = 1;
}, 10000);

socket.addEventListener('open', () => {
  clearTimeout(timeout);
  console.log('LIVEKIT_WEBSOCKET_OK');
  socket.close();
});
socket.addEventListener('error', event => {
  clearTimeout(timeout);
  console.error(`LIVEKIT_WEBSOCKET_ERROR: ${event.message || 'connection failed'}`);
  process.exitCode = 1;
});
