const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness() {
  class Element {
    constructor() { this.children = []; this.hidden = false; this.handlers = {}; }
    append(...items) { this.children.push(...items); }
    after(item) { nodes.list = item; }
    setAttribute() {}
    replaceChildren() { this.children = []; }
    querySelector(name) { return this.parts[name] ||= new Element(); }
    querySelectorAll() { return this.buttons ||= [new Element(), new Element()]; }
    set innerHTML(value) { this.parts = {}; }
    play() { return Promise.resolve(); }
    pause() {}
    addEventListener(type, handler) { this.handlers[type] = handler; }
  }
  const nodes = { users: new Element() }, peers = new Map(), intervals = [], signals = [];
  const context = {
    document: { createElement: () => new Element(), body: new Element(), head: new Element() },
    $: () => nodes.users,
    state: { identity: { id: 'self' } }, voicePeers: peers, screenStream: null,
    console, MediaStream: class { constructor(tracks) { this.tracks = tracks; } getVideoTracks() { return this.tracks; } },
    setInterval: fn => intervals.push(fn), sendVoiceSignal: data => signals.push(data),
    ensureVoicePeer(person) {
      if (!peers.has(person.id)) {
        const handlers = {}, transceivers = [{ direction: 'sendrecv', sender: { track: { kind: 'audio' } }, receiver: { track: { kind: 'audio' } } }];
        peers.set(person.id, { person, connection: {
          handlers, transceivers, signalingState: 'stable',
          addEventListener: (type, fn) => { handlers[type] = fn; },
          getTransceivers: () => transceivers,
          addTransceiver: (kind, options = {}) => { const item = { direction: options.direction, sender: { track: null, replaceTrack: async track => { peers.get(person.id).sent = track; (peers.get(person.id).sentByKind ||= {})[kind] = track; } }, receiver: { track: { kind } } }; transceivers.push(item); return item; }
        } });
      }
      return peers.get(person.id);
    },
    handleVoiceSignal() {}, closeVoicePeer: id => peers.delete(id), stopVoice: () => peers.clear()
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/streams.js', 'utf8'), context);
  const signal = (id, type) => context.handleVoiceSignal({ data: JSON.stringify({ type, from: { id, name: id } }) });
  return { context, nodes, peers, signals, signal, sync: intervals[0], viewer: context.document.body.children[0] };
}

test('each screen is selected explicitly; stopping another user leaves the viewer open', () => {
  const h = harness();
  h.signal('alice', 'screen-start'); h.signal('bob', 'screen-start');
  assert.equal(h.nodes.list.children.length, 2);
  assert.equal(h.viewer.hidden, true);
  h.nodes.list.children[0].onclick();
  assert.equal(h.viewer.hidden, false);
  h.signal('bob', 'screen-stop');
  assert.equal(h.viewer.hidden, false);
  h.signal('alice', 'screen-stop');
  assert.equal(h.viewer.hidden, true);
});

test('ongoing share reaches a late participant and stop/start reuses its sender', async () => {
  const h = harness(), track = { id: 'screen-1', readyState: 'live' };
  h.context.screenStream = { getVideoTracks: () => [track], getAudioTracks: () => [] };
  await h.sync();
  const peer = h.context.ensureVoicePeer({ id: 'late', name: 'Late' });
  h.context.prepareScreenOffer(peer);
  await h.sync();
  assert.equal(peer.sent, track);
  assert.equal(h.signals.at(-1).type, 'screen-start');
  h.context.screenStream = null; await h.sync();
  assert.equal(peer.sent, null);
  assert.equal(h.signals.at(-1).type, 'screen-stop');
  h.context.screenStream = { getVideoTracks: () => [track], getAudioTracks: () => [] }; await h.sync();
  assert.equal(peer.sent, track);
});

test('screen audio uses its own sender and stops together with the screen', async () => {
  const h = harness(), video = { id: 'video', readyState: 'live' }, audio = { id: 'audio', readyState: 'live' };
  const peer = h.context.ensureVoicePeer({ id: 'viewer', name: 'Viewer' });
  h.context.prepareScreenOffer(peer);
  h.context.screenStream = { getVideoTracks: () => [video], getAudioTracks: () => [audio] };
  await h.sync();
  assert.equal(peer.sentByKind.video, video);
  assert.equal(peer.sentByKind.audio, audio);
  h.context.screenStream = null;
  await h.sync();
  assert.equal(peer.sentByKind.video, null);
  assert.equal(peer.sentByKind.audio, null);
});

test('answerer reuses offered screen transceivers instead of duplicating them', () => {
  const h = harness(), peer = h.context.ensureVoicePeer({ id: 'offerer', name: 'Offerer' });
  peer.connection.addTransceiver('video', { direction: 'recvonly' });
  peer.connection.addTransceiver('audio', { direction: 'recvonly' });
  const before = peer.connection.getTransceivers().length;
  h.context.prepareScreenAnswer(peer);
  assert.equal(peer.connection.getTransceivers().length, before);
  assert.equal(before, 3);
  assert.equal(peer.screenTransceiver.direction, 'sendrecv');
  assert.equal(peer.screenAudioTransceiver.direction, 'sendrecv');
});

test('leaving voice clears all screen choices and playback', () => {
  const h = harness(); h.signal('alice', 'screen-start'); h.nodes.list.children[0].onclick();
  h.context.stopVoice();
  assert.equal(h.nodes.list.children.length, 0);
  assert.equal(h.viewer.hidden, true);
  assert.equal(h.viewer.querySelector('video').srcObject, null);
});
