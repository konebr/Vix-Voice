const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('voice roster follows joined sockets, independent of expired database rows', async () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  const begin = source.indexOf('const communityFetch=');
  const end = source.indexOf('// Sinalização WebRTC', begin);
  function Servers() {}
  Servers.prototype.fetch = async () => new Response('{}');
  vm.runInNewContext(source.slice(begin, end), { Servers, URL, Map, Date, j: (data, status = 200) => new Response(JSON.stringify(data), { status }) });
  const active = { joined: true, socket: { readyState: 1 }, user: { id: 'a', name: 'Alice' } };
  const duplicate = { ...active };
  const left = { joined: false, socket: { readyState: 1 }, user: { id: 'b', name: 'Bob' } };
  const closed = { joined: true, socket: { readyState: 3 }, user: { id: 'c', name: 'Carol' } };
  const server = new Servers();
  server.user = async () => ({ id: 'observer' });
  server.member = () => true;
  server.c = { storage: { sql: { exec: () => [] } } };
  server.voiceSockets = new Map([['room', new Set([active, duplicate, left, closed])]]);
  const get = async () => (await server.fetch(new Request('https://test/api/servers/room/voice'))).json();
  assert.deepEqual((await get()).users.map(u => u.user_id), ['a']);
  active.socket.readyState = 3;
  assert.deepEqual((await get()).users, []);
  server.member = () => false;
  assert.equal((await server.fetch(new Request('https://test/api/servers/room/voice'))).status, 403);
});
