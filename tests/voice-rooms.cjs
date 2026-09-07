const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('voice signaling stays inside the selected channel', () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  const start = source.indexOf('Servers.prototype.websocket=function');
  const end = source.indexOf('// Perfis e presença', start);
  const sockets = [];
  class Socket {
    constructor() { this.handlers = {}; this.messages = []; this.readyState = 1; }
    accept() {}
    addEventListener(type, callback) { this.handlers[type] = callback; }
    send(raw) { this.messages.push(JSON.parse(raw)); }
    emit(message) { this.handlers.message({ data: JSON.stringify(message) }); }
    close() { this.readyState = 3; this.handlers.close?.(); }
  }
  class Pair { constructor() { this[0] = {}; this[1] = new Socket(); sockets.push(this[1]); } }
  class Servers { member() { return true; } can() { return true; } }
  class Response {}
  vm.runInNewContext(source.slice(start, end), { Servers, WebSocketPair: Pair, Response, Map, Set, JSON });
  const server = new Servers();
  for (const id of ['alice', 'bob', 'carol']) server.websocket({}, 'server', { id, name: id, color: '#fff' });
  const [alice, bob, carol] = sockets;
  alice.emit({ type: 'voice-join', channel: 'games' });
  bob.emit({ type: 'voice-join', channel: 'games' });
  carol.emit({ type: 'voice-join', channel: 'music' });
  assert.deepEqual(alice.messages.map(item => item.from.id), ['bob']);
  assert.deepEqual(bob.messages, []);
  assert.deepEqual(carol.messages, []);
  bob.emit({ type: 'offer', to: 'carol', offer: 'blocked' });
  assert.deepEqual(carol.messages, []);
  bob.emit({ type: 'offer', to: 'alice', offer: 'allowed' });
  assert.equal(alice.messages.at(-1).offer, 'allowed');
});
