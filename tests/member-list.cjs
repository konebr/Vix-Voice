const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('member list groups presence and orders roles', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const begin = source.indexOf('const memberRoleLabel=');
  const end = source.indexOf('function createMemberRow', begin);
  const context = {};
  vm.runInNewContext(`${source.slice(begin, end)};globalThis.organizeServerMembers=organizeServerMembers;globalThis.groupServerMembersByRole=groupServerMembersByRole;globalThis.memberRoleLabel=memberRoleLabel;globalThis.readableRoleColor=readableRoleColor`, context);
  const members = [
    { name: 'Membro offline', role: 'Membro', online: 0 },
    { name: 'Admin online', role: 'Admin', online: 1 },
    { name: 'Dono online', role: 'Dono', online: '1' },
    { name: 'Membro online', role: 'Membro', online: true }
  ];
  assert.deepEqual(Array.from(context.organizeServerMembers(members), member => member.name), ['Dono online', 'Admin online', 'Membro online', 'Membro offline']);
  assert.equal(context.memberRoleLabel('Admin'), 'Administrador');
  assert.equal(context.memberRoleLabel('Membro'), 'Membro');
  const groups = Array.from(context.groupServerMembersByRole(members));
  assert.deepEqual(groups.map(group => group.label), ['Dono', 'Administrador', 'Membro']);
  assert.deepEqual(Array.from(groups[2].members, member => member.name), ['Membro online', 'Membro offline']);
  assert.equal(context.readableRoleColor('#000000'), '#949494');
  assert.equal(context.readableRoleColor('#eb459e'), '#eb459e');
});

test('server switching updates identity immediately and loads members in parallel', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  assert.match(source, /serverLoadSequence/);
  assert.match(source, /loadSequence!==serverLoadSequence/);
  assert.match(source, /serverMemberCache\.get\(serverId\)/);
  assert.match(source, /membersRequest=api\(`\/api\/servers\/\$\{serverId\}\/members`\)/);
  assert.match(source, /Promise\.allSettled\(\[serverRequest,membersRequest\]\)/);
  assert.match(source, /serverViewCache/);
  assert.match(source, /vix:server-switching/);
});

test('installed Vix Bot is exposed in the server member list', () => {
  const client = fs.readFileSync('public/app.js', 'utf8');
  const worker = fs.readFileSync('src/worker.js', 'utf8');
  assert.match(worker, /botInstalled.*bot_installations/);
  assert.match(worker, /user_id:'vix-bot'.*is_bot:true/);
  assert.match(client, /member\.is_bot/);
  assert.match(client, /botBadge\.textContent='BOT'/);
});

test('member context menu exposes complete permission-aware moderation', () => {
  const client = fs.readFileSync('public/app.js', 'utf8');
  const css = fs.readFileSync('public/hud-refresh.css', 'utf8');
  for (const text of ['Silenciar áudio','Suspender temporariamente','Remover restrições','Expulsar do servidor','Banir do servidor','Escolher duração…']) assert.ok(client.includes(text));
  assert.match(client, /duration_minutes:minutes/);
  assert.match(client, /capabilities\.moderateMembers/);
  assert.match(client, /capabilities\.kickMembers/);
  assert.match(client, /capabilities\.banMembers/);
  assert.match(client, /Number\(member\.role_position\)!==0/);
  assert.match(css, /Submenus de moderação/);
});

test('member context menu closes when the pointer leaves the whole panel', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  assert.match(source, /memberContextMenu\.addEventListener\('pointerleave',\(\)=>closeMemberContextMenu\(\)\)/);
  assert.doesNotMatch(source, /requestAnimationFrame\(\(\)=>memberContextMenu\.querySelector/);
});
