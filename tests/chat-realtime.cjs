const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'src', 'worker.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public', 'chat-realtime.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'app', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('servidor oferece sincronização incremental autenticada', () => {
  assert.match(worker, /\/messages\$\/\),typing=.*\/typing\$\//s);
  assert.match(worker, /this\.can\(serverId,user,'VIEW_CHANNELS'\)/);
  assert.match(worker, /created>=\? OR edited>=\?/);
  assert.match(worker, /cursor:now/);
});

test('estado de digitação é efêmero, limitado por canal e expira', () => {
  assert.match(worker, /this\.chatTyping/);
  assert.match(worker, /now-entry\.updated>6500/);
  assert.match(worker, /entry\.serverId===serverId&&entry\.user_id!==user\.id/);
  assert.match(worker, /SELECT name FROM channels WHERE server_id=\? AND name=\?/);
});

test('cliente mescla mensagens, evita duplicatas e acompanha não lidas', () => {
  assert.match(client, /new Map\(current\.map\(message => \[message\.id, message\]\)\)/);
  assert.match(client, /unread\.set\(message\.channel/);
  assert.match(client, /channel-unread/);
  assert.match(client, /setTimeout\(synchronize/);
});

test('menções e digitação estão ligadas à interface e às notificações', () => {
  assert.match(client, /value\.includes\('@todos'\)/);
  assert.match(client, /window\.vixNotify\?\./);
  assert.match(client, /está digitando/);
  assert.match(client, /publishTyping\(false\)/);
});

test('ativos do chat são carregados e participam da atualização automática', () => {
  assert.match(html, /chat-realtime\.css\?v=chat-2/);
  assert.match(html, /chat-realtime\.js\?v=chat-2/);
  assert.ok(html.indexOf('settings-modern.js') < html.indexOf('chat-realtime.js'));
  assert.match(app, /'\/chat-realtime\.js'/);
  assert.match(app, /'\/chat-realtime\.css'/);
});
