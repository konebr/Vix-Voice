const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/stream-controls.js', 'utf8');
const definition = source.slice(0, source.indexOf('\n\n(() =>'));

test('screen quality maps to safe ideal constraints and keeps audio enabled by default', () => {
  for (const [quality, height] of [['480', 480], ['720', 720], ['1080', 1080]]) {
    const context = { readSettings: () => ({ screenQuality: quality }) };
    vm.createContext(context); vm.runInContext(definition, context);
    const options = context.screenCaptureOptions();
    assert.equal(options.video.height.ideal, height);
    assert.equal(options.video.frameRate.max, 30);
    assert.equal(options.audio, true);
  }
});

test('screen audio can be disabled and unknown quality falls back to 720p', () => {
  const context = { readSettings: () => ({ screenQuality: 'invalid', screenAudio: false }) };
  vm.createContext(context); vm.runInContext(definition, context);
  const options = context.screenCaptureOptions();
  assert.equal(options.video.height.ideal, 720);
  assert.equal(options.audio, false);
});
