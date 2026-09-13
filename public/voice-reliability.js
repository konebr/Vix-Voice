(() => {
  const reconnectDelays = [0, 1200, 2500, 5000, 8000, 12000, 18000];
  function voiceReconnectDelay(attempt) { return reconnectDelays[Math.min(Math.max(0, attempt), reconnectDelays.length - 1)]; }
  let wanted = false, reconnectTimer = null, reconnectAttempt = 0, connecting = false, generation = 0;
  let target = null, recoveryState = 'idle', recoveryReason = '';

  function signalPath(serverId, session) {
    return `/api/servers/${encodeURIComponent(serverId)}/voice-signal?session=${encodeURIComponent(session)}`;
  }

  function announce(stateName, reason = '') {
    recoveryState = stateName; recoveryReason = reason;
    renderVoicePanel();
    window.dispatchEvent(new CustomEvent('vix:voice-state', { detail: { state: stateName, reason, attempt: reconnectAttempt } }));
  }

  function clearReconnectTimer() { clearTimeout(reconnectTimer); reconnectTimer = null; }

  function discardTransport(removeRemote = true) {
    const session = voiceSignalSession, serverId = target?.serverId || state.server?.id;
    generation++;
    voiceSignalSession = null; voiceRoomConnected = false; voiceSignalPolling = false;
    clearInterval(voiceSignalTimer); voiceSignalTimer = null;
    for (const id of [...voicePeers.keys()]) closeVoicePeer(id);
    if (removeRemote && session && serverId) api(signalPath(serverId, session), { method: 'DELETE' }).catch(() => {});
  }

  function canReconnect() {
    return wanted && Boolean(microphoneStream && target && state.server?.id === target.serverId);
  }

  function scheduleReconnect(reason = 'A conexão foi interrompida.', immediate = false) {
    if (!canReconnect()) return;
    clearReconnectTimer(); discardTransport();
    const offline = navigator.onLine === false, delay = offline ? reconnectDelays.at(-1) : immediate ? 0 : voiceReconnectDelay(reconnectAttempt++);
    announce(offline ? 'offline' : 'reconnecting', reason);
    reconnectTimer = setTimeout(establishVoiceSession, delay);
  }

  async function establishVoiceSession() {
    clearReconnectTimer();
    if (!canReconnect()) return;
    if (connecting) { reconnectTimer = setTimeout(establishVoiceSession, 500); return; }
    if (navigator.onLine === false) return scheduleReconnect('Aguardando sua internet voltar.');
    connecting = true;
    const run = ++generation, session = crypto.randomUUID(), activeTarget = { ...target };
    voiceSignalSession = session; voiceRoomConnected = false; voiceSignalFailures = 0;
    announce(reconnectAttempt ? 'reconnecting' : 'connecting', recoveryReason);
    try {
      await api(signalPath(activeTarget.serverId, session), { method: 'POST', body: JSON.stringify({ type: 'voice-join', channel: activeTarget.channelId }) });
      if (run !== generation || !canReconnect() || voiceSignalSession !== session) return;
      reconnectAttempt = 0; voiceSignalFailures = 0; voiceRoomConnected = true;
      announce('connected');
      await refreshVoiceUsers();
      clearInterval(voiceSignalTimer); voiceSignalTimer = setInterval(pollVoiceSignal, 1000);
      pollVoiceSignal();
    } catch (error) {
      if (run === generation && canReconnect()) scheduleReconnect(error.message || 'Servidor de voz indisponível.');
    } finally { connecting = false; }
  }

  connectVoiceSignal = async () => {
    if (!state.server || !microphoneStream) return;
    wanted = true;
    target = { serverId: state.server.id, channelId: selectedVoiceChannel.id, channelName: selectedVoiceChannel.name };
    if (voiceRoomConnected && voiceSignalSession) return;
    await establishVoiceSession();
  };

  pollVoiceSignal = async () => {
    if (!voiceSignalSession || voiceSignalPolling || !wanted) return;
    voiceSignalPolling = true;
    try {
      const { events = [] } = await api(signalPath(target.serverId, voiceSignalSession));
      voiceSignalFailures = 0;
      for (const event of events) await handleVoiceSignal({ data: JSON.stringify(event) });
    } catch (error) {
      voiceSignalFailures++;
      if (voiceSignalFailures >= 3) scheduleReconnect(error.message || 'Sinalização de voz interrompida.');
    } finally { voiceSignalPolling = false; }
  };

  const baseEnsureVoicePeer = ensureVoicePeer;
  ensureVoicePeer = person => {
    const peer = baseEnsureVoicePeer(person);
    if (peer.reliabilityReady) return peer;
    peer.reliabilityReady = true;
    const paint = () => {
      const row = [...$('voice-users').querySelectorAll('.voice-user')].find(item => item.dataset.voiceUserId === person.id);
      if (row) row.dataset.connection = peer.connection.connectionState;
    };
    peer.connection.addEventListener('connectionstatechange', () => {
      paint();
      if (peer.connection.connectionState === 'failed' && wanted) scheduleReconnect(`Reconectando o áudio de ${person.name}.`, true);
      if (peer.connection.connectionState === 'disconnected') setTimeout(() => {
        if (wanted && (!voicePeers.has(person.id) || peer.connection.connectionState !== 'connected')) scheduleReconnect(`A conexão com ${person.name} ficou instável.`);
      }, 9000);
    });
    requestAnimationFrame(paint);
    return peer;
  };

  const baseRenderVoicePanel = renderVoicePanel;
  renderVoicePanel = () => {
    baseRenderVoicePanel();
    if (!microphoneStream) return;
    const header = $('voice-state').querySelector('.call-panel-head'), title = header?.querySelector('strong'), dot = header?.querySelector('.call-status-dot');
    const sfuConnected = voiceRoomConnected && globalThis.vixVoiceTransport === 'sfu';
    if (!header || recoveryState === 'connected' || sfuConnected) {
      $('voice-state').querySelector('.voice-recovery-note')?.remove();
      return;
    }
    const labels = { connecting: 'Conectando…', reconnecting: 'Reconectando…', offline: 'Sem internet' };
    if (title) title.textContent = labels[recoveryState] || 'Preparando voz…';
    dot?.classList.add(recoveryState === 'offline' ? 'is-offline' : 'is-reconnecting');
    let note = $('voice-state').querySelector('.voice-recovery-note');
    if (!note) { note = document.createElement('div'); note.className = 'voice-recovery-note'; header.after(note); }
    note.innerHTML = `<span>${recoveryState === 'offline' ? 'Aguardando a rede voltar' : `Tentativa ${Math.max(1, reconnectAttempt)}`}</span><small>${recoveryReason || 'Restaurando sua sessão sem desligar o microfone.'}</small>`;
  };

  const baseStartVoice = startVoice;
  startVoice = async () => {
    wanted = true; reconnectAttempt = 0; recoveryReason = '';
    if (state.server) target = { serverId: state.server.id, channelId: selectedVoiceChannel.id, channelName: selectedVoiceChannel.name };
    await baseStartVoice();
    if (!microphoneStream) { wanted = false; target = null; announce('idle'); }
  };

  const baseStopVoice = stopVoice;
  stopVoice = () => {
    wanted = false; target = null; recoveryState = 'idle'; recoveryReason = ''; reconnectAttempt = 0; connecting = false; generation++;
    clearReconnectTimer();
    baseStopVoice();
  };

  addEventListener('offline', () => { if (canReconnect()) scheduleReconnect('A conexão com a internet foi perdida.'); });
  addEventListener('online', () => { if (canReconnect() && !voiceRoomConnected) scheduleReconnect('Internet restaurada. Reconectando agora.', true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && canReconnect() && !voiceRoomConnected) scheduleReconnect('Retomando a chamada.', true); });
  $('voice-channel').onclick = startVoice;
})();
