const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const landing = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const webApp = fs.readFileSync(path.join(root, 'public', 'app', 'index.html'), 'utf8');
const electron = fs.readFileSync(path.join(root, 'electron-main.cjs'), 'utf8');
const invites = fs.readFileSync(path.join(root, 'public', 'server-management.js'), 'utf8');

assert.match(landing, /href="\/app\/"/, 'a página inicial deve abrir a versão web');
assert.match(landing, /href="\/download\/Vix-Voice-Setup\.exe"/, 'a página inicial deve oferecer o instalador');
assert.match(landing, /Electron\\\//, 'instalações antigas do Electron devem ser encaminhadas direto ao aplicativo');
assert.match(webApp, /<base href="\/">/, 'a versão web deve carregar recursos pela raiz');
assert.match(electron, /https:\/\/app\.vix-voice\.com\.br\/app\//, 'o Electron deve abrir diretamente o aplicativo');
assert.match(invites, /location\.origin}\/app\/\?invite=/, 'convites devem abrir a versão web');

console.log('landing and download navigation: ok');
