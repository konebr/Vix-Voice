const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('profile image validation accepts compact static and animated raster data URLs', () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  const declaration = source.split(/\r?\n/).find(line => line.startsWith('const safeAvatar=')).replace('const safeAvatar=', 'safeAvatar=');
  const bannerDeclaration = source.split(/\r?\n/).find(line => line.startsWith('const safeBanner=')).replace('const safeBanner=', 'safeBanner=');
  const context = {};
  vm.createContext(context); vm.runInContext(`${declaration};${bannerDeclaration}`, context);
  assert.equal(context.safeAvatar('data:image/jpeg;base64,YWJj'), 'data:image/jpeg;base64,YWJj');
  assert.equal(context.safeAvatar('data:image/gif;base64,R0lGODlh'), 'data:image/gif;base64,R0lGODlh');
  assert.equal(context.safeBanner('data:image/gif;base64,R0lGODlh'), 'data:image/gif;base64,R0lGODlh');
  assert.equal(context.safeAvatar('data:image/svg+xml;base64,YWJj'), '');
  assert.equal(context.safeAvatar(`data:image/png;base64,${'a'.repeat(900001)}`), '');
  assert.equal(context.safeBanner(`data:image/gif;base64,${'a'.repeat(2200001)}`), '');
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
  assert.match(app, /row\.oncontextmenu=event=>showMemberProfileCard/);
  assert.match(app, /row\.onclick=event=>showMemberProfileCard/);
  assert.match(app, /row\.onkeydown=event=>/);
  assert.match(app, /event\.button!==2/, 'o clique direito não deve fechar o cartão ao abri-lo');
  assert.match(app, /data-member-id/);
  assert.match(app, /groupServerMembersByRole/);
  assert.match(app, /profile-banner-file/);
  assert.match(app, /image\/gif/);
  assert.match(app, /memberCard\.classList\.add\('is-opening'\)/);
  assert.match(app, /syncedProfiles\.get\(serverId\)!==signature/);
  assert.match(voice, /window\.memberProfileFor/);
});
