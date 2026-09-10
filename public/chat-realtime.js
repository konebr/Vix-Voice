(() => {
  const unread = new Map();
  let cursor = 0;
  let polling = false;
  let retryDelay = 1500;
  let timer = 0;
  let typingStopTimer = 0;
  let lastTypingSent = 0;
  let activeTyping = [];

  const messageVersion = message => Math.max(Number(message.created) || 0, Number(message.edited) || 0);
  const isMention = (text, name) => {
    const value = String(text || '').toLocaleLowerCase('pt-BR');
    const displayName = String(name || '').trim().toLocaleLowerCase('pt-BR');
    return value.includes('@todos') || value.includes('@everyone') || Boolean(displayName && value.includes(`@${displayName}`));
  };
  const mergeMessages = (current, incoming, deleted = []) => {
    const byId = new Map(current.map(message => [message.id, message]));
    const added = [];
    let changed = false;
    if (deleted.length) {
      const removed = new Set(deleted);
      const kept = current.filter(message => !removed.has(message.id));
      if (kept.length !== current.length) {
        current.splice(0, current.length, ...kept);
        changed = true;
      }
    }
    for (const message of incoming || []) {
      const previous = byId.get(message.id);
      if (!previous) {
        current.push(message);
        byId.set(message.id, message);
        added.push(message);
        changed = true;
      } else if (JSON.stringify(previous) !== JSON.stringify(message)) {
        Object.assign(previous, message);
        changed = true;
      }
    }
    if (current.length > 600) current.splice(0, current.length - 600);
    current.sort((a, b) => Number(a.created) - Number(b.created));
    return { changed, added };
  };

  function paintUnread() {
    for (const button of document.querySelectorAll('#text-channels .channel')) {
      const channel = button.querySelector('.room-channel-name')?.textContent || button.dataset.channel || '';
      button.querySelector('.channel-unread')?.remove();
      const count = Number(unread.get(channel) || 0);
      if (!count) continue;
      const badge = document.createElement('span');
      badge.className = 'channel-unread';
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.setAttribute('aria-label', `${count} mensagens não lidas`);
      button.append(badge);
    }
  }

  function markCurrentRead() {
    if (!state.channel || !unread.get(state.channel)) return;
    unread.delete(state.channel);
    paintUnread();
  }

  function renderTyping() {
    let indicator = document.getElementById('chat-typing');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'chat-typing';
      indicator.className = 'typing chat-typing';
      indicator.setAttribute('aria-live', 'polite');
      document.getElementById('compose')?.before(indicator);
    }
    const names = [...new Set(activeTyping.filter(entry => entry.channel === state.channel).map(entry => entry.name))];
    indicator.textContent = names.length === 1 ? `${names[0]} está digitando…` : names.length === 2 ? `${names[0]} e ${names[1]} estão digitando…` : names.length > 2 ? `${names.length} pessoas estão digitando…` : '';
  }

  function annotateMessages() {
    const messages = state.messages.filter(message => message.channel === state.channel);
    const rows = document.querySelectorAll('#messages .message');
    rows.forEach((row, index) => {
      const message = messages[index];
      if (!message) return;
      row.dataset.messageId = message.id;
      row.classList.toggle('is-mention', message.author_id !== state.identity?.id && isMention(message.text, state.identity?.name));
    });
  }

  const baseRenderMessages = renderMessages;
  renderMessages = () => {
    const output = document.getElementById('messages');
    const keepBottom = !output || output.scrollHeight - output.scrollTop - output.clientHeight < 90;
    const previousTop = output?.scrollTop || 0;
    baseRenderMessages();
    annotateMessages();
    if (output && !keepBottom) output.scrollTop = previousTop;
    markCurrentRead();
    renderTyping();
  };

  const baseRenderChannels = renderChannels;
  renderChannels = channels => {
    baseRenderChannels(channels);
    for (const button of document.querySelectorAll('#text-channels .channel')) {
      button.addEventListener('click', () => {
        unread.delete(state.channel);
        paintUnread();
        renderTyping();
      });
    }
    paintUnread();
  };

  function notifyMentions(messages) {
    for (const message of messages) {
      if (message.author_id === state.identity?.id || !isMention(message.text, state.identity?.name)) continue;
      window.vixNotify?.(`${message.author} mencionou você`, { body: message.text, tag: `mention-${message.id}` }, 'mention');
    }
  }

  async function synchronize() {
    const currentServer = state.server?.id;
    if (!currentServer || !state.identity || polling) return schedule();
    polling = true;
    try {
      const result = await api(`/api/servers/${encodeURIComponent(currentServer)}/messages?after=${cursor}`);
      if (state.server?.id !== currentServer) return;
      const { changed, added } = mergeMessages(state.messages, result.messages || [], result.deleted || []);
      cursor = Math.max(Number(result.cursor) || Date.now(), cursor, ...state.messages.map(messageVersion));
      activeTyping = result.typing || [];
      for (const message of added) {
        if (message.author_id === state.identity?.id || message.channel === state.channel) continue;
        unread.set(message.channel, Number(unread.get(message.channel) || 0) + 1);
      }
      notifyMentions(added);
      if (changed) renderMessages();
      paintUnread();
      renderTyping();
      retryDelay = 1500;
    } catch (error) {
      retryDelay = Math.min(10000, Math.max(2500, retryDelay * 1.7));
      console.warn('Sincronização do chat temporariamente indisponível.', error);
    } finally {
      polling = false;
      schedule();
    }
  }

  function schedule(immediate = false) {
    clearTimeout(timer);
    const delay = immediate ? 0 : document.hidden ? Math.max(5000, retryDelay) : retryDelay;
    timer = setTimeout(synchronize, delay);
  }

  async function publishTyping(typing) {
    if (!state.server || !state.channel || !state.identity) return;
    const sentServer = state.server.id;
    await api(`/api/servers/${encodeURIComponent(sentServer)}/typing`, { method: 'POST', body: JSON.stringify({ channel: state.channel, typing }) }).catch(() => {});
  }

  const input = document.getElementById('message');
  input?.addEventListener('input', () => {
    clearTimeout(typingStopTimer);
    if (!input.value.trim()) return publishTyping(false);
    const now = Date.now();
    if (now - lastTypingSent > 2200) {
      lastTypingSent = now;
      publishTyping(true);
    }
    typingStopTimer = setTimeout(() => publishTyping(false), 3200);
  });
  document.getElementById('compose')?.addEventListener('submit', () => {
    clearTimeout(typingStopTimer);
    publishTyping(false);
  });

  const baseLoadServer = loadServer;
  loadServer = async server => {
    clearTimeout(typingStopTimer);
    await baseLoadServer(server);
    cursor = 0;
    unread.clear();
    activeTyping = [];
    paintUnread();
    renderTyping();
    schedule(true);
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(true);
  });
  addEventListener('focus', () => schedule(true));

  window.VixChatRealtime = { isMention, mergeMessages, synchronize };
  if (state.server) {
    cursor = 0;
    schedule(true);
  } else schedule();
})();
