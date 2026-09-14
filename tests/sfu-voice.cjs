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

test('each browser or desktop connection receives a unique SFU identity', () => {
  assert.match(worker, /sub:`\$\{user\.id\}:\$\{connectionId\}`/);
  assert.match(worker, /metadata:JSON\.stringify\(\{userId:user\.id/);
  assert.match(client, /connection_id: connectionId/);
  assert.match(client, /participantMetadata\(participant\)\.userId/);
});

test('group voice connects to one hosted SFU room', () => {
  assert.match(client, /new LK\.Room/);
  assert.match(client, /localParticipant\.publishTrack/);
  assert.match(client, /RoomEvent\.TrackSubscribed/);
  assert.match(client, /startVoice = connectSfu/);
  assert.doesNotMatch(client, /new RTCPeerConnection/);
  assert.match(client, /forceStereo: true/);
});

test('SFU connection clears the legacy preparing state from the HUD', () => {
  assert.match(client, /voice-recovery-note/);
  assert.match(client, /Áudio hospedado no SFU da VPS/);
  assert.match(client, /Reconectando à VPS/);
});

test('the roster refreshes only after the SFU is marked connected', () => {
  const connected = client.indexOf('setConnectionUi(true);', client.indexOf('await nextRoom.connect'));
  const presence = client.indexOf('await publishPresence(serverId, channel.id);', connected);
  const presenceFunction = client.indexOf('async function publishPresence');
  const refresh = client.indexOf('await refreshVoiceUsers();', presenceFunction);
  assert.ok(connected > 0 && presence > connected);
  assert.ok(presenceFunction > 0 && refresh > presenceFunction);
});

test('LiveKit SDK loads before the SFU adapter', () => {
  const sdk = html.indexOf('vendor/livekit-client.umd.js');
  const adapter = html.indexOf('sfu-voice.js');
  assert.ok(sdk > 0 && adapter > sdk);
});

test('remote SFU audio is unlocked for browser and desktop playback', () => {
  assert.match(client, /room\?\.startAudio\?\.\(\)/);
  assert.match(client, /globalThis\.unlockRemoteAudio/);
  assert.match(client, /audio\.play\(\)\.catch\(requestAudioUnlock\)/);
  assert.match(client, /document\.addEventListener\('pointerdown'/);
  assert.match(html, /sfu-voice\.js\?v=ping-1/);
});


test('connected SFU title leaves dedicated room for the latency badge', () => {
  assert.match(client, /title\.textContent = connected \? \(screenStream \? 'Transmitindo' : 'Voz conectada'\)/);
  assert.doesNotMatch(client, /Voz conectada · SFU da VPS/);
  const css = fs.readFileSync('public/call-ui.css', 'utf8');
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto auto/);
});
