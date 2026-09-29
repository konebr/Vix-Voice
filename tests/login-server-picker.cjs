const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');

test('login enters the app without forcing the server picker',()=>{
  const restore=app.match(/async function restoreServer\(\)\{[^\n]+/s)?.[0]||'';
  assert.match(restore,/closePicker\(\)/);
  assert.doesNotMatch(restore,/await openPicker\(\)/);
  assert.match(restore,/Selecione um servidor/);
});
