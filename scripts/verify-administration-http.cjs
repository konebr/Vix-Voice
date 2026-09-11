const assert = require('node:assert/strict');

const origin = process.env.VIX_ORIGIN || 'http://127.0.0.1:8788';
async function request(path, { token, method = 'GET', body, status } = {}) {
  const response = await fetch(origin + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
  const data = await response.json();
  if (status !== undefined) { assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`); return data; }
  if (!response.ok) throw Error(`${response.status} ${path}: ${data.error}`);
  return data;
}

(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const register = name => request('/api/auth/register', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${suffix}@example.com`, password: 'administracao-123' } });
  const owner = await register('OwnerAdmin'), candidate = await register('CandidateAdmin');
  const server = await request('/api/servers', { token: owner.token, method: 'POST', body: { name: 'Servidor Seguro' } });
  let management = await request(`/api/servers/${server.id}/manage`, { token: owner.token });
  assert.equal(management.isOwner, true);
  assert.ok(management.permissions.some(item => item.key === 'MODERATE_MEMBERS'));

  await request(`/api/servers/${server.id}/security-settings`, { token: owner.token, method: 'PATCH', body: { require_approval: true, anti_spam: true } });
  const { invite } = await request(`/api/servers/${server.id}/invites`, { token: owner.token, method: 'POST', body: { expires_hours: 1, max_uses: 2 } });
  const pending = await request(`/api/servers/join/${invite.code}`, { token: candidate.token, method: 'POST', status: 202 });
  assert.equal(pending.pending, true);
  management = await request(`/api/servers/${server.id}/manage`, { token: owner.token });
  assert.equal(management.pendingMembers.length, 1);
  await request(`/api/servers/${server.id}/member-requests/${management.pendingMembers[0].id}/approve`, { token: owner.token, method: 'POST', body: {} });

  management = await request(`/api/servers/${server.id}/manage`, { token: owner.token });
  const member = management.members.find(item => item.user_id === candidate.user.id), memberRole = management.roles.find(item => item.id === member.role_id), voiceChannel = management.voiceChannels[0];
  await request(`/api/servers/${server.id}/channel-permissions`, { token: owner.token, method: 'PATCH', body: { channel_type: 'text', channel_id: 'geral', role_id: memberRole.id, deny: ['SEND_MESSAGES'], allow: [] } });
  await request(`/api/servers/${server.id}/messages`, { token: candidate.token, method: 'POST', body: { channel: 'geral', text: 'bloqueada' }, status: 403 });
  await request(`/api/servers/${server.id}/channel-permissions`, { token: owner.token, method: 'PATCH', body: { channel_type: 'text', channel_id: 'geral', role_id: memberRole.id, deny: [], allow: ['SEND_MESSAGES'] } });
  for (let index = 0; index < 3; index++) await request(`/api/servers/${server.id}/messages`, { token: candidate.token, method: 'POST', body: { channel: 'geral', text: 'mensagem repetida' } });
  await request(`/api/servers/${server.id}/messages`, { token: candidate.token, method: 'POST', body: { channel: 'geral', text: 'mensagem repetida' }, status: 429 });

  await request(`/api/servers/${server.id}/members/${candidate.user.id}/moderate`, { token: owner.token, method: 'POST', body: { action: 'mute', duration_minutes: 10, reason: 'Teste automatizado' } });
  await request(`/api/servers/${server.id}/voice-signal?session=test`, { token: candidate.token, method: 'POST', body: { type: 'voice-join', channel: voiceChannel.id }, status: 403 });
  await request(`/api/servers/${server.id}/members/${candidate.user.id}/moderate`, { token: owner.token, method: 'POST', body: { action: 'clear' } });
  await request(`/api/servers/${server.id}/transfer-owner`, { token: owner.token, method: 'POST', body: { user_id: candidate.user.id, confirmation: 'errado' }, status: 400 });
  await request(`/api/servers/${server.id}/transfer-owner`, { token: owner.token, method: 'POST', body: { user_id: candidate.user.id, confirmation: server.name } });
  const transferred = await request(`/api/servers/${server.id}/manage`, { token: candidate.token });
  assert.equal(transferred.isOwner, true);
  assert.ok(transferred.audit.some(item => item.action === 'OWNERSHIP_TRANSFER'));
  console.log('OK: administração avançada validada na homologação.');
})().catch(error => { console.error(error); process.exitCode = 1; });
