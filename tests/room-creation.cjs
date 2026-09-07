const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('room creator routes text and voice rooms to their own APIs', async () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const pathLine = source.match(/function roomCreationPath\(type\)[^\n]+/)[0];
  const createLine = source.match(/async function createRoom\(type,name\)[^\n]+/)[0];
  const requests = [], calls = { server: 0, voice: 0 };
  const context = {
    state: { server: { id: 'server id' } }, encodeURIComponent, JSON,
    async api(path, options) { requests.push({ path, options }); },
    async loadServer() { calls.server++; },
    window: { async reloadVoiceChannels() { calls.voice++; } }
  };
  vm.createContext(context);
  vm.runInContext(`${pathLine}\n${createLine}`, context);

  await context.createRoom('text', 'novidades');
  await context.createRoom('voice', 'Bate-papo');

  assert.deepEqual(requests.map(item => item.path), [
    '/api/servers/server%20id/channels',
    '/api/servers/server%20id/voice-channels'
  ]);
  assert.deepEqual(requests.map(item => JSON.parse(item.options.body).name), ['novidades', 'Bate-papo']);
  assert.deepEqual(calls, { server: 1, voice: 1 });
});
