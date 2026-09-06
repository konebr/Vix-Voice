const assert = require('node:assert/strict');

const origin = process.env.VIX_ORIGIN || 'http://127.0.0.1:8787';
async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body && JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Error(`${response.status}: ${data.error}`);
  return data;
}

(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const register = name => request('/api/auth/register', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${suffix}@example.com`, password: 'teste-voz-123' } });
  const a = await register('TesteA'), b = await register('TesteB');
  const server = await request('/api/servers', { token: a.token, method: 'POST', body: { name: 'Teste de voz' } });
  await request(`/api/servers/join/${server.invite}`, { token: b.token, method: 'POST' });
  const { channels } = await request(`/api/servers/${server.id}/voice-channels`, { token: a.token });
  const channel = channels[0].id;
  const path = session => `/api/servers/${server.id}/voice-signal?session=${session}`;
  await request(path('sessao-a'), { token: a.token, method: 'POST', body: { type: 'voice-join', channel } });
  await request(path('sessao-b'), { token: b.token, method: 'POST', body: { type: 'voice-join', channel } });
  const signals = await request(path('sessao-a'), { token: a.token });
  assert.equal(signals.events[0].type, 'voice-join');
  assert.equal(signals.events[0].from.name, 'TesteB');
  const joined = await request(`/api/servers/${server.id}/voice`, { token: a.token });
  assert.equal(joined.users.length, 2);
  await request(path('sessao-b'), { token: b.token, method: 'POST', body: { type: 'voice-leave' } });
  const departed = await request(path('sessao-a'), { token: a.token });
  assert.equal(departed.events[0].type, 'voice-leave');
  const remaining = await request(`/api/servers/${server.id}/voice`, { token: a.token });
  assert.deepEqual(remaining.users.map(user => user.name), ['TesteA']);
  await request(path('sessao-a'), { token: a.token, method: 'POST', body: { type: 'voice-leave' } });
  console.log('OK: duas sessões entraram, trocaram sinalização e saíram corretamente.');
})().catch(error => { console.error(error); process.exitCode = 1; });
