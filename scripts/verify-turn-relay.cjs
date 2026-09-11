const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const origin = process.env.VIX_ORIGIN || 'http://127.0.0.1:8788';
(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const login = await fetch(`${origin}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'TesteTurn', email: `turn-${suffix}@example.com`, password: 'teste-turn-123' }) });
  assert.equal(login.status, 200); const { token } = await login.json();
  const response = await fetch(`${origin}/api/servers/_turn`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200); const servers = await response.json();
  assert.ok(Array.isArray(servers) && servers.length >= 2);
  assert.ok(servers.every(server => String(server.urls).startsWith('turn:')));
  assert.ok(servers.some(server => String(server.urls).includes('transport=udp')));
  assert.ok(servers.some(server => String(server.urls).includes('transport=tcp')));
  const credential = servers[0], parsed = new URL(String(credential.urls).replace(/^turn:/, 'http:'));
  assert.ok(Number(String(credential.username).split(':')[0]) > Math.floor(Date.now() / 1000));
  const test = spawnSync('turnutils_uclient', ['-y', '-c', '-n', '2', '-u', credential.username, '-w', credential.credential, '-p', parsed.port || '3478', parsed.hostname], { encoding: 'utf8', timeout: 25000 });
  if (test.status !== 0) throw Error(`coturn recusou a alocação (${test.status ?? 'timeout'}): ${(test.stderr || test.stdout || '').slice(-400)}`);
  console.log('OK: credencial temporária e tráfego TURN obrigatório validados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
