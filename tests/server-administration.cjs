const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync('src/worker.js', 'utf8');
const management = fs.readFileSync('public/server-management.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

test('permissões por canal são persistidas e aplicadas a texto e voz', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS channel_permissions/);
  assert.match(worker, /canInChannel/);
  assert.match(worker, /Seu cargo não pode enviar mensagens neste canal/);
  assert.match(worker, /Seu cargo não pode entrar neste canal de voz/);
  assert.match(management, /Acessos por canal/);
  assert.match(management, /Herdar do cargo/);
});

test('moderação temporária impede interação e desconecta a voz', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS member_sanctions/);
  assert.match(worker, /disconnectVoiceMember/);
  assert.match(worker, /MEMBER_SANCTION_CLEAR/);
  assert.match(management, /Timeout por 10 min/);
  assert.match(management, /Silenciar por 10 min/);
});

test('aprovação de entrada mantém solicitações fora da lista de membros', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS membership_requests/);
  assert.match(worker, /pending:true/);
  assert.match(worker, /member-requests/);
  assert.match(app, /Solicitação enviada\. Um moderador precisa aprovar sua entrada/);
  assert.match(management, /Solicitações pendentes/);
});

test('antispam e transferência de propriedade possuem validações no servidor', () => {
  assert.match(worker, /message_rate_limits/);
  assert.match(worker, /blockedHosts=new Set/);
  assert.match(worker, /confirmation!==server\.name/);
  assert.match(worker, /transactionSync/);
  assert.match(worker, /OWNERSHIP_TRANSFER/);
});

test('somente o criador delega a permissão de gerenciar cargos', () => {
  assert.match(worker, /manageRoles:can\('MANAGE_ROLES'\)/);
  assert.match(worker, /Somente o criador pode criar cargos que gerenciam cargos/);
  assert.match(worker, /Somente o criador pode alterar cargos que gerenciam cargos/);
  assert.match(worker, /Somente o criador pode atribuir cargos que gerenciam cargos/);
  assert.match(management, /\['MANAGE_ROLES','ADMINISTRATOR'\]\.includes\(permission\.key\)/);
});

test('membros podem acumular vários cargos com permissões combinadas', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS member_role_assignments/);
  assert.match(worker, /permissions\|=Number\(role\.permissions/);
  assert.match(worker, /assignedRoleIds/);
  assert.match(worker, /body\.assigned!==false/);
  assert.match(worker, /INSERT OR IGNORE INTO member_role_assignments VALUES/);
});

test('painel moderno resume e localiza configurações administrativas', () => {
  const styles = fs.readFileSync('public/server-management.css', 'utf8');
  assert.match(management, /management-summary/);
  assert.match(management, /Buscar configuração/);
  assert.match(management, /tabDescriptions/);
  assert.match(management, /event\.key === 'Escape'/);
  assert.match(styles, /Painel administrativo moderno/);
  assert.match(styles, /management-summary/);
});

test('painel permite chamar o Vix Bot para o servidor escolhido', () => {
  assert.match(management, /data-tab="bots">Bots e integrações/);
  assert.match(management, /Chamar para este servidor/);
  assert.match(management, /\/bots\/vix/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS bot_installations/);
  assert.match(worker, /Sem permissão para gerenciar bots/);
  assert.match(worker, /runVixBotCommand[\s\S]*bot_installations/);
});

test('janelas da comunidade usam cartões modernos e acessíveis', () => {
  const styles = fs.readFileSync('public/modern-shell.css', 'utf8');
  const html = fs.readFileSync('public/app/index.html', 'utf8');
  assert.match(app, /community-modal/);
  assert.match(app, /aria-modal/);
  assert.match(app, /community-card-header/);
  assert.match(app, /community-primary-action/);
  assert.match(app, /if\(event\.key==='Escape'\)closeCommunity/);
  assert.doesNotMatch(app, /id="community-close"[^>]+style=/);
  assert.match(styles, /Janelas da comunidade/);
  assert.match(styles, /\.community-card\{/);
  assert.match(styles, /\.community-list-button:hover/);
  assert.match(html, /app\.js\?v=feature-pack-1/);
  assert.match(app, /creatorReturnToPicker=!picker\.hidden/);
  assert.match(app, /picker\.hidden=true;creator\.hidden=false/);
});

test('servidores aceitam foto personalizada e convite rápido compartilhável', () => {
  const html = fs.readFileSync('public/app/index.html', 'utf8');
  const shell = fs.readFileSync('public/modern-shell.css', 'utf8');
  assert.match(worker, /addColumn\(c\.storage\.sql,'servers','image TEXT DEFAULT/);
  assert.match(worker, /UPDATE servers SET name=\?,icon=\?,image=\?/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS server_images/);
  assert.match(worker, /INSERT OR REPLACE INTO server_images VALUES/);
  assert.match(worker, /serverWithImage/);
  assert.match(worker, /saved\.image!==image/);
  assert.match(management, /readServerImage/);
  assert.match(management, /openServerInvite/);
  assert.match(management, /location\.origin}\/i\/\$\{encodeURIComponent\(invite\.code\)\}/);
  assert.match(worker, /shortInvite=u\.pathname\.match/);
  assert.match(worker, /http-equiv=\"refresh\"/);
  assert.match(worker, /\['GET','HEAD'\]\.includes/);
  assert.match(management, /expires_hours: 168/);
  assert.doesNotMatch(html, /Clube de jogos|data-tip="Estúdio"/);
  assert.match(shell, /\.server\.add\{display:grid!important;place-items:center!important/);
});

test('categorias organizam livremente salas de texto e voz', () => {
  const styles = fs.readFileSync('public/modern-shell.css', 'utf8');
  assert.match(worker, /CREATE TABLE IF NOT EXISTS channel_categories/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS channel_layout_state/);
  assert.match(worker, /category_id TEXT DEFAULT/);
  assert.match(worker, /topic TEXT DEFAULT/);
  assert.match(worker, /CATEGORY_CREATE/);
  assert.match(worker, /CATEGORY_DELETE/);
  assert.match(worker, /type='mixed'/);
  assert.match(worker, /SELECT id FROM channel_categories WHERE id=\? AND server_id=\?/);
  assert.match(worker, /voice_names_by_category/);
  assert.match(worker, /COALESCE\(category_id,""\)=\? AND lower\(name\)=lower\(\?\)/);
  assert.match(worker, /Já existe uma sala de voz com esse nome nesta categoria/);
  assert.doesNotMatch(worker, /servidor precisa manter pelo menos um canal de voz/);
  assert.match(management, /Canais e categorias/);
  assert.match(management, /Criar categoria/);
  assert.match(management, /Sem categoria/);
  assert.match(management, /Categoria para canais de texto e voz/);
  assert.match(management, /const textRooms/);
  assert.match(management, /voiceRooms = voiceChannels/);
  assert.match(management, /if \(!list\.contains\(activeUsers\)\)/);
  assert.match(app, /const list=\$\('voice-users'\);if\(!list\|\|!microphoneStream/);
  assert.match(app, /custom-channel-category/);
  assert.match(styles, /\.custom-channel-category/);
  assert.match(styles, /\.channel-scroll>\.category\{display:none!important\}/);
  assert.match(styles, /\.channel\.active,.channel\.selected\{border-color:var\(--vix-border\)/);
  assert.doesNotMatch(styles, /\.channel\.active,.channel\.selected\{[^}]*theme-accent/);
  assert.match(styles, /#text-channels\{margin-bottom:0;padding:0;border:0;border-radius:0;background:transparent\}/);
  assert.match(management, /vix-collapsed-categories-/);
  assert.match(management, /category-channel-group/);
  assert.match(management, /category-room-count/);
  assert.match(management, /aria-expanded/);
  assert.match(styles, /category-channel-group\.is-collapsed \.category-channel-rooms\{display:none\}/);
  assert.match(styles, /Navegação compacta de categorias/);
  assert.match(styles, /Categorias com leitura e toque confortáveis/);
  assert.match(styles, /Lista de membros com cartões amplos/);
  assert.match(styles, /\.community-card \.community-list-button\{display:block;width:100%;min-height:0;height:auto/);
});

test('salas de texto com o mesmo nome permanecem separadas por categoria', () => {
  assert.match(worker, /display_name TEXT DEFAULT/);
  assert.match(worker, /COALESCE\(category_id,""\)=\? AND lower\(COALESCE\(NULLIF\(display_name,""\),name\)\)=lower\(\?\)/);
  assert.match(worker, /while\(one\(this\.c\.storage\.sql\.exec\('SELECT name FROM channels WHERE server_id=\? AND name=\?'/);
  assert.match(worker, /INSERT INTO channels\(server_id,name,category_id,position,topic,display_name\)/);
  assert.match(app, /channel\.display_name\|\|channel\.name/);
});

test('criação de cargos e controles ligados usam a interface moderna', () => {
  const management = fs.readFileSync('public/server-management.js', 'utf8');
  const managementCss = fs.readFileSync('public/server-management.css', 'utf8');
  const shellCss = fs.readFileSync('public/modern-shell.css', 'utf8');
  assert.match(management, /permissionDetails/);
  assert.match(management, /rolePresets/);
  assert.match(management, /MODELO DE PERMISSÕES/);
  assert.match(management, /permission-groups/);
  assert.match(managementCss, /create-role-card/);
  assert.match(managementCss, /permission-item:has\(input:checked\)/);
  assert.match(shellCss, /Um único padrão de interruptor/);
  assert.match(shellCss, /input\[type=checkbox\]:checked/);
});
