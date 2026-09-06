const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('TURN uses the current Metered credentials endpoint and validates relay servers', () => {
  const source = fs.readFileSync('src/worker.js', 'utf8');
  assert.match(source, /\/api\/v1\/turn\/credentials\?apiKey=/);
  assert.doesNotMatch(source, /\/api\/v1\/turn\/credential\?secretKey=/);
  assert.match(source, /startsWith\('turn'\)/);
});
