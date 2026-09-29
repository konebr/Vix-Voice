const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('leadership status is persisted and shown without granting access to other owners servers', () => {
  const worker = fs.readFileSync('src/worker.js', 'utf8');
  const app = fs.readFileSync('public/app.js', 'utf8');
  const settings = fs.readFileSync('public/settings-modern.js', 'utf8');
  assert.match(worker, /is_gm INTEGER DEFAULT 0/);
  assert.match(worker, /COALESCE\(users\.is_gm,0\) AS is_gm/);
  assert.match(app, /vix-gm-account/);
  assert.match(app, /gmBadge\.textContent='CEO • DEV'/);
  assert.match(app, /message-leadership-badge/);
  assert.match(app, /Fundador, CEO e Desenvolvedor do Vix/);
  assert.match(settings, /CEO • DEV/);
  assert.doesNotMatch(worker, /permissionsFor[^\n]+is_gm/);
  assert.doesNotMatch(worker, /member\(s,u\)[^\n]+is_gm/);
});

test('form fields use a neutral focus border throughout Vix', () => {
  const css = fs.readFileSync('public/modern-shell.css', 'utf8');
  assert.match(css, /input,textarea,select[^}]+border-color:#4b566b!important[^}]+box-shadow:none!important/);
});
