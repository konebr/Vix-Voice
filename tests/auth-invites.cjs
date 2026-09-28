const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const html = fs.readFileSync('public/app/index.html', 'utf8');
const css = fs.readFileSync('public/hud-refresh.css', 'utf8');
const worker = fs.readFileSync('src/worker.js', 'utf8');

test('convites aceitam link completo, parâmetro e código', () => {
  assert.match(app, /function normalizeInviteCode/);
  assert.match(app, /pathname\.match\(\/\\\/i\\\/\(\[\\w-\]\+\)\/i\)/);
  assert.match(app, /searchParams\.get\('invite'\)/);
  assert.match(app, /Link ou código do convite/);
  assert.match(worker, /status:302/);
  assert.match(worker, /headers:\{location:destination/);
});

test('criação de servidor usa uma rota explícita e compatível', () => {
  assert.match(app, /api\('\/api\/servers\/create'/);
  assert.match(worker, /url\.pathname==='\/api\/servers\/create'/);
  assert.match(worker, /https:\/\/servers\/api\/servers/);
});

test('login, cadastro e menu de membros usam a interface moderna', () => {
  assert.match(html, /class="join-card auth-card"/);
  assert.match(html, /id="password-toggle"/);
  assert.match(html, /id="auth-invite-note"/);
  assert.match(css, /Acesso moderno: login e cadastro/);
  assert.match(css, /Menu de membro: ícones vetoriais/);
  assert.match(app, /window\.vixIcon\?\.\(icon,15\)/);
});

test('selo GM global é sincronizado e visível para os demais membros', () => {
  assert.match(worker, /member_profiles','is_gm INTEGER DEFAULT 0/);
  assert.match(worker, /UPDATE member_profiles SET is_gm=/);
  assert.match(worker, /member_profiles\.is_gm,0\) AS is_gm/);
  assert.match(app, /Number\(member\.is_gm\)/);
  assert.match(css, /\.gm-badge/);
});
