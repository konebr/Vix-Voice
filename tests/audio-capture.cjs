const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function audioFunctions(context = {}) {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const start = source.indexOf('function voiceAudioConstraints');
  const end = source.indexOf('async function startVoice');
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test('professional audio constraints respect device and processing preferences', () => {
  const context = audioFunctions({ readSettings: () => ({}) });
  const constraints = context.voiceAudioConstraints({
    input: 'headset', echoCancellation: false, noiseSuppression: false, autoGain: false
  });
  assert.equal(constraints.deviceId.exact, 'headset');
  assert.equal(constraints.echoCancellation, false);
  assert.equal(constraints.noiseSuppression, false);
  assert.equal(constraints.autoGainControl, false);
  assert.equal(constraints.sampleRate.ideal, 48000);
  assert.equal(constraints.channelCount.ideal, 2);
});

test('removed saved microphone falls back to the system default', async () => {
  const calls = [], saved = [];
  const context = audioFunctions({
    readSettings: () => ({}),
    saveSettings: patch => saved.push(patch),
    navigator: { mediaDevices: { async getUserMedia(options) {
      calls.push(options);
      if (calls.length === 1) { const error = new Error('missing'); error.name = 'NotFoundError'; throw error; }
      return { id: 'default-microphone' };
    } } }
  });
  const stream = await context.requestMicrophone({ input: 'removed-device' });
  assert.equal(stream.id, 'default-microphone');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].input, '');
  assert.equal(calls[0].audio.deviceId.exact, 'removed-device');
  assert.equal(calls[1].audio.deviceId, undefined);
});
