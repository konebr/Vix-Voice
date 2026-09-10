(() => {
  const settings = userSettings;
  settings.removeAttribute('style');
  const viewNames = { account: 'Minha conta', profile: 'Perfil', privacy: 'Dados e privacidade', notifications: 'Notificações', voice: 'Voz e vídeo', appearance: 'Aparência' };
  let currentView = 'account', profileDraft = { avatar: '', banner: '' };

  settings.className = 'user-settings-modern';
  settings.innerHTML = `<aside class="settings-sidebar">
    <div class="settings-user"><div id="settings-avatar" class="avatar"></div><div><strong id="settings-name"></strong><small>Configurações pessoais</small></div></div>
    <div class="settings-search-wrap"><span>⌕</span><input id="settings-search" placeholder="Buscar configurações" aria-label="Buscar configurações"></div>
    <nav id="settings-nav">
      <button data-view="account"><span>◉</span><div>Minha conta<small>Login e segurança</small></div></button>
      <button data-view="profile"><span>✦</span><div>Perfil<small>Identidade e cartão</small></div></button>
      <button data-view="privacy" disabled><span>◇</span><div>Dados e privacidade<small>Disponível em breve</small></div><b>EM BREVE</b></button>
      <button data-view="notifications"><span>♢</span><div>Notificações<small>Alertas e sons</small></div></button>
      <div class="settings-nav-label">CONFIGURAÇÕES DO APLICATIVO</div>
      <button data-view="voice"><span>◖</span><div>Voz e vídeo<small>Dispositivos e áudio</small></div></button>
      <button data-view="appearance"><span>◐</span><div>Aparência<small>Interface do aplicativo</small></div></button>
    </nav>
    <button id="settings-logout" type="button"><span>↪</span>Sair da conta</button>
  </aside><main class="settings-main"><header class="settings-header"><div><small>CONFIGURAÇÕES</small><strong id="settings-title">Minha conta</strong></div><button id="settings-close" aria-label="Fechar configurações">×</button></header><div id="settings-content"></div></main>`;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const notificationDefaults = { desktopNotifications: false, messageNotifications: true, mentionNotifications: true, callNotifications: true, notificationSound: true };
  const notificationPrefs = () => ({ ...notificationDefaults, ...readSettings() });

  window.vixNotify = (title, options = {}, kind = 'message') => {
    const prefs = notificationPrefs(), allowed = kind === 'call' ? prefs.callNotifications : kind === 'mention' ? prefs.mentionNotifications : prefs.messageNotifications;
    if (window.vixPresence?.effective?.() === 'dnd') return;
    if (!allowed || !prefs.desktopNotifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!document.hidden && kind !== 'call') return;
    const notice = new Notification(title, { icon: state.identity?.avatar || '/favicon.ico', silent: !prefs.notificationSound, ...options });
    notice.onclick = () => { window.focus(); notice.close(); };
  };

  function feedback(message = '', ok = false) {
    const node = document.getElementById('settings-feedback');
    if (!node) return;
    node.textContent = message;
    node.className = `settings-feedback ${ok ? 'success' : ''}`;
  }

  const sessionTime = value => { const elapsed = Date.now() - Number(value || 0); if (elapsed < 60000) return 'Ativo agora'; if (elapsed < 3600000) return `Ativo há ${Math.floor(elapsed / 60000)} min`; if (elapsed < 86400000) return `Ativo há ${Math.floor(elapsed / 3600000)} h`; return `Ativo há ${Math.floor(elapsed / 86400000)} d`; };
  async function loadAccountSessions() {
    const list = $('account-sessions-list'); if (!list) return;
    try { const { sessions = [] } = await api('/api/account/sessions'); list.replaceChildren();
      for (const session of sessions) { const row = document.createElement('div'); row.className = 'account-session'; const icon = document.createElement('span'); icon.className = 'account-session-icon'; icon.textContent = /Windows|Vix Voice/i.test(session.device) ? '▣' : /Android|iPhone|iPad/i.test(session.device) ? '▯' : '◎'; const copy = document.createElement('div'); const name = document.createElement('strong'); name.textContent = session.device; const detail = document.createElement('small'); detail.textContent = `${sessionTime(session.last_seen)} · expira em ${new Date(session.expires_at).toLocaleDateString('pt-BR')}`; copy.append(name, detail); const action = document.createElement('button'); action.type = 'button'; action.dataset.sessionId = session.session_id; action.textContent = session.current ? 'Este dispositivo' : 'Encerrar'; action.disabled = Boolean(Number(session.current)); action.onclick = async () => { action.disabled = true; action.textContent = 'Encerrando…'; try { await api(`/api/account/sessions/${encodeURIComponent(session.session_id)}`, { method: 'DELETE' }); await loadAccountSessions(); feedback('Sessão encerrada com segurança.', true); } catch (error) { action.disabled = false; action.textContent = 'Encerrar'; feedback(error.message); } }; row.append(icon, copy, action); list.append(row); }
      if (!sessions.length) list.textContent = 'Nenhuma sessão ativa foi encontrada.';
    } catch (error) { list.textContent = error.message; }
  }

  async function renderAccount() {
    const email = escapeHtml(state.identity?.email || 'E-mail indisponível');
    $('settings-content').innerHTML = `<section class="settings-page settings-account-page"><div class="settings-page-intro"><span>CONTA VIX</span><h1>Minha conta</h1><p>Consulte seus dados de acesso e mantenha sua conta protegida.</p></div>
      <article class="account-hero"><div id="account-avatar" class="avatar"></div><div><small>PERFIL ATIVO</small><h2>${escapeHtml(state.identity.name)}</h2><p>${email}</p></div><span class="account-online">● Online</span></article>
      <div class="settings-section"><div class="settings-section-title"><div><h2>Informações da conta</h2><p>Dados usados para entrar no Vix Voice.</p></div></div><div class="account-details"><label>Nome de exibição<strong>${escapeHtml(state.identity.name)}</strong></label><label>Endereço de e-mail<strong>${email}</strong></label></div></div>
      <div class="settings-section account-sessions-section"><div class="settings-section-title"><div><h2>Dispositivos conectados</h2><p>Revise e encerre acessos que você não reconhece.</p></div><button id="end-other-sessions" class="settings-secondary">Encerrar outras sessões</button></div><div id="account-sessions-list" class="account-sessions-list"><span class="settings-loading">Carregando sessões…</span></div></div>
      <form id="password-form" class="settings-section password-form"><div class="settings-section-title"><div><h2>Alterar senha</h2><p>Confirme sua senha atual para definir uma nova.</p></div><span class="security-badge">SEGURO</span></div><div class="settings-form-grid"><label>Senha atual<input id="current-password" type="password" autocomplete="current-password" required></label><label>Nova senha<input id="new-password" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirmar nova senha<input id="confirm-password" type="password" autocomplete="new-password" minlength="8" required></label></div><div class="settings-form-actions"><p id="settings-feedback" class="settings-feedback" role="status"></p><button class="settings-primary">Atualizar senha</button></div></form></section>`;
    paintAvatar($('account-avatar'), state.identity.avatar, state.identity.name, state.identity.color);
    $('password-form').onsubmit = async event => {
      event.preventDefault(); const button = event.submitter, next = $('new-password').value;
      if (next !== $('confirm-password').value) return feedback('As novas senhas não coincidem.');
      button.disabled = true; button.textContent = 'Atualizando…'; feedback('');
      try { await api('/api/account/password', { method: 'PATCH', body: JSON.stringify({ current_password: $('current-password').value, new_password: next }) }); event.currentTarget.reset(); feedback('Senha atualizada. As outras sessões foram encerradas.', true); }
      catch (error) { feedback(error.message); }
      finally { button.disabled = false; button.textContent = 'Atualizar senha'; }
    };
    $('end-other-sessions').onclick = async event => { const button = event.currentTarget; button.disabled = true; button.textContent = 'Encerrando…'; try { await api('/api/account/sessions', { method: 'DELETE' }); await loadAccountSessions(); feedback('Todas as outras sessões foram encerradas.', true); } catch (error) { feedback(error.message); } finally { button.disabled = false; button.textContent = 'Encerrar outras sessões'; } };
    await loadAccountSessions();
  }

  function updateInlinePreview() {
    const preview = $('inline-profile-preview'); if (!preview) return;
    const color = $('inline-profile-color').value || '#5865f2', name = $('inline-profile-name').value || state.identity.name;
    preview.className = `inline-profile-preview card-theme-${$('inline-card-theme').value} card-effect-${$('inline-card-effect').value}`;
    preview.style.setProperty('--profile-accent', color);
    $('inline-banner-preview').style.backgroundColor = color;
    $('inline-banner-preview').style.backgroundImage = profileDraft.banner ? `url("${profileDraft.banner}")` : '';
    paintAvatar($('inline-avatar-preview'), profileDraft.avatar, name, color);
    $('inline-name-preview').textContent = name;
    $('inline-badge-preview').textContent = $('inline-profile-badge').value;
    $('inline-badge-preview').hidden = !$('inline-profile-badge').value;
    $('inline-pronouns-preview').textContent = $('inline-profile-pronouns').value;
    $('inline-status-preview').textContent = $('inline-profile-status').value || 'Online';
    $('inline-bio-preview').textContent = $('inline-profile-bio').value || 'Conte um pouco sobre você.';
  }

  function readInlineImage(file, width, height, quality, limit, done) {
    if (!file) return; const allowed = ['image/gif', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > (file.type === 'image/gif' ? limit : 4 * 1024 * 1024)) return feedback('Use PNG, JPG, WebP ou GIF dentro do limite informado.');
    const reader = new FileReader(); reader.onload = () => {
      if (file.type === 'image/gif') { done(reader.result); updateInlinePreview(); return feedback('GIF carregado. Salve para aplicar.', true); }
      const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'), scale = Math.max(width / image.width, height / image.height); canvas.width = width; canvas.height = height; canvas.getContext('2d').drawImage(image, (width - image.width * scale) / 2, (height - image.height * scale) / 2, image.width * scale, image.height * scale); done(canvas.toDataURL('image/jpeg', quality)); updateInlinePreview(); feedback('Imagem pronta para salvar.', true); }; image.src = reader.result;
    }; reader.readAsDataURL(file);
  }

  async function renderProfile() {
    $('settings-content').innerHTML = '<div class="settings-loading">Carregando seu perfil…</div>';
    try { const [{ profile }, { card }] = await Promise.all([api('/api/profile'), api('/api/profile/card')]); state.identity = { ...state.identity, ...profile, card_theme: card.theme, card_effect: card.effect, profile_badge: card.badge }; } catch (error) { console.warn(error); }
    profileDraft = { avatar: state.identity.avatar || '', banner: state.identity.banner || '' };
    $('settings-content').innerHTML = `<section class="settings-page"><div class="settings-page-intro"><span>IDENTIDADE VIX</span><h1>Personalize seu perfil</h1><p>As alterações aparecem no seu cartão, nas conversas e na lista de membros.</p></div><div class="inline-profile-layout"><form id="inline-profile-form" class="settings-section inline-profile-form">
      <div class="profile-upload-grid"><label class="profile-upload">◉ <span><strong>Foto do perfil</strong><small>PNG, JPG, WebP ou GIF · até 650 KB para GIF</small></span><b>Alterar</b><input id="inline-avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label class="profile-upload">▣ <span><strong>Capa do perfil</strong><small>Imagens e GIF animado · até 1,5 MB</small></span><b>Alterar</b><input id="inline-banner-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label></div>
      <label>Nome de exibição<input id="inline-profile-name" maxlength="24" value="${escapeHtml(state.identity.name)}" required></label><label>Status personalizado<input id="inline-profile-status" maxlength="60" value="${escapeHtml(state.identity.custom_status || '')}" placeholder="Ex.: Jogando com os amigos"></label><div class="settings-form-grid"><label>Pronomes<input id="inline-profile-pronouns" maxlength="40" value="${escapeHtml(state.identity.pronouns || '')}" placeholder="Opcional"></label><label>Cor de destaque<input id="inline-profile-color" type="color" value="${escapeHtml(state.identity.color || '#5865f2')}"></label></div><label>Sobre mim<textarea id="inline-profile-bio" maxlength="190" placeholder="Conte um pouco sobre você">${escapeHtml(state.identity.bio || '')}</textarea></label>
      <div class="inline-card-style"><h3>Estilo do cartão</h3><div class="settings-form-grid"><label>Tema<select id="inline-card-theme"><option value="midnight">Meia-noite</option><option value="aurora">Aurora</option><option value="neon">Neon</option><option value="sunset">Pôr do sol</option><option value="ocean">Oceano</option></select></label><label>Efeito<select id="inline-card-effect"><option value="none">Sem efeito</option><option value="glow">Brilho</option><option value="crystal">Cristais</option><option value="stars">Estrelas</option></select></label></div><label>Etiqueta do perfil<input id="inline-profile-badge" maxlength="24" value="${escapeHtml(state.identity.profile_badge || '')}" placeholder="Ex.: Fundador, Gamer, Artista"></label></div>
      <div class="settings-form-actions"><div><button id="inline-remove-avatar" type="button" class="settings-secondary">Remover foto</button><button id="inline-remove-banner" type="button" class="settings-secondary">Remover capa</button></div><button class="settings-primary">Salvar perfil</button></div><p id="settings-feedback" class="settings-feedback" role="status"></p></form>
      <aside class="inline-preview-column"><span>PRÉVIA EM TEMPO REAL</span><div id="inline-profile-preview" class="inline-profile-preview"><div id="inline-banner-preview" class="inline-banner-preview"></div><div id="inline-avatar-preview" class="avatar inline-avatar-preview"></div><div class="inline-preview-copy"><div><strong id="inline-name-preview"></strong><b id="inline-badge-preview" hidden></b></div><small id="inline-pronouns-preview"></small><em id="inline-status-preview"></em><p id="inline-bio-preview"></p></div></div></aside></div></section>`;
    $('inline-card-theme').value = state.identity.card_theme || 'midnight'; $('inline-card-effect').value = state.identity.card_effect || 'none';
    for (const id of ['inline-profile-name','inline-profile-status','inline-profile-pronouns','inline-profile-color','inline-profile-bio','inline-profile-badge']) $(id).oninput = updateInlinePreview;
    for (const id of ['inline-card-theme','inline-card-effect']) $(id).onchange = updateInlinePreview;
    $('inline-avatar-file').onchange = event => readInlineImage(event.target.files?.[0], 256, 256, .82, 650000, value => profileDraft.avatar = value);
    $('inline-banner-file').onchange = event => readInlineImage(event.target.files?.[0], 960, 320, .72, 1500000, value => profileDraft.banner = value);
    $('inline-remove-avatar').onclick = () => { profileDraft.avatar = ''; updateInlinePreview(); };
    $('inline-remove-banner').onclick = () => { profileDraft.banner = ''; updateInlinePreview(); };
    $('inline-profile-form').onsubmit = async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; button.textContent = 'Salvando…'; feedback(''); try { const [{ profile }, { card }] = await Promise.all([api('/api/profile', { method: 'PATCH', body: JSON.stringify({ name: $('inline-profile-name').value, color: $('inline-profile-color').value, custom_status: $('inline-profile-status').value, pronouns: $('inline-profile-pronouns').value, bio: $('inline-profile-bio').value, avatar: profileDraft.avatar, banner: profileDraft.banner }) }), api('/api/profile/card', { method: 'PATCH', body: JSON.stringify({ theme: $('inline-card-theme').value, effect: $('inline-card-effect').value, badge: $('inline-profile-badge').value }) })]); state.identity = { ...state.identity, ...profile, card_theme: card.theme, card_effect: card.effect, profile_badge: card.badge }; localStorage.setItem(SESSION, JSON.stringify(state.identity)); if (profile.avatar) localStorage.setItem(avatarKey(), profile.avatar); else localStorage.removeItem(avatarKey()); syncedProfiles.clear(); setIdentity(state.identity); applyProfilePhoto(); paintAvatar($('settings-avatar'), state.identity.avatar, state.identity.name, state.identity.color); $('settings-name').textContent = state.identity.name; await renderServerMembers(); feedback('Perfil atualizado com sucesso.', true); } catch (error) { feedback(error.message); } finally { button.disabled = false; button.textContent = 'Salvar perfil'; } };
    updateInlinePreview();
  }

  function renderPrivacy() { $('settings-content').innerHTML = `<section class="settings-page settings-disabled-page"><div class="settings-page-intro"><span>EM DESENVOLVIMENTO</span><h1>Dados e privacidade</h1><p>Esta área está sendo preparada e permanecerá desativada por enquanto.</p></div><div class="privacy-lock"><div>◇</div><h2>Controles de privacidade em breve</h2><p>Aqui você poderá controlar dados, bloqueios e visibilidade do perfil.</p><span>INDISPONÍVEL NESTA VERSÃO</span></div></section>`; }

  function notificationRow(id, title, copy, checked) { return `<label class="notification-row"><span><strong>${title}</strong><small>${copy}</small></span><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}><i></i></label>`; }
  function renderNotifications() {
    const prefs = notificationPrefs(), permission = typeof Notification === 'undefined' ? 'indisponível' : Notification.permission;
    $('settings-content').innerHTML = `<section class="settings-page"><div class="settings-page-intro"><span>ALERTAS</span><h1>Notificações</h1><p>Escolha quais atividades podem chamar sua atenção.</p></div><div class="settings-section notification-list">${notificationRow('notify-desktop','Notificações no computador','Mostra alertas do Vix Voice fora da janela.',prefs.desktopNotifications)}${notificationRow('notify-messages','Mensagens diretas','Avisa quando um amigo enviar uma mensagem.',prefs.messageNotifications)}${notificationRow('notify-mentions','Menções','Avisa quando alguém mencionar seu nome.',prefs.mentionNotifications)}${notificationRow('notify-calls','Chamadas privadas','Avisa quando um amigo estiver chamando.',prefs.callNotifications)}${notificationRow('notify-sound','Som das notificações','Reproduz o som padrão do sistema.',prefs.notificationSound)}</div><div class="notification-permission"><span>Permissão do sistema</span><strong id="notification-permission-state">${permission}</strong><button id="notification-test" class="settings-secondary">Enviar notificação de teste</button></div><p id="settings-feedback" class="settings-feedback"></p></section>`;
    const map = { 'notify-messages':'messageNotifications', 'notify-mentions':'mentionNotifications', 'notify-calls':'callNotifications', 'notify-sound':'notificationSound' };
    for (const [id,key] of Object.entries(map)) $(id).onchange = event => saveSettings({ [key]: event.target.checked });
    $('notify-desktop').onchange = async event => { if (event.target.checked && typeof Notification !== 'undefined' && Notification.permission !== 'granted') { const result = await Notification.requestPermission(); $('notification-permission-state').textContent = result; event.target.checked = result === 'granted'; } saveSettings({ desktopNotifications: event.target.checked }); };
    $('notification-test').onclick = async () => { if (typeof Notification === 'undefined') return feedback('Notificações não estão disponíveis neste dispositivo.'); if (Notification.permission !== 'granted') { const result = await Notification.requestPermission(); $('notification-permission-state').textContent = result; if (result !== 'granted') return feedback('Permita notificações nas configurações do sistema.'); $('notify-desktop').checked = true; saveSettings({ desktopNotifications: true }); } new Notification('Vix Voice', { body: 'As notificações estão funcionando.', icon: state.identity?.avatar || '/favicon.ico', silent: !$('notify-sound').checked }); feedback('Notificação de teste enviada.', true); };
  }

  function renderAppearance() { const contrast = document.body.classList.contains('vix-contrast'); $('settings-content').innerHTML = `<section class="settings-page"><div class="settings-page-intro"><span>INTERFACE</span><h1>Aparência</h1><p>Ajuste a leitura da interface neste dispositivo.</p></div><div class="settings-section">${notificationRow('appearance-contrast','Contraste reforçado','Realça divisórias, textos e controles.',contrast)}</div></section>`; $('appearance-contrast').onchange = event => document.body.classList.toggle('vix-contrast', event.target.checked); }

  async function selectView(view) {
    if (view === 'privacy') return renderPrivacy(); currentView = view;
    for (const button of settings.querySelectorAll('#settings-nav button')) button.classList.toggle('selected', button.dataset.view === view);
    $('settings-title').textContent = viewNames[view];
    if (view === 'account') await renderAccount(); else if (view === 'profile') await renderProfile(); else if (view === 'notifications') renderNotifications(); else if (view === 'voice') await renderSettingsVoice(); else renderAppearance();
  }

  openUserSettings = async () => {
    if (!state.identity) return; settings.hidden = false; settings.style.display = 'grid'; settings.classList.remove('is-opening'); requestAnimationFrame(() => settings.classList.add('is-opening'));
    $('settings-name').textContent = state.identity.name; paintAvatar($('settings-avatar'), state.identity.avatar || localStorage.getItem(avatarKey()), state.identity.name, state.identity.color);
    await selectView(currentView || 'account');
  };
  $('leave').onclick = openUserSettings;
  $('settings-close').onclick = () => { settings.hidden = true; settings.style.display = 'none'; };
  $('settings-logout').onclick = async () => { const button = $('settings-logout'); button.disabled = true; try { stopVoice(); await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (error) { console.warn(error); } finally { localStorage.removeItem(SESSION); state.identity = null; state.server = null; location.assign(location.pathname); } };
  for (const button of settings.querySelectorAll('#settings-nav button')) button.onclick = () => selectView(button.dataset.view);
  $('settings-search').oninput = event => { const term = event.target.value.toLowerCase(); for (const button of settings.querySelectorAll('#settings-nav button')) button.hidden = !button.textContent.toLowerCase().includes(term); };
})();
