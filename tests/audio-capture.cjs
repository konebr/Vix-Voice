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
  assert.equal(constraints.channelCount.max, undefined);
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


test('processed microphone is centered equally across stereo output', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  assert.match(source, /centeredVoice\.channelCount=1/);
  assert.match(source, /centeredVoice\.channelCountMode='explicit'/);
  assert.match(source, /processed\.connect\(centeredVoice\);processed=centeredVoice/);
});

test('voice gate preserves the beginning of speech with look-ahead audio', () => {
  const source = fs.readFileSync('public/microphone-processor.js', 'utf8');
  let Processor;
  class AudioWorkletProcessor { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  const context = { sampleRate: 48000, AudioWorkletProcessor, registerProcessor: (_name, implementation) => { Processor = implementation; } };
  vm.createContext(context); vm.runInContext(source, context);
  const gate = new Processor(), rendered = [];
  const process = input => { const output = new Float32Array(128); gate.process([[input]], [[output]]); rendered.push(...output); };
  process(new Float32Array(128));
  const onset = new Float32Array(128); onset[0] = 1; process(onset);
  for (let index = 0; index < 10; index++) process(new Float32Array(128));
  const audibleOnset = rendered.findIndex(sample => Math.abs(sample) > .1);
  assert.ok(audibleOnset >= 1100 && audibleOnset <= 1300, `onset rendered at sample ${audibleOnset}`);
  assert.match(source, /sampleRate \* \.024/);
});

test('local speaking indicator uses the configured threshold without visual lag', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  assert.match(source, /speechAnalyser\.fftSize=256/);
  assert.match(source, /speechAnalyser\.smoothingTimeConstant=0/);
  assert.match(source, /levelDb>=threshold/);
  assert.match(source, /box-shadow \.04s linear/);
});
