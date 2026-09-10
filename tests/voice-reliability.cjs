const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('voice reconnection uses bounded progressive backoff', () => {
  const source = fs.readFileSync('public/voice-reliability.js', 'utf8');
  const delays = source.match(/const reconnectDelays = \[[^\]]+\]/)[0];
  const helper = source.match(/function voiceReconnectDelay\(attempt\) \{[^}]+\}/)[0];
  const context = {};
  vm.createContext(context); vm.runInContext(`${delays};${helper};this.delay=voiceReconnectDelay`, context);
  assert.equal(context.delay(0), 0);
  assert.equal(context.delay(3), 5000);
  assert.equal(context.delay(99), 18000);
});

test('voice transport recovers without stopping the microphone', () => {
  const source = fs.readFileSync('public/voice-reliability.js', 'utf8');
  assert.match(source, /voiceSignalFailures >= 3/);
  assert.match(source, /scheduleReconnect\(error\.message/);
  assert.doesNotMatch(source, /voiceSignalFailures >= 3[^\n]+stopVoice\(/);
  assert.match(source, /addEventListener\('offline'/);
  assert.match(source, /addEventListener\('online'/);
  assert.match(source, /connectionState === 'failed'/);
});
