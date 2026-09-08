const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(source, /function preferredServer\(servers\)/, 'a inicialização deve escolher um servidor válido');
assert.match(source, /servers\.find\(server=>server\.id===lastId\)\|\|servers\[0\]\|\|null/, 'um servidor removido deve cair no primeiro disponível');
assert.match(source, /queueMicrotask\(boot\)/, 'o boot deve começar somente depois que os complementos da interface forem registrados');
assert.doesNotMatch(source, /setTimeout\(async\(\)=>\{if\(!state\.identity\)return;if\(privateInvite\)/, 'o seletor privado não deve competir com o boot');
assert.doesNotMatch(source, /setTimeout\(async\(\)=>\{if\(state\.identity&&!state\.server\)/, 'a restauração não deve depender de temporizador');
assert.match(source, /refreshWhenClientChanged/, 'o cliente deve verificar atualizações publicadas');
assert.match(source, /cache:'no-store'/, 'a verificação de atualização não deve reutilizar o cache local');
const setup = source.match(/function setup\(\)[^\n]+/)[0];
assert.match(setup, /\$\('leave'\)\.onclick=\(\)=>openUserSettings\(\)/, 'a inicialização deve manter a engrenagem ligada às configurações do usuário');
assert.doesNotMatch(setup, /\$\('leave'\)\.onclick=openPicker/, 'a engrenagem não deve abrir o seletor de servidores');

console.log('server startup: ok');
