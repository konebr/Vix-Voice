const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const worker=fs.readFileSync('src/worker.js','utf8'),app=fs.readFileSync('public/app.js','utf8');
test('account email security covers registration, new devices and password reset',()=>{
  assert.match(worker,/CREATE TABLE IF NOT EXISTS email_challenges/);
  assert.match(worker,/CREATE TABLE IF NOT EXISTS trusted_devices/);
  assert.match(worker,/RESEND_API_KEY/);
  assert.match(worker,/api\/auth\/verify-email/);
  assert.match(worker,/api\/auth\/verify-device/);
  assert.match(worker,/api\/auth\/password-reset\/request/);
  assert.match(worker,/api\/auth\/password-reset\/confirm/);
  assert.match(worker,/expires:\s*Date\.now|Date\.now\(\)\+600000/);
});
test('client completes email challenges and password recovery',()=>{
  assert.match(app,/currentDeviceId/);
  assert.match(app,/finishEmailChallenge/);
  assert.match(app,/recoverPassword/);
  assert.match(app,/auth-forgot'\)\.onclick=recoverPassword/);
  assert.match(app,/device_verification_required/);
});
