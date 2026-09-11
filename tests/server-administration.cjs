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
