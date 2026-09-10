const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'src', 'worker.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public', 'chat-realtime.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'public', 'chat-actions.js'), 'utf8');
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
  assert.match(client, /current\.filter\(message => !removed\.has\(message\.id\)\)/);
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

test('ações profissionais do chat respeitam autoria e permissão de moderação', () => {
  assert.match(actions, /message\.author_id === state\.identity\?\.id/);
  assert.match(actions, /capabilities\?\.manageMessages/);
  assert.match(actions, /method: 'PATCH'/);
  assert.match(actions, /method: 'DELETE'/);
  assert.match(worker, /saved\.author_id!==user\.id&&!this\.can\(serverId,user,'MANAGE_MESSAGES'\)/);
});

test('respostas, reações e pesquisa usam dados persistentes do servidor', () => {
  assert.match(worker, /reply_to TEXT DEFAULT/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS message_deletions/);
  assert.ok(worker.includes('messages\\/search'));
  assert.match(worker, /GROUP BY emoji/);
  assert.match(actions, /reply_to: replyTo/);
  assert.match(actions, /commonEmoji/);
  assert.match(actions, /messages\/search\?q=/);
});

test('interface carrega as ações depois da sincronização em tempo real', () => {
  assert.match(html, /chat-actions\.css\?v=chat-actions-2/);
  assert.match(html, /chat-actions\.js\?v=chat-actions-2/);
  assert.ok(html.indexOf('chat-realtime.js') < html.indexOf('chat-actions.js'));
  assert.match(app, /'\/chat-actions\.js'/);
  assert.match(app, /'\/chat-actions\.css'/);
});

test('arquivos são validados, armazenados separadamente e baixados com autenticação', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS message_attachments/);
  assert.match(worker, /size>4194304/);
  assert.match(worker, /JOIN messages ON messages\.id=message_attachments\.message_id/);
  assert.match(worker, /content-disposition/);
  assert.match(actions, /Authorization: `Bearer \$\{state\.identity\.token\}`/);
  assert.match(actions, /reader\.readAsDataURL/);
  assert.match(actions, /attachmentUrls/);
});

test('mensagens fixadas exigem moderação e aparecem no painel do canal', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS message_pins/);
  assert.match(worker, /Sem permissão para fixar mensagens/);
  assert.match(worker, /ORDER BY message_pins\.pinned_at DESC/);
  assert.match(actions, /capabilities\?\.manageMessages/);
  assert.match(actions, /Mensagens fixadas/);
  assert.match(actions, /async function loadPins/);
});
