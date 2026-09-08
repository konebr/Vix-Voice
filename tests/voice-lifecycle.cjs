const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness({ reject = false } = {}) {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const pathLine = source.match(/function voiceSignalPath\(\)[^\n]+/)[0];
  const connectLine = source.match(/async function connectVoiceSignal\(\)[^\n]+/)[0];
  const requests = [], alerts = [];
  const context = {
    state: { server: { id: 'server' }, identity: { token: 'token' } },
    selectedVoiceChannel: { id: 'games', name: 'Games' },
    voiceSignalSession: null, voiceRoomConnected: false, voiceSignalFailures: 0,
    voiceSignalTimer: null, microphoneStream: { active: true },
    crypto: { randomUUID: () => 'session-id' }, encodeURIComponent, JSON,
    async api(path, options) { requests.push({ path, options }); if (reject) throw Error('servidor indisponível'); return options ? { ok: true } : { users: [] }; },
    renderVoicePanel() {}, async refreshVoiceUsers() {}, setInterval: () => 7,
    pollVoiceSignal() {}, stopVoice() { context.stopped = true; }, stopped: false,
    alert(message) { alerts.push(message); }
  };
  vm.createContext(context); vm.runInContext(`${pathLine}\n${connectLine}`, context);
  return { context, requests, alerts };
}

test('voice becomes connected only after the HTTP signaling join succeeds', async () => {
  const { context, requests } = harness();
  const pending = context.connectVoiceSignal();
  assert.equal(context.voiceRoomConnected, false);
  await pending;
  assert.equal(context.voiceRoomConnected, true);
  assert.equal(context.voiceSignalSession, 'session-id');
  assert.equal(requests[0].path, '/api/servers/server/voice-signal?session=session-id');
  assert.deepEqual(JSON.parse(requests[0].options.body), { type: 'voice-join', channel: 'games' });
});

test('failed signaling leaves voice instead of remaining stuck on connecting', async () => {
  const { context, alerts } = harness({ reject: true });
  await context.connectVoiceSignal();
  assert.equal(context.voiceRoomConnected, false);
  assert.equal(context.voiceSignalSession, null);
  assert.equal(context.stopped, true);
  assert.match(alerts[0], /Não foi possível entrar/);
});

test('local user is only visible in the voice room while actually connected', () => {
  const source = fs.readFileSync('public/server-management.js', 'utf8');
  const filter = source.match(/function visibleVoiceUsers\(users\) \{[^}]+\}/)[0];
  const context = { state: { identity: { id: 'me' } }, microphoneStream: null, voiceRoomConnected: false, Boolean };
  vm.createContext(context); vm.runInContext(filter, context);
  const users = [{ user_id: 'me' }, { user_id: 'other' }];
  assert.deepEqual(Array.from(context.visibleVoiceUsers(users), user => user.user_id), ['other']);
  context.microphoneStream = {}; context.voiceRoomConnected = true;
  assert.deepEqual(Array.from(context.visibleVoiceUsers(users), user => user.user_id), ['me', 'other']);
});

test('leaving voice explicitly removes the HTTP signaling session', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  assert.match(source, /api\(signalPath,\{method:'DELETE'\}\)/);
});
