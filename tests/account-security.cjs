const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('device labels distinguish desktop app, browser and operating system', () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  const begin = source.indexOf('function sessionDevice');
  const end = source.indexOf('Users.prototype.ensureAccountSecurity', begin);
  const context = {};
  vm.runInNewContext(`${source.slice(begin, end)};globalThis.sessionDevice=sessionDevice`, context);
  assert.equal(context.sessionDevice('Mozilla/5.0 (Windows NT 10.0) Electron/39.0'), 'Vix Voice para Windows');
  assert.equal(context.sessionDevice('Mozilla/5.0 (Windows NT 10.0) Edg/140.0'), 'Microsoft Edge em Windows');
  assert.equal(context.sessionDevice('Mozilla/5.0 (Android 16) Chrome/140.0'), 'Google Chrome em Android');
});

test('account security limits login attempts and manages individual sessions', () => {
  const worker = fs.readFileSync('src/worker.js', 'utf8');
  const settings = fs.readFileSync('public/settings-modern.js', 'utf8');
  assert.match(worker, /CREATE TABLE IF NOT EXISTS login_attempts/);
  assert.match(worker, /count>=5\?now\+900000/);
  assert.match(worker, /status:429/);
  assert.match(worker, /DELETE FROM login_attempts WHERE window_started<\?/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS session_metadata/);
  assert.match(worker, /\/api\/account\/sessions/);
  assert.match(worker, /token<>\?/);
  assert.match(settings, /Dispositivos conectados/);
  assert.match(settings, /Encerrar outras sessões/);
  assert.match(settings, /data\.sessionId|dataset\.sessionId/);
});
