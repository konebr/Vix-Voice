const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync('src/worker.js', 'utf8');
const management = fs.readFileSync('public/server-management.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

test('permissões por canal são persistidas e aplicadas a texto e voz', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS channel_permissions/);
  assert.match(worker, /canInChannel/);
  assert.match(worker, /Seu cargo não pode enviar mensagens neste canal/);
  assert.match(worker, /Seu cargo não pode entrar neste canal de voz/);
  assert.match(management, /Acessos por canal/);
  assert.match(management, /Herdar do cargo/);
});

test('moderação temporária impede interação e desconecta a voz', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS member_sanctions/);
  assert.match(worker, /disconnectVoiceMember/);
  assert.match(worker, /MEMBER_SANCTION_CLEAR/);
  assert.match(management, /Timeout por 10 min/);
  assert.match(management, /Silenciar por 10 min/);
});

test('aprovação de entrada mantém solicitações fora da lista de membros', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS membership_requests/);
  assert.match(worker, /pending:true/);
  assert.match(worker, /member-requests/);
  assert.match(app, /Solicitação enviada\. Um moderador precisa aprovar sua entrada/);
  assert.match(management, /Solicitações pendentes/);
});

test('antispam e transferência de propriedade possuem validações no servidor', () => {
  assert.match(worker, /message_rate_limits/);
  assert.match(worker, /blockedHosts=new Set/);
  assert.match(worker, /confirmation!==server\.name/);
  assert.match(worker, /transactionSync/);
  assert.match(worker, /OWNERSHIP_TRANSFER/);
});

test('painel moderno resume e localiza configurações administrativas', () => {
  const styles = fs.readFileSync('public/server-management.css', 'utf8');
  assert.match(management, /management-summary/);
  assert.match(management, /Buscar configuração/);
  assert.match(management, /tabDescriptions/);
  assert.match(management, /event\.key === 'Escape'/);
  assert.match(styles, /Painel administrativo moderno/);
  assert.match(styles, /management-summary/);
});

test('servidores aceitam foto personalizada e convite rápido compartilhável', () => {
  const html = fs.readFileSync('public/app/index.html', 'utf8');
  const shell = fs.readFileSync('public/modern-shell.css', 'utf8');
  assert.match(worker, /addColumn\(c\.storage\.sql,'servers','image TEXT DEFAULT/);
  assert.match(worker, /UPDATE servers SET name=\?,icon=\?,image=\?/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS server_images/);
  assert.match(worker, /INSERT OR REPLACE INTO server_images VALUES/);
  assert.match(worker, /serverWithImage/);
  assert.match(worker, /saved\.image!==image/);
  assert.match(management, /readServerImage/);
  assert.match(management, /openServerInvite/);
  assert.match(management, /expires_hours: 168/);
  assert.doesNotMatch(html, /Clube de jogos|data-tip="Estúdio"/);
  assert.match(shell, /\.server\.add\{display:grid!important;place-items:center!important/);
});

test('categorias organizam livremente salas de texto e voz', () => {
  const styles = fs.readFileSync('public/modern-shell.css', 'utf8');
  assert.match(worker, /CREATE TABLE IF NOT EXISTS channel_categories/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS channel_layout_state/);
  assert.match(worker, /category_id TEXT DEFAULT/);
  assert.match(worker, /topic TEXT DEFAULT/);
  assert.match(worker, /CATEGORY_CREATE/);
  assert.match(worker, /CATEGORY_DELETE/);
  assert.doesNotMatch(worker, /servidor precisa manter pelo menos um canal de voz/);
  assert.match(management, /Canais e categorias/);
  assert.match(management, /Criar categoria/);
  assert.match(management, /Sem categoria/);
  assert.match(management, /if \(!activeUsers\.isConnected\)/);
  assert.match(app, /const list=\$\('voice-users'\);if\(!list\|\|!microphoneStream/);
  assert.match(app, /custom-channel-category/);
  assert.match(styles, /\.custom-channel-category/);
});
