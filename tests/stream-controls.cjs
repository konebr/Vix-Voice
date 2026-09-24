const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/stream-controls.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const wrapperStart = source.search(/\r?\n\r?\n\(\(\) =>/);
assert.notEqual(wrapperStart, -1, 'the UI wrapper must be located before evaluating capture helpers');
const definition = source.slice(0, wrapperStart);

test('screen quality maps to safe ideal constraints and keeps audio enabled by default', () => {
  for (const [quality, height] of [['480', 480], ['720', 720], ['1080', 1080]]) {
    const context = { readSettings: () => ({ screenQuality: quality }), vixStreamEntitlements: () => ({ maxResolution: 1080, maxFps: 60 }) };
    vm.createContext(context); vm.runInContext(definition, context);
    const options = context.screenCaptureOptions();
    assert.equal(options.video.height.ideal, height);
    assert.equal(options.video.height.max, height);
    assert.equal(options.video.resizeMode, 'crop-and-scale');
    assert.equal(options.video.frameRate.max, 30);
    assert.equal(options.audio, true);
  }
});

test('maximum stream quality follows server boost level entitlements', () => {
  const locked = { readSettings: () => ({ screenQuality: '1080', screenFps: 60 }), vixStreamEntitlements: () => ({ maxResolution: 720, maxFps: 30 }) };
  vm.createContext(locked); vm.runInContext(definition, locked);
  assert.equal(locked.screenCaptureOptions().video.height.ideal, 720);
  assert.equal(locked.screenCaptureOptions().video.frameRate.max, 30);
  const unlocked = { readSettings: () => ({ screenQuality: '1080', screenFps: 60 }), vixStreamEntitlements: () => ({ maxResolution: 1080, maxFps: 60 }) };
  vm.createContext(unlocked); vm.runInContext(definition, unlocked);
  assert.equal(unlocked.screenCaptureOptions().video.height.ideal, 1080);
  assert.equal(unlocked.screenCaptureOptions().video.frameRate.max, 60);
});

test('screen audio can be disabled and unknown quality falls back to 720p', () => {
  const context = { readSettings: () => ({ screenQuality: 'invalid', screenAudio: false }) };
  vm.createContext(context); vm.runInContext(definition, context);
  const options = context.screenCaptureOptions();
  assert.equal(options.video.height.ideal, 720);
  assert.equal(options.audio, false);
});

test('screen sharing remains available when an older cached helper is missing', () => {
  assert.match(app, /typeof prepareScreenStream==='function'\?prepareScreenStream\(captured\):captured/);
});

test('screen capture prioritizes motion at both 30 and 60 FPS', () => {
  for (const fps of [30, 60]) {
    const context = { readSettings: () => ({ screenFps: fps }) };
    vm.createContext(context); vm.runInContext(definition, context);
    const track = { contentHint: '' }, stream = { getVideoTracks: () => [track] };
    assert.equal(context.prepareScreenStream(stream), stream);
    assert.equal(track.contentHint, 'motion');
  }
});

test('SFU publication sends the selected FPS and bitrate through the screen encoding option', async () => {
  const client = fs.readFileSync('public/sfu-voice.js', 'utf8');
  const start = client.indexOf('async function syncPublishedMedia()');
  const end = client.indexOf("addEventListener('vix:stream-view-quality'", start);
  assert.ok(start >= 0 && end > start);
  for (const fps of [30, 60]) {
    const published = [], video = { kind: 'video', readyState: 'live', contentHint: '' };
    const context = {
      readSettings: () => ({ screenQuality: '720', screenFps: fps }),
      vixStreamEntitlements: () => ({ maxResolution: 1080, maxFps: 60 }),
      LK: { ConnectionState: { Connected: 'connected' }, Track: { Source: { ScreenShare: 'screen_share' } } },
      room: { state: 'connected', localParticipant: {
        publishTrack: async (track, options) => { published.push({ track, options }); return { track }; }
      } },
      mediaSyncing: false, microphoneStream: null, micGainStream: null,
      screenStream: { getVideoTracks: () => [video], getAudioTracks: () => [] },
      publishedScreenVideoTrack: null, publishedScreenAudioTrack: null,
      screenVideoPublication: null, screenAudioPublication: null, setConnectionUi() {}
    };
    vm.createContext(context); vm.runInContext(definition + '\n' + client.slice(start, end), context);
    await context.syncPublishedMedia();
    assert.equal(published.length, 1);
    assert.equal(published[0].options.source, 'screen_share');
    assert.equal(published[0].options.screenShareEncoding.maxFramerate, fps);
    assert.equal(published[0].options.screenShareEncoding.maxBitrate, fps === 60 ? 4725000 : 3500000);
    assert.equal(published[0].options.videoEncoding, undefined);
    assert.equal(published[0].options.degradationPreference, 'maintain-framerate');
    assert.equal(video.contentHint, 'motion');
    assert.equal(context.mediaSyncing, false);
    await context.syncPublishedMedia();
    assert.equal(published.length, 1, 'an unchanged screen must not be republished');
  }
});
