const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync('src/worker.js', 'utf8');
const client = fs.readFileSync('public/sfu-voice.js', 'utf8');
const html = fs.readFileSync('public/app/index.html', 'utf8');

test('backend issues short lived, room scoped SFU tokens', () => {
  assert.match(worker, /\/sfu-token/);
  assert.match(worker, /signSfuToken/);
  assert.match(worker, /roomJoin:true/);
  assert.match(worker, /canPublish:true,canSubscribe:true/);
  assert.match(worker, /exp:now\+7200/);
  assert.match(worker, /LIVEKIT_API_SECRET/);
});

test('group voice connects to one hosted SFU room', () => {
  assert.match(client, /new LK\.Room/);
  assert.match(client, /localParticipant\.publishTrack/);
  assert.match(client, /RoomEvent\.TrackSubscribed/);
  assert.match(client, /startVoice = connectSfu/);
  assert.doesNotMatch(client, /new RTCPeerConnection/);
});

test('SFU connection clears the legacy preparing state from the HUD', () => {
  assert.match(client, /voice-recovery-note/);
  assert.match(client, /Voz conectada · SFU da VPS/);
  assert.match(client, /Reconectando à VPS/);
});

test('the roster refreshes only after the SFU is marked connected', () => {
  const connected = client.indexOf('setConnectionUi(true);', client.indexOf('await nextRoom.connect'));
  const presence = client.indexOf('await publishPresence(serverId, channel.id);', connected);
  const refresh = client.indexOf('await refreshVoiceUsers();', presence);
  assert.ok(connected > 0 && presence > connected && refresh > presence);
});

test('LiveKit SDK loads before the SFU adapter', () => {
  const sdk = html.indexOf('vendor/livekit-client.umd.js');
  const adapter = html.indexOf('sfu-voice.js');
  assert.ok(sdk > 0 && adapter > sdk);
});
