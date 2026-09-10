(() => {
  let replyingTo = null;
  const commonEmoji = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

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

  function decorateMessage(row, message) {
    const body = row.children[1];
    if (!body) return;
    addReplyPreview(body, message);
    const time = row.querySelector('.message-time');
    if (time && Number(message.edited)) time.append(document.createTextNode(' · editada'));
    addReactions(body, message);
    const toolbar = document.createElement('div');
    toolbar.className = 'message-tools';
    const actions = [];
    if (state.server?.capabilities?.sendMessages) actions.push(['↩', 'Responder', () => setReply(message)], ['☺', 'Adicionar reação', event => emojiMenu(event.currentTarget.parentElement, message)]);
    const own = message.author_id === state.identity?.id, canManage = Boolean(state.server?.capabilities?.manageMessages);
    if (own) actions.push(['✎', 'Editar mensagem', () => startEdit(row, message)]);
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
    if (!text || !state.server) return;
    const sentServer = state.server.id, sentChannel = state.channel, replyTo = replyingTo?.id || '';
    input.disabled = true;
    try {
      const result = await api(`/api/servers/${encodeURIComponent(sentServer)}/messages`, { method: 'POST', body: JSON.stringify({ channel: sentChannel, text, reply_to: replyTo }) });
      if (state.server?.id !== sentServer) return;
      replaceMessage(result.message);
      input.value = '';
      setReply(null);
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
  addEventListener('keydown', event => { if (event.key === 'Escape') { document.querySelector('.quick-reactions')?.remove(); closeSearch(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && state.server) { event.preventDefault(); openSearch(); } });

  window.VixChatActions = { setReply, openSearch, replaceMessage };
  if (state.server) renderMessages();
})();
