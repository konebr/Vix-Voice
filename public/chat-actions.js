(() => {
  let replyingTo = null;
  let pendingAttachment = null;
  const commonEmoji = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
  const attachmentUrls = new Map();

  const currentMessages = () => state.messages.filter(message => message.channel === state.channel);
  const replaceMessage = message => {
    const index = state.messages.findIndex(item => item.id === message.id);
    if (index >= 0) state.messages[index] = message;
    else state.messages.push(message);
  };

  const replyBar = document.createElement('div');
  replyBar.id = 'message-reply-bar';
  replyBar.hidden = true;
  const replyCopy = document.createElement('span');
  const cancelReply = document.createElement('button');
  cancelReply.type = 'button';
  cancelReply.textContent = '×';
  cancelReply.title = 'Cancelar resposta';
  cancelReply.onclick = () => setReply(null);
  replyBar.append(replyCopy, cancelReply);
  document.getElementById('compose')?.prepend(replyBar);

  const attachmentDraft = document.createElement('div');
  attachmentDraft.id = 'attachment-draft';
  attachmentDraft.hidden = true;
  const attachmentDraftCopy = document.createElement('span'), cancelAttachment = document.createElement('button');
  cancelAttachment.type = 'button'; cancelAttachment.textContent = '×'; cancelAttachment.title = 'Remover arquivo';
  cancelAttachment.onclick = () => setAttachment(null);
  attachmentDraft.append(attachmentDraftCopy, cancelAttachment);
  document.getElementById('compose')?.prepend(attachmentDraft);
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.hidden = true; fileInput.accept = '.png,.jpg,.jpeg,.gif,.webp,.mp3,.ogg,.wav,.mp4,.webm,.pdf,.zip,.txt';
  document.getElementById('compose')?.append(fileInput);
  const attachTrigger = document.querySelector('#compose .compose-inner > span');
  if (attachTrigger) { attachTrigger.className = 'attachment-trigger'; attachTrigger.tabIndex = 0; attachTrigger.setAttribute('role', 'button'); attachTrigger.title = 'Enviar arquivo'; attachTrigger.onclick = () => fileInput.click(); attachTrigger.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') fileInput.click(); }; }

  function setAttachment(file) {
    pendingAttachment = file;
    attachmentDraft.hidden = !file;
    attachmentDraftCopy.textContent = file ? `📎 ${file.name} · ${(file.size / 1048576).toFixed(file.size >= 1048576 ? 1 : 2)} MB` : '';
    if (!file) fileInput.value = '';
  }
  function attachmentType(file) {
    const extension = file.name.split('.').pop()?.toLowerCase(), known = { png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',mp4:'video/mp4',webm:'video/webm',pdf:'application/pdf',zip:'application/zip',txt:'text/plain' };
    return known[extension] || file.type || 'application/octet-stream';
  }
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return setAttachment(null);
    if (file.size > 4194304) { fileInput.value = ''; return alert('O arquivo deve ter no máximo 4 MB.'); }
    const reader = new FileReader();
    reader.onload = () => { const type = attachmentType(file), data = String(reader.result).replace(/^data:[^;,]+/, `data:${type}`); setAttachment({ name: file.name, type, size: file.size, data }); };
    reader.onerror = () => alert('Não foi possível ler o arquivo.');
    reader.readAsDataURL(file);
  };

  function setReply(message) {
    replyingTo = message;
    replyBar.hidden = !message;
    replyCopy.textContent = message ? `Respondendo a ${message.author}: ${message.text.slice(0, 90)}` : '';
    if (message) document.getElementById('message')?.focus();
  }

  function addReplyPreview(body, message) {
    if (!message.reply_to) return;
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'message-reply-preview';
    if (message.reply?.deleted) preview.textContent = '↪ Mensagem original excluída';
    else preview.textContent = `↪ ${message.reply?.author || 'Mensagem'}: ${message.reply?.text || ''}`;
    preview.onclick = () => {
      const target = document.querySelector(`[data-message-id="${CSS.escape(message.reply_to)}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.classList.add('message-focus');
      setTimeout(() => target?.classList.remove('message-focus'), 1400);
    };
    body.prepend(preview);
  }

  async function react(message, emoji) {
    try {
      const result = await api(`/api/servers/${encodeURIComponent(state.server.id)}/messages/${encodeURIComponent(message.id)}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) });
      replaceMessage(result.message);
      renderMessages();
    } catch (error) { alert(error.message); }
  }

  function addReactions(body, message) {
    const reactions = message.reactions || [];
    if (!reactions.length) return;
    const bar = document.createElement('div');
    bar.className = 'reaction-bar';
    for (const reaction of reactions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `reaction${reaction.active ? ' active' : ''}`;
      button.textContent = `${reaction.emoji} ${reaction.count}`;
      button.title = reaction.active ? 'Remover sua reação' : 'Adicionar reação';
      button.onclick = () => react(message, reaction.emoji);
      bar.append(button);
    }
    body.append(bar);
  }

  async function attachmentUrl(attachment) {
    if (attachmentUrls.has(attachment.id)) return attachmentUrls.get(attachment.id);
    const response = await fetch(`/api/servers/${encodeURIComponent(state.server.id)}/attachments/${encodeURIComponent(attachment.id)}`, { headers: { Authorization: `Bearer ${state.identity.token}` } });
    if (!response.ok) throw Error('Não foi possível abrir este arquivo.');
    const url = URL.createObjectURL(await response.blob());
    attachmentUrls.set(attachment.id, url);
    return url;
  }

  function addAttachment(body, message) {
    const attachment = message.attachment;
    if (!attachment) return;
    const card = document.createElement('div'), info = document.createElement('div'), name = document.createElement('strong'), meta = document.createElement('small'), open = document.createElement('button');
    card.className = 'message-attachment'; info.className = 'message-attachment-info';
    name.textContent = attachment.name; meta.textContent = `${attachment.type} · ${(Number(attachment.size) / 1048576).toFixed(2)} MB`;
    open.type = 'button'; open.textContent = 'Baixar';
    open.onclick = async () => { open.disabled = true; try { const url = await attachmentUrl(attachment), link = document.createElement('a'); link.href = url; link.download = attachment.name; link.click(); } catch (error) { alert(error.message); } finally { open.disabled = false; } };
    info.append(name, meta); card.append(info, open); body.append(card);
    if (String(attachment.type).startsWith('image/')) {
      const image = document.createElement('img'); image.className = 'message-attachment-preview'; image.alt = attachment.name; card.prepend(image);
      attachmentUrl(attachment).then(url => image.src = url).catch(() => card.classList.add('attachment-error'));
    } else if (String(attachment.type).startsWith('audio/')) {
      const audio = document.createElement('audio'); audio.className = 'message-attachment-media'; audio.controls = true; card.prepend(audio);
      attachmentUrl(attachment).then(url => audio.src = url).catch(() => card.classList.add('attachment-error'));
    } else if (String(attachment.type).startsWith('video/')) {
      const video = document.createElement('video'); video.className = 'message-attachment-preview'; video.controls = true; video.preload = 'metadata'; card.prepend(video);
      attachmentUrl(attachment).then(url => video.src = url).catch(() => card.classList.add('attachment-error'));
    }
  }

  function startEdit(row, message) {
    const text = row.querySelector('.message-text');
    if (!text || row.classList.contains('is-editing')) return;
    row.classList.add('is-editing');
    const editor = document.createElement('textarea');
    editor.className = 'message-editor';
    editor.maxLength = 1000;
    editor.value = message.text;
    const actions = document.createElement('div');
    actions.className = 'message-editor-actions';
    const cancel = document.createElement('button'), save = document.createElement('button');
    cancel.type = save.type = 'button';
    cancel.textContent = 'Cancelar';
    save.textContent = 'Salvar';
    cancel.onclick = () => renderMessages();
    save.onclick = async () => {
      const value = editor.value.trim();
      if (!value) return editor.focus();
      save.disabled = true;
      try {
        const result = await api(`/api/servers/${encodeURIComponent(state.server.id)}/messages/${encodeURIComponent(message.id)}`, { method: 'PATCH', body: JSON.stringify({ text: value }) });
        replaceMessage(result.message);
        renderMessages();
      } catch (error) { save.disabled = false; alert(error.message); }
    };
    editor.onkeydown = event => {
      if (event.key === 'Escape') return renderMessages();
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save.click(); }
    };
    actions.append(cancel, save);
    text.replaceWith(editor, actions);
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  async function removeMessage(message) {
    if (!confirm('Excluir esta mensagem para todos?')) return;
    try {
      await api(`/api/servers/${encodeURIComponent(state.server.id)}/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' });
      state.messages = state.messages.filter(item => item.id !== message.id);
      if (replyingTo?.id === message.id) setReply(null);
      renderMessages();
    } catch (error) { alert(error.message); }
  }

  function emojiMenu(toolbar, message) {
    document.querySelector('.quick-reactions')?.remove();
    const menu = document.createElement('div');
    menu.className = 'quick-reactions';
    for (const emoji of commonEmoji) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = emoji;
      button.onclick = event => { event.stopPropagation(); menu.remove(); react(message, emoji); };
      menu.append(button);
    }
    toolbar.append(menu);
  }

  async function togglePin(message) {
    try {
      const result = await api(`/api/servers/${encodeURIComponent(state.server.id)}/messages/${encodeURIComponent(message.id)}/pin`, { method: message.pinned ? 'DELETE' : 'POST' });
      replaceMessage(result.message);
      renderMessages();
      if (!pinsPanel.hidden) loadPins();
    } catch (error) { alert(error.message); }
  }

  function decorateMessage(row, message) {
    const body = row.children[1];
    if (!body) return;
    addReplyPreview(body, message);
    const time = row.querySelector('.message-time');
    if (time && Number(message.edited)) time.append(document.createTextNode(' · editada'));
    if (message.pinned) { const pinned = document.createElement('span'); pinned.className = 'message-pinned'; pinned.textContent = '📌 Fixada'; body.querySelector('.message-head')?.append(pinned); }
    addAttachment(body, message);
    addReactions(body, message);
    const toolbar = document.createElement('div');
    toolbar.className = 'message-tools';
    const actions = [];
    if (state.server?.capabilities?.sendMessages) actions.push(['↩', 'Responder', () => setReply(message)], ['☺', 'Adicionar reação', event => emojiMenu(event.currentTarget.parentElement, message)]);
    const own = message.author_id === state.identity?.id, canManage = Boolean(state.server?.capabilities?.manageMessages);
    if (own) actions.push(['✎', 'Editar mensagem', () => startEdit(row, message)]);
    if (canManage) actions.push(['📌', message.pinned ? 'Desafixar mensagem' : 'Fixar mensagem', () => togglePin(message)]);
    if (own || canManage) actions.push(['⌫', 'Excluir mensagem', () => removeMessage(message)]);
    for (const [label, title, handler] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.onclick = handler;
      toolbar.append(button);
    }
    if (actions.length) row.append(toolbar);
  }

  const baseRenderMessages = renderMessages;
  renderMessages = () => {
    baseRenderMessages();
    const byId = new Map(currentMessages().map(message => [message.id, message]));
    for (const row of document.querySelectorAll('#messages .message[data-message-id]')) {
      const message = byId.get(row.dataset.messageId);
      if (message) decorateMessage(row, message);
    }
  };

  sendMessage = async event => {
    event.preventDefault();
    const input = document.getElementById('message'), text = input.value.trim();
    if ((!text && !pendingAttachment) || !state.server) return;
    const sentServer = state.server.id, sentChannel = state.channel, replyTo = replyingTo?.id || '', attachment = pendingAttachment;
    input.disabled = true;
    try {
      const result = await api(`/api/servers/${encodeURIComponent(sentServer)}/messages`, { method: 'POST', body: JSON.stringify({ channel: sentChannel, text, reply_to: replyTo, attachment }) });
      if (state.server?.id !== sentServer) return;
      replaceMessage(result.message);
      input.value = '';
      setReply(null);
      setAttachment(null);
      renderMessages();
    } catch (error) { alert(error.message); }
    finally { input.disabled = false; input.focus(); }
  };
  document.getElementById('compose').onsubmit = sendMessage;

  const searchPanel = document.createElement('aside');
  searchPanel.id = 'message-search-panel';
  searchPanel.hidden = true;
  searchPanel.innerHTML = '<header><strong>Pesquisar mensagens</strong><button type="button" aria-label="Fechar pesquisa">×</button></header><form><input maxlength="80" placeholder="Buscar neste servidor" aria-label="Termo da pesquisa"><select aria-label="Onde pesquisar"><option value="channel">Canal atual</option><option value="server">Todo o servidor</option></select><button>Buscar</button></form><div class="message-search-results"></div>';
  document.body.append(searchPanel);
  const closeSearch = () => searchPanel.hidden = true;
  searchPanel.querySelector('header button').onclick = closeSearch;
  function openSearch() { searchPanel.hidden = false; searchPanel.querySelector('input').focus(); }
  const searchTrigger = document.querySelector('.header-actions [title="Pesquisar"]');
  if (searchTrigger) { searchTrigger.tabIndex = 0; searchTrigger.setAttribute('role', 'button'); searchTrigger.onclick = openSearch; searchTrigger.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') openSearch(); }; }
  searchPanel.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const input = searchPanel.querySelector('input'), scope = searchPanel.querySelector('select').value, results = searchPanel.querySelector('.message-search-results'), query = input.value.trim();
    if (query.length < 2) return;
    results.textContent = 'Pesquisando…';
    try {
      const channel = scope === 'channel' ? `&channel=${encodeURIComponent(state.channel)}` : '';
      const data = await api(`/api/servers/${encodeURIComponent(state.server.id)}/messages/search?q=${encodeURIComponent(query)}${channel}`);
      results.replaceChildren();
      if (!data.messages.length) { results.textContent = 'Nenhuma mensagem encontrada.'; return; }
      for (const message of data.messages) {
        const button = document.createElement('button'), head = document.createElement('strong'), copy = document.createElement('span'), meta = document.createElement('small');
        button.type = 'button';
        head.textContent = message.author;
        copy.textContent = message.text;
        meta.textContent = `#${message.channel} · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created))}`;
        button.append(head, copy, meta);
        button.onclick = () => {
          window.VixChatRealtime?.mergeMessages(state.messages, [message]);
          state.channel = message.channel;
          const channels = [...document.querySelectorAll('#text-channels .room-channel-name')].map(item => item.textContent);
          renderChannels(channels);
          renderMessages();
          closeSearch();
          setTimeout(() => {
            const row = document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row?.classList.add('message-focus');
            setTimeout(() => row?.classList.remove('message-focus'), 1400);
          });
        };
        results.append(button);
      }
    } catch (error) { results.textContent = error.message; }
  };

  const pinsPanel = document.createElement('aside');
  pinsPanel.id = 'message-pins-panel'; pinsPanel.hidden = true;
  pinsPanel.innerHTML = '<header><strong>Mensagens fixadas</strong><button type="button" aria-label="Fechar mensagens fixadas">×</button></header><div class="message-pins-results"></div>';
  document.body.append(pinsPanel);
  pinsPanel.querySelector('header button').onclick = () => pinsPanel.hidden = true;
  const pinsTrigger = document.createElement('span');
  pinsTrigger.textContent = '📌'; pinsTrigger.title = 'Mensagens fixadas'; pinsTrigger.tabIndex = 0; pinsTrigger.setAttribute('role', 'button');
  pinsTrigger.onclick = () => { pinsPanel.hidden = !pinsPanel.hidden; if (!pinsPanel.hidden) loadPins(); };
  pinsTrigger.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') pinsTrigger.click(); };
  document.querySelector('.header-actions')?.prepend(pinsTrigger);
  async function loadPins() {
    const results = pinsPanel.querySelector('.message-pins-results');
    if (!state.server) return;
    results.textContent = 'Carregando…';
    try {
      const data = await api(`/api/servers/${encodeURIComponent(state.server.id)}/pins?channel=${encodeURIComponent(state.channel)}`);
      results.replaceChildren();
      if (!data.messages.length) { results.textContent = 'Nenhuma mensagem fixada neste canal.'; return; }
      for (const message of data.messages) {
        const row = document.createElement('button'), author = document.createElement('strong'), copy = document.createElement('span');
        row.type = 'button'; author.textContent = message.author; copy.textContent = message.text || message.attachment?.name || 'Arquivo'; row.append(author, copy);
        row.onclick = () => { window.VixChatRealtime?.mergeMessages(state.messages, [message]); renderMessages(); pinsPanel.hidden = true; setTimeout(() => { const target = document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); target?.classList.add('message-focus'); setTimeout(() => target?.classList.remove('message-focus'), 1400); }); };
        results.append(row);
      }
    } catch (error) { results.textContent = error.message; }
  }
  addEventListener('keydown', event => { if (event.key === 'Escape') { document.querySelector('.quick-reactions')?.remove(); closeSearch(); pinsPanel.hidden = true; } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && state.server) { event.preventDefault(); openSearch(); } });

  window.VixChatActions = { setReply, openSearch, loadPins, replaceMessage };
  if (state.server) renderMessages();
})();
