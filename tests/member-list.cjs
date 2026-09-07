const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('member list groups presence and orders roles', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const begin = source.indexOf('const memberRoleLabel=');
  const end = source.indexOf('function createMemberRow', begin);
  const context = {};
  vm.runInNewContext(`${source.slice(begin, end)};globalThis.organizeServerMembers=organizeServerMembers;globalThis.memberRoleLabel=memberRoleLabel`, context);
  const members = [
    { name: 'Membro offline', role: 'Membro', online: 0 },
    { name: 'Admin online', role: 'Admin', online: 1 },
    { name: 'Dono online', role: 'Dono', online: '1' },
    { name: 'Membro online', role: 'Membro', online: true }
  ];
  assert.deepEqual(Array.from(context.organizeServerMembers(members), member => member.name), ['Dono online', 'Admin online', 'Membro online', 'Membro offline']);
  assert.equal(context.memberRoleLabel('Admin'), 'Administrador');
  assert.equal(context.memberRoleLabel('Membro'), 'Membro');
});
