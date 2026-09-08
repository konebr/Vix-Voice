const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('master volume combines with personal volume; deafen and personal mute remain independent', () => {
  const source = fs.readFileSync('public/voice-controls.js', 'utf8');
  const start = source.indexOf('  const clamp');
  const end = source.indexOf('  async function routeOutput');
  let settings = { outputVolume: 50, voiceActivatedOutput: false, participants: { alice: { volume: 40 } } };
  const context = { readSettings: () => settings, deafened: false };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const peer = { person: { id: 'alice' }, audio: {} };
  context.applyOutput(peer); assert.equal(peer.audio.volume, 0.2); assert.equal(peer.audio.muted, false);
  context.deafened = true; context.applyOutput(peer); assert.equal(peer.audio.muted, true);
  settings.participants.alice.muted = true; context.deafened = false;
  context.applyOutput(peer); assert.equal(peer.audio.muted, true);
  settings = {}; peer.remoteSpeaking = true; context.applyOutput(peer); assert.equal(peer.audio.volume, 1); assert.equal(peer.audio.muted, false);
});

test('voice activation mutes silence independently without pausing participant tracks', () => {
  const source = fs.readFileSync('public/voice-controls.js', 'utf8');
  const start = source.indexOf('  const clamp');
  const end = source.indexOf('  async function routeOutput');
  const settings = { participants: {} };
  const context = { readSettings: () => settings, deafened: false };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const alice = { person: { id: 'alice' }, audio: {}, remoteSpeaking: true };
  const bob = { person: { id: 'bob' }, audio: {}, remoteSpeaking: false };
  context.applyOutput(alice); context.applyOutput(bob);
  assert.equal(alice.audio.muted, false);
  assert.equal(bob.audio.muted, true);
  assert.doesNotMatch(source, /peer\.audio\.pause\(\)/);
});

test('voice activated output rests during silence and opens for speech', () => {
  const source = fs.readFileSync('public/voice-controls.js', 'utf8');
  const line = source.match(/  const shouldPlayRemoteAudio[^\n]+/)[0];
  const context = {};
  vm.createContext(context); vm.runInContext(`${line}\nthis.check = shouldPlayRemoteAudio`, context);
  assert.equal(context.check({}, false, false), false);
  assert.equal(context.check({}, false, true), true);
  assert.equal(context.check({ voiceActivatedOutput: false }, false, false), true);
  assert.equal(context.check({}, true, true), false);
});

test('every remote participant uses the unlocked context and suspended meters fail open', () => {
  const source = fs.readFileSync('public/voice-controls.js', 'utf8');
  const line = source.match(/  const isRemoteSpeaking[^\n]+/)[0];
  const context = {};
  vm.createContext(context); vm.runInContext(`${line}\nthis.check = isRemoteSpeaking`, context);
  assert.equal(context.check('running', 0, 0, 100), false);
  assert.equal(context.check('running', 0.02, 0, 100), true);
  assert.equal(context.check('suspended', 0, 0, 100), true);
  assert.match(source, /const context = playbackContext \|\| new AudioContext\(\)/);
});
