const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('logout invalidates the server session and clears the local client session', () => {
  const worker = fs.readFileSync('src/worker.js', 'utf8');
  const app = fs.readFileSync('public/app.js', 'utf8');
  assert.match(worker, /u\.pathname==='\/api\/auth\/logout'/);
  assert.match(worker, /DELETE FROM sessions WHERE token=\?/);
  assert.match(app, /id="settings-logout"/);
  assert.match(app, /api\('\/api\/auth\/logout'/);
  assert.match(app, /localStorage\.removeItem\(SESSION\)/);
});
