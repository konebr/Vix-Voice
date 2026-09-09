const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('profile image validation only accepts compact raster data URLs', () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  const declaration = source.split(/\r?\n/).find(line => line.startsWith('const safeAvatar=')).replace('const safeAvatar=', 'safeAvatar=');
  const context = {};
  vm.createContext(context); vm.runInContext(declaration, context);
  assert.equal(context.safeAvatar('data:image/jpeg;base64,YWJj'), 'data:image/jpeg;base64,YWJj');
  assert.equal(context.safeAvatar('data:image/svg+xml;base64,YWJj'), '');
  assert.equal(context.safeAvatar(`data:image/png;base64,${'a'.repeat(180001)}`), '');
});

test('profiles persist and are shared with member surfaces', () => {
  const worker = fs.readFileSync('src/worker.js', 'utf8');
  const app = fs.readFileSync('public/app.js', 'utf8');
  const voice = fs.readFileSync('public/server-management.js', 'utf8');
  assert.match(worker, /u\.pathname==='\/api\/profile'/);
  assert.match(worker, /avatar TEXT DEFAULT/);
  assert.match(worker, /banner TEXT DEFAULT/);
  assert.match(worker, /custom_status TEXT DEFAULT/);
  assert.match(worker, /pronouns TEXT DEFAULT/);
  assert.match(worker, /COALESCE\(member_profiles\.avatar/);
  assert.match(worker, /COALESCE\(member_profiles\.banner/);
  assert.match(app, /document\.addEventListener\('contextmenu'/);
  assert.match(app, /data-member-id/);
  assert.match(app, /groupServerMembersByRole/);
  assert.match(app, /profile-banner-file/);
  assert.match(app, /syncedProfiles\.get\(serverId\)!==signature/);
  assert.match(voice, /window\.memberProfileFor/);
});
