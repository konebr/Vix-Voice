const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const management = fs.readFileSync('public/server-management.js', 'utf8');

test('voice rooms start reloading immediately when server switching begins', () => {
  assert.match(app, /vix:server-switching/);
  assert.match(management, /addEventListener\('vix:server-switching'/);
  assert.match(management, /event\.detail\?\.serverId !== state\.server\?\.id/);
  assert.match(management, /voiceChannelCache/);
});

test('voice room loading tolerates malformed and transient responses', () => {
  assert.match(management, /Array\.isArray\(result\.channels\)/);
  assert.match(management, /Não foi possível carregar as salas de voz/);
  assert.match(management, /setTimeout\(\(\) => state\.server\?\.id === serverId && loadVoiceChannels/);
});
