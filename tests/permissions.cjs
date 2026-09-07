const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('role permissions accept known capabilities and discard unknown values', () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  const begin = source.indexOf('const PERMISSION_DEFINITIONS=');
  const end = source.indexOf('Servers.prototype.ensureRoleSystem', begin);
  const context = {};
  vm.runInNewContext(`${source.slice(begin, end)};globalThis.permissionMask=permissionMask;globalThis.PERMISSIONS=PERMISSIONS;globalThis.ALL_PERMISSIONS=ALL_PERMISSIONS`, context);
  const mask = context.permissionMask(['VIEW_CHANNELS', 'SEND_MESSAGES', 'BAN_MEMBERS', 'UNKNOWN']);
  assert.equal(mask, context.PERMISSIONS.VIEW_CHANNELS | context.PERMISSIONS.SEND_MESSAGES | context.PERMISSIONS.BAN_MEMBERS);
  assert.equal(context.permissionMask(999999), 999999 & context.ALL_PERMISSIONS);
  assert.equal(context.permissionMask([]), 0);
});
