const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('a pending voice poll wakes immediately when another participant joins', async () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  const start = source.indexOf('const pollingSignalFetch=Servers.prototype.fetch;');
  const end = source.indexOf('// A lista lateral', start);
  const j = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
  class Servers {
    async fetch() { return j({ error: 'Rota inexistente' }, 404); }
    async user(request) {
      const id = request.headers.get('x-user');
      return { id, name: id, color: '#fff' };
    }
    member() { return true; }
  }
  vm.runInNewContext(source.slice(start, end), {
    Servers, URL, Map, Set, Date, JSON, Response, setTimeout, clearTimeout, j
  });
  const server = new Servers();
  const request = (session, user, method = 'GET', body) => new Request(
    `https://server/api/servers/community/voice-signal?session=${session}`,
    { method, headers: { 'x-user': user, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }
  );

  await server.fetch(request('alice-session', 'alice', 'POST', { type: 'voice-join', channel: 'general' }));
  const pending = server.fetch(request('alice-session', 'alice'));
  const resolvedEarly = await Promise.race([
    pending.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 25))
  ]);
  assert.equal(resolvedEarly, false);

  await server.fetch(request('bob-session', 'bob', 'POST', { type: 'voice-join', channel: 'general' }));
  const response = await pending;
  const payload = await response.json();
  assert.equal(payload.events.length, 1);
  assert.equal(payload.events[0].type, 'voice-join');
  assert.equal(payload.events[0].from.id, 'bob');
});
