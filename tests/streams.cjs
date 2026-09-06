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
        const handlers = {};
        peers.set(person.id, { person, connection: {
          handlers, signalingState: 'stable',
          addEventListener: (type, fn) => { handlers[type] = fn; },
          addTransceiver: () => ({ sender: { replaceTrack: async track => { peers.get(person.id).sent = track; } } })
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
  h.context.screenStream = { getVideoTracks: () => [track] };
  await h.sync();
  const peer = h.context.ensureVoicePeer({ id: 'late', name: 'Late' });
  await h.sync();
  assert.equal(peer.sent, track);
  assert.equal(h.signals.at(-1).type, 'screen-start');
  h.context.screenStream = null; await h.sync();
  assert.equal(peer.sent, null);
  assert.equal(h.signals.at(-1).type, 'screen-stop');
  h.context.screenStream = { getVideoTracks: () => [track] }; await h.sync();
  assert.equal(peer.sent, track);
});

test('leaving voice clears all screen choices and playback', () => {
  const h = harness(); h.signal('alice', 'screen-start'); h.nodes.list.children[0].onclick();
  h.context.stopVoice();
  assert.equal(h.nodes.list.children.length, 0);
  assert.equal(h.viewer.hidden, true);
  assert.equal(h.viewer.querySelector('video').srcObject, null);
});
