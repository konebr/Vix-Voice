const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('room creator routes text and voice rooms to their own APIs', async () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const pathLine = source.match(/function roomCreationPath\(type\)[^\n]+/)[0];
  const createLine = source.match(/async function createRoom\(type,name[^\n]+/)[0];
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
  await context.createRoom('category', 'Jogos');

  assert.deepEqual(requests.map(item => item.path), [
    '/api/servers/server%20id/channels',
    '/api/servers/server%20id/voice-channels',
    '/api/servers/server%20id/categories'
  ]);
  assert.deepEqual(requests.map(item => JSON.parse(item.options.body).name), ['novidades', 'Bate-papo', 'Jogos']);
  assert.deepEqual(calls, { server: 2, voice: 2 });
});

test('category plus button opens the quick creator instead of server settings', () => {
  const management = fs.readFileSync('public/server-management.js', 'utf8');
  assert.match(management, /showChannelCreator\?\.\('text', category\.id\)/);
  assert.doesNotMatch(management, /add\.onclick = event => \{ event\.stopPropagation\(\); openManagement\('voice'\)/);
  assert.match(management, /channel-quick-actions/);
});

test('quick creator uses vector icons and a neutral input focus', () => {
  const icons = fs.readFileSync('public/icons.js', 'utf8');
  const css = fs.readFileSync('public/hud.css', 'utf8');
  assert.match(icons, /room-creator-symbol/);
  assert.match(icons, /input\[value="category"\]/);
  assert.match(css, /room-name-field:focus-within\{border-color:#56647c/);
  assert.match(css, /input:focus-visible\{border:0!important;outline:none!important/);
});
