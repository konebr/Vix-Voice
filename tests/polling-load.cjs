const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background signaling uses VM-friendly polling intervals', () => {
  const app = fs.readFileSync('public/app.js', 'utf8');
  const privateClient = fs.readFileSync('public/private.js', 'utf8');
  const service = fs.readFileSync('deploy/vix-voice.service', 'utf8');
  assert.match(app, /setInterval\(pollVoiceSignal,1000\)/);
  assert.match(privateClient, /setInterval\(pollSignals,1500\)/);
  assert.match(privateClient, /refreshHome\(privateState\.open\),30000/);
  assert.match(service, /--log-level error/);
});
