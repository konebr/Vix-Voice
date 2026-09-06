const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('master volume combines with personal volume; deafen and personal mute remain independent', () => {
  const source = fs.readFileSync('public/voice-controls.js', 'utf8');
  const start = source.indexOf('  const clamp');
  const end = source.indexOf('  async function routeOutput');
  let settings = { outputVolume: 50, participants: { alice: { volume: 40 } } };
  const context = { readSettings: () => settings, deafened: false };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const peer = { person: { id: 'alice' }, audio: {} };
  context.applyOutput(peer); assert.equal(peer.audio.volume, 0.2); assert.equal(peer.audio.muted, false);
  context.deafened = true; context.applyOutput(peer); assert.equal(peer.audio.muted, true);
  settings.participants.alice.muted = true; context.deafened = false;
  context.applyOutput(peer); assert.equal(peer.audio.muted, true);
  settings = {}; context.applyOutput(peer); assert.equal(peer.audio.volume, 1); assert.equal(peer.audio.muted, false);
});
