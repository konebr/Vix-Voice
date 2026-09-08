const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'electron-main.cjs'), 'utf8');

assert.match(source, /https:\/\/app\.vix-voice\.com\.br/, 'o aplicativo deve abrir o domínio oficial');
assert.match(source, /contextIsolation:\s*true/, 'o isolamento de contexto deve permanecer ativo');
assert.match(source, /nodeIntegration:\s*false/, 'a integração Node deve permanecer desativada');
assert.match(source, /sandbox:\s*true/, 'o sandbox do renderer deve permanecer ativo');
assert.match(source, /setPermissionRequestHandler/, 'as permissões precisam de validação explícita');
assert.match(source, /setDisplayMediaRequestHandler/, 'o compartilhamento de tela deve usar o seletor nativo do aplicativo');
assert.match(source, /requestSingleInstanceLock/, 'somente uma instância deve executar por vez');
assert.match(source, /new Tray\(/, 'o aplicativo deve continuar disponível na bandeja');
assert.match(source, /wasHidden[\s\S]*reloadIgnoringCache/, 'reabrir uma janela oculta deve buscar a versão mais recente');

console.log('electron shell: ok');
