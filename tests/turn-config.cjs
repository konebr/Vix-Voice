const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('TURN uses the current Metered credentials endpoint and validates relay servers', () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  assert.match(source, /METERED_TURN_USERNAME/);
  assert.match(source, /METERED_TURN_PASSWORD/);
  assert.match(source, /turns:global\.relay\.metered\.ca:443/);
  assert.match(source, /\/api\/v1\/turn\/credentials\?apiKey=/);
  assert.doesNotMatch(source, /\/api\/v1\/turn\/credential\?secretKey=/);
  assert.match(source, /startsWith\('turn'\)/);
});

test('voice and private calls use the self-hosted TURN as mandatory relay', () => {
  const worker = fs.readFileSync('src/worker.js', 'utf8');
  const app = fs.readFileSync('public/app.js', 'utf8');
  const privateCalls = fs.readFileSync('public/private.js', 'utf8');
  assert.match(worker, /TURN_SECRET/);
  assert.match(worker, /hash:'SHA-1'/);
  assert.match(worker, /turn:\$\{host\}:3478\?transport=udp/);
  assert.match(app, /iceTransportPolicy:'relay'/);
  assert.match(app, /api\('\/api\/servers\/_turn'\)/);
  assert.match(privateCalls, /iceTransportPolicy:'relay'/);
  assert.doesNotMatch(privateCalls, /stun\.l\.google\.com/);
});
