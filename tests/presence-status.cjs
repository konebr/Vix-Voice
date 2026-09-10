const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('member presence exposes professional statuses and last seen copy', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const begin = source.indexOf('const presenceLabels=');
  const end = source.indexOf('const knownMembers=', begin);
  const context = { Date };
  vm.runInNewContext(`${source.slice(begin, end)};globalThis.memberPresence=memberPresence;globalThis.relativeLastSeen=relativeLastSeen`, context);
  assert.equal(context.memberPresence({ presence_status: 'idle', online: 1 }), 'idle');
  assert.equal(context.memberPresence({ presence_status: 'dnd', online: 1 }), 'dnd');
  assert.equal(context.memberPresence({ online: 0 }), 'offline');
  assert.match(context.relativeLastSeen(Date.now() - 180000), /3 min/);
});

test('presence preference is persisted and propagated to public and private lists', () => {
  const worker = fs.readFileSync('src/worker.js', 'utf8');
  const client = fs.readFileSync('public/presence.js', 'utf8');
  const html = fs.readFileSync('public/app/index.html', 'utf8');
  const settings = fs.readFileSync('public/settings-modern.js', 'utf8');
  assert.match(worker, /user_presence_preferences/);
  assert.match(worker, /member_presence_status/);
  assert.match(worker, /presence_status:visible\?status:'offline'/);
  assert.match(client, /online.*idle.*dnd.*invisible/);
  assert.match(client, /300000/);
  assert.match(settings, /vixPresence\?\.effective/);
  assert.match(html, /presence\.css\?v=presence-1/);
  assert.match(html, /presence\.js\?v=presence-1/);
});
