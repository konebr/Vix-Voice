(() => {
  let management = null, voiceChannels = [], voiceUsers = [];
  const modal = document.createElement('section');
  modal.id = 'server-management'; modal.className = 'management-modal'; modal.hidden = true;
  modal.innerHTML = '<div class="management-shell"><aside><div class="management-server"><span id="management-icon"></span><div><strong id="management-name"></strong><small id="management-role"></small></div></div><nav><button data-tab="overview" class="selected">Visão geral</button><button data-tab="voice">Canais de voz</button><button data-tab="members">Membros</button></nav></aside><main><header><div><small>CONFIGURAÇÕES DO SERVIDOR</small><h1 id="management-title">Visão geral</h1></div><button id="management-close" aria-label="Fechar">×</button></header><div id="management-content"></div></main></div>';
  document.body.append(modal);
  const content = () => $('management-content');
  const showError = (node, error) => { node.textContent = error.message; node.hidden = false; };
  const button = (text, className = '') => { const item = document.createElement('button'); item.type = 'button'; item.textContent = text; item.className = className; return item; };

  function memberRow(member) {
    const row = document.createElement('div'); row.className = 'management-row member-management-row';
    const avatar = document.createElement('span'); avatar.className = 'management-avatar'; avatar.textContent = initials(member.name); avatar.style.background = member.color;
    const identity = document.createElement('div'); identity.className = 'management-row-copy';
    const name = document.createElement('strong'); name.textContent = member.user_id === state.identity.id ? `${member.name} (você)` : member.name;
    const role = document.createElement('small'); role.textContent = member.role === 'Admin' ? 'Administrador' : member.role; identity.append(name, role); row.append(avatar, identity);
    if (management.isOwner && member.role !== 'Dono') {
      const select = document.createElement('select');
      for (const value of ['Membro', 'Admin']) { const option = document.createElement('option'); option.value = value; option.textContent = value === 'Admin' ? 'Administrador' : value; option.selected = member.role === value; select.append(option); }
      select.onchange = async () => { try { await api(`/api/servers/${state.server.id}/members/${member.user_id}`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) }); await reloadManagement('members'); await renderServerMembers(); } catch (error) { select.value = member.role; alert(error.message); } };
      row.append(select);
    }
    const canRemove = member.role !== 'Dono' && member.user_id !== state.identity.id && management.canManage && (management.isOwner || member.role !== 'Admin');
    if (canRemove) {
      const remove = button('Remover', 'danger-button');
      remove.onclick = async () => { if (!confirm(`Remover ${member.name} do servidor?`)) return; try { await api(`/api/servers/${state.server.id}/members/${member.user_id}`, { method: 'DELETE' }); await reloadManagement('members'); await renderServerMembers(); } catch (error) { alert(error.message); } };
      row.append(remove);
    }
    return row;
  }

  function renderOverview() {
    $('management-title').textContent = 'Visão geral'; const box = content(); box.replaceChildren();
    const card = document.createElement('form'); card.className = 'management-card';
    const title = document.createElement('h2'); title.textContent = 'Identidade do servidor';
    const fields = document.createElement('div'); fields.className = 'identity-fields';
    const iconLabel = document.createElement('label'); iconLabel.textContent = 'ÍCONE'; const icon = document.createElement('input'); icon.value = management.server.icon || initials(management.server.name); icon.maxLength = 4; icon.disabled = !management.canManage; iconLabel.append(icon);
    const nameLabel = document.createElement('label'); nameLabel.textContent = 'NOME DO SERVIDOR'; const name = document.createElement('input'); name.value = management.server.name; name.maxLength = 32; name.disabled = !management.canManage; nameLabel.append(name); fields.append(iconLabel, nameLabel);
    const note = document.createElement('p'); note.textContent = management.canManage ? 'O novo nome e ícone aparecem para todos os membros.' : 'Somente o dono e administradores podem editar estas informações.';
    const error = document.createElement('p'); error.className = 'management-error'; error.hidden = true;
    card.append(title, fields, note, error);
    if (management.canManage) { const save = button('Salvar alterações', 'primary-button'); save.type = 'submit'; card.append(save); }
    card.onsubmit = async event => { event.preventDefault(); error.hidden = true; try { const result = await api(`/api/servers/${state.server.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.value, icon: icon.value }) }); state.server = { ...state.server, ...result.server }; $('server-name').textContent = state.server.name; await refreshPrivateRail(); await reloadManagement('overview'); } catch (caught) { showError(error, caught); } };
    box.append(card);
  }

  function channelRow(channel) {
    const row = document.createElement('div'); row.className = 'management-row';
    const icon = document.createElement('span'); icon.className = 'management-channel-icon'; icon.textContent = '◖';
    const copy = document.createElement('div'); copy.className = 'management-row-copy'; const name = document.createElement('strong'); name.textContent = channel.name; const detail = document.createElement('small'); detail.textContent = 'Canal de voz'; copy.append(name, detail); row.append(icon, copy);
    if (management.canManage) {
      const edit = button('Renomear'); edit.onclick = async () => { const next = prompt('Novo nome do canal:', channel.name); if (!next || next === channel.name) return; try { await api(`/api/servers/${state.server.id}/voice-channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) }); if (selectedVoiceChannel.id === channel.id) selectedVoiceChannel = { ...selectedVoiceChannel, name: next.trim() }; await reloadManagement('voice'); await loadVoiceChannels(); } catch (error) { alert(error.message); } };
      const remove = button('Excluir', 'danger-button'); remove.onclick = async () => { if (!confirm(`Excluir o canal ${channel.name}?`)) return; try { await api(`/api/servers/${state.server.id}/voice-channels/${channel.id}`, { method: 'DELETE' }); if (selectedVoiceChannel.id === channel.id && microphoneStream) stopVoice(); await reloadManagement('voice'); await loadVoiceChannels(true); } catch (error) { alert(error.message); } };
      row.append(edit, remove);
    }
    return row;
  }

  function renderVoiceManagement() {
    $('management-title').textContent = 'Canais de voz'; const box = content(); box.replaceChildren();
    const card = document.createElement('section'); card.className = 'management-card'; const title = document.createElement('h2'); title.textContent = 'Salas de conversa'; card.append(title);
    for (const channel of management.voiceChannels) card.append(channelRow(channel));
    if (management.canManage) {
      const form = document.createElement('form'); form.className = 'new-channel-form'; const input = document.createElement('input'); input.placeholder = 'Nome do novo canal'; input.maxLength = 32; input.required = true; const create = button('Criar canal', 'primary-button'); create.type = 'submit'; const error = document.createElement('p'); error.className = 'management-error'; error.hidden = true; form.append(input, create, error);
      form.onsubmit = async event => { event.preventDefault(); try { await api(`/api/servers/${state.server.id}/voice-channels`, { method: 'POST', body: JSON.stringify({ name: input.value }) }); await reloadManagement('voice'); await loadVoiceChannels(); } catch (caught) { showError(error, caught); } }; card.append(form);
    }
    box.append(card);
  }

  function renderMembers() {
    $('management-title').textContent = 'Membros'; const box = content(); box.replaceChildren();
    const card = document.createElement('section'); card.className = 'management-card'; const title = document.createElement('h2'); title.textContent = `${management.members.length} membros`; card.append(title);
    for (const member of management.members) card.append(memberRow(member)); box.append(card);
  }
  const tabs = { overview: renderOverview, voice: renderVoiceManagement, members: renderMembers };
  function selectTab(tab) { for (const item of modal.querySelectorAll('nav button')) item.classList.toggle('selected', item.dataset.tab === tab); tabs[tab](); }
  async function reloadManagement(tab = 'overview') { management = await api(`/api/servers/${state.server.id}/manage`); voiceChannels = management.voiceChannels; $('management-icon').textContent = management.server.icon; $('management-name').textContent = management.server.name; $('management-role').textContent = management.role; selectTab(tab); }
  async function openManagement() { if (!state.server) return; modal.hidden = false; content().innerHTML = '<div class="management-loading">Carregando configurações…</div>'; try { await reloadManagement('overview'); } catch (error) { content().textContent = error.message; } }
  $('management-close').onclick = () => { modal.hidden = true; }; modal.onclick = event => { if (event.target === modal) modal.hidden = true; };
  for (const item of modal.querySelectorAll('nav button')) item.onclick = () => selectTab(item.dataset.tab);
  document.querySelector('.server-title button').onclick = openManagement;

  function simpleVoiceUser(user) {
    const row = document.createElement('div'); row.className = 'voice-user'; row.dataset.voiceUserId = user.user_id;
    const avatar = document.createElement('span'); avatar.textContent = initials(user.name); avatar.style.background = user.color || '#5865f2';
    const name = document.createElement('span'); name.textContent = user.user_id === state.identity?.id ? 'Você' : user.name; row.append(avatar, name); return row;
  }
  function renderVoiceChannels() {
    let list = $('voice-channel-list');
    if (!list) { list = document.createElement('div'); list.id = 'voice-channel-list'; $('voice-channel').before(list); $('voice-channel').hidden = true; }
    // Preserve the shared roster before clearing the channel list. Once it is
    // detached, getElementById cannot find it until it is appended again.
    let activeUsers = $('voice-users');
    if (!activeUsers) { activeUsers = document.createElement('div'); activeUsers.id = 'voice-users'; activeUsers.className = 'voice-users'; }
    list.replaceChildren();
    for (const channel of voiceChannels) {
      const block = document.createElement('div'); block.className = 'voice-channel-block';
      const users = voiceUsers.filter(user => user.channel === channel.id);
      const channelButton = button('', `channel room-channel voice-channel-button${selectedVoiceChannel.id === channel.id ? ' selected' : ''}`); channelButton.dataset.roomType = 'voice';
      const icon = document.createElement('span'); icon.className = 'room-kind-icon'; icon.textContent = '◖';
      const name = document.createElement('span'); name.className = 'room-channel-name'; name.textContent = channel.name;
      const occupancy = document.createElement('span'); occupancy.className = 'room-occupancy'; occupancy.textContent = users.length ? String(users.length) : '';
      channelButton.append(icon, name, occupancy);
      channelButton.onclick = async () => { if (selectedVoiceChannel.id === channel.id && microphoneStream && voiceRoomConnected) return; if (microphoneStream) stopVoice(); selectedVoiceChannel = channel; voiceUsers = voiceUsers.filter(user => user.user_id !== state.identity.id); voiceUsers.push({ user_id: state.identity.id, name: state.identity.name, color: state.identity.color, channel: channel.id }); renderVoiceChannels(); await startVoice(); if (!microphoneStream) { voiceUsers = voiceUsers.filter(user => user.user_id !== state.identity.id); renderVoiceChannels(); } closeMobileChannels?.(); };
      block.append(channelButton);
      if (selectedVoiceChannel.id === channel.id) { activeUsers.replaceChildren(...users.map(simpleVoiceUser)); block.append(activeUsers); }
      else { const target = document.createElement('div'); target.className = 'voice-users passive'; target.append(...users.map(simpleVoiceUser)); block.append(target); }
      list.append(block);
    }
  }
  window.renderVoiceChannelUsers = users => { voiceUsers = users; renderVoiceChannels(); };
  async function loadVoiceChannels(forceFirst = false) {
    if (!state.server) return; const result = await api(`/api/servers/${state.server.id}/voice-channels`); voiceChannels = result.channels;
    const selected = !forceFirst && voiceChannels.find(channel => channel.id === selectedVoiceChannel.id); selectedVoiceChannel = selected || voiceChannels[0] || { id: 'Geral', name: 'Geral' }; renderVoiceChannels(); await refreshVoiceUsers();
  }
  window.reloadVoiceChannels = () => loadVoiceChannels(true);
  const baseStopVoice = stopVoice;
  stopVoice = () => { voiceUsers = voiceUsers.filter(user => user.user_id !== state.identity?.id); baseStopVoice(); renderVoiceChannels(); };
  const baseLoadServer = loadServer;
  loadServer = async server => { if (state.server?.id !== server.id && microphoneStream) stopVoice(); await baseLoadServer(server); await loadVoiceChannels(true); };
})();
