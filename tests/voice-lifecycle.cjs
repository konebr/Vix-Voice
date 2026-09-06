const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('voice becomes connected only after the socket opens and refreshes presence immediately', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const line = source.match(/function connectVoiceSignal\(\)[^\n]+/)[0];
  let socket, refreshes = 0, stops = 0; const sent = [];
  class WebSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; socket = this; }
  }
  const context = {
    state: { server: { id: 'server' }, identity: { token: 'token' } },
    selectedVoiceChannel: { id: 'games', name: 'Games' },
    voiceSocket: null, voiceRoomConnected: false, microphoneStream: { active: true },
    location: { protocol: 'https:', host: 'vox.test' }, WebSocket, encodeURIComponent,
    sendVoiceSignal(message) { sent.push(message); },
    renderVoicePanel() {}, setTimeout(callback) { callback(); }, refreshVoiceUsers() { refreshes++; },
    handleVoiceSignal() {},
    stopVoice() { stops++; this.microphoneStream = null; }, $: () => ({ title: '' }),
    alert() {}, window: {}, refreshPrivateRail: () => Promise.resolve(), openPicker() {}
  };
  vm.createContext(context); vm.runInContext(line, context); context.connectVoiceSignal();
  assert.equal(context.voiceRoomConnected, false);
  socket.onopen();
  assert.equal(context.voiceRoomConnected, true);
  assert.equal(sent[0].channel, 'games');
  assert.equal(refreshes, 1);
  socket.onclose({ code: 1006 });
  assert.equal(context.voiceRoomConnected, false);
  assert.equal(stops, 1);
});
