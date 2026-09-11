// Voz em grupo hospedada: um envio para o SFU da VPS, que distribui o áudio.
(() => {
  const LK = globalThis.LivekitClient;
  if (!LK) {
    console.error('SDK do servidor de voz não foi carregado.');
    return;
  }

  let room = null;
  let publication = null;
  let desired = false;
  let connecting = false;
  let generation = 0;
  let mediaSyncTimer = null;
  let publishedMicrophoneTrack = null;
  let microphoneSourceTrack = null;
  const remoteAudio = new Map();

  const participantId = participant => String(participant?.identity || '');
  const participantName = participant => participant?.name || participantId(participant) || 'Usuário';
  const participantColor = participant => {
    try { return JSON.parse(participant?.metadata || '{}').color || '#5865f2'; }
    catch { return '#5865f2'; }
  };
  const participantPreferences = id => readSettings().participants?.[id] || {};

  function setAudioPreferences(id, audio) {
    const settings = readSettings(), prefs = participantPreferences(id);
    audio.volume = Math.max(0, Math.min(1, Number(settings.outputVolume ?? 100) * Number(prefs.volume ?? 100) / 10000));
    audio.muted = deafened || Boolean(prefs.muted);
    if (audio.setSinkId && settings.output) audio.setSinkId(settings.output).catch(() => {});
  }

  function removeRemoteTrack(track) {
    for (const [sid, item] of remoteAudio) {
      if (item.track !== track) continue;
      for (const element of track.detach()) element.remove();
      remoteAudio.delete(sid);
    }
  }

  function attachRemoteTrack(track, publicationInfo, participant) {
    if (track.kind !== LK.Track.Kind.Audio || publicationInfo.source === LK.Track.Source.ScreenShareAudio) return;
    const audio = track.attach();
    audio.autoplay = true;
    audio.hidden = true;
    audio.dataset.sfuParticipant = participantId(participant);
    setAudioPreferences(participantId(participant), audio);
    document.body.append(audio);
    audio.play().catch(() => {});
    remoteAudio.set(publicationInfo.trackSid, { track, audio, participant });
  }

  function clearRemoteAudio() {
    for (const item of remoteAudio.values()) {
      for (const element of item.track.detach()) element.remove();
    }
    remoteAudio.clear();
  }

  function markActiveSpeakers(speakers) {
    const active = new Set(speakers.map(participantId));
    for (const item of remoteAudio.values()) {
      const id = participantId(item.participant), speaking = active.has(id);
      item.audio.dataset.speaking = String(speaking);
      const settings = readSettings(), prefs = participantPreferences(id);
      item.audio.muted = deafened || Boolean(prefs.muted) || (settings.voiceActivatedOutput !== false && !speaking);
    }
    for (const row of document.querySelectorAll('.voice-user[data-voice-user-id]')) row.dataset.speaking = String(active.has(row.dataset.voiceUserId));
  }

  async function syncPublishedMedia() {
    if (!room || room.state !== LK.ConnectionState.Connected) return;
    const source = microphoneStream?.getAudioTracks?.()[0] || null;
    if (source && source !== microphoneSourceTrack) {
      microphoneSourceTrack = source;
      await micGainContext?.close().catch(() => {});
      micGainContext = null;
      micGainNode = null;
      micGainStream = null;
      await applyMicrophoneVolume(readSettings().inputVolume ?? 100);
    }
    const next = micGainStream?.getAudioTracks?.()[0] || source;
    if (!next || next === publishedMicrophoneTrack) return;
    const enabled = microphoneStream?.getAudioTracks?.()[0]?.enabled !== false;
    if (publication?.track) await room.localParticipant.unpublishTrack(publication.track, false).catch(() => {});
    publication = await room.localParticipant.publishTrack(next, {
      source: LK.Track.Source.Microphone,
      dtx: true,
      red: true,
      audioPreset: LK.AudioPresets?.music
    });
    publishedMicrophoneTrack = next;
    if (!enabled) await publication.mute();
  }

  function setConnectionUi(connected) {
    voiceRoomConnected = connected;
    globalThis.vixVoiceTransport = connected ? 'sfu' : null;
    renderVoicePanel();
    if (connected) {
      const route = document.querySelector('.connection-route strong');
      if (route) route.textContent = 'SFU da VPS';
    }
  }

  async function publishPresence(serverId, channelId) {
    await api(`/api/servers/${serverId}/voice`, { method: 'POST', body: JSON.stringify({ channel: channelId }) });
    await refreshVoiceUsers();
  }

  async function disconnectSfu({ preserveMicrophone = false } = {}) {
    const activeRoom = room, serverId = voiceServerId || state.server?.id;
    generation++;
    desired = false;
    connecting = false;
    clearInterval(mediaSyncTimer);
    mediaSyncTimer = null;
    publication = null;
    publishedMicrophoneTrack = null;
    microphoneSourceTrack = null;
    await micGainContext?.close().catch(() => {});
    micGainContext = null;
    micGainNode = null;
    micGainStream = null;
    room = null;
    clearRemoteAudio();
    setConnectionUi(false);
    if (activeRoom) await activeRoom.disconnect().catch(() => {});
    if (serverId && state.identity) api(`/api/servers/${serverId}/voice`, { method: 'DELETE' }).catch(() => {});
    if (!preserveMicrophone) {
      microphoneStream?.getTracks().forEach(track => track.stop());
      microphoneStream = null;
      cameraStream?.getTracks().forEach(track => track.stop());
      screenStream?.getTracks().forEach(track => track.stop());
      cameraStream = null;
      screenStream = null;
      voiceServerId = null;
      $('voice-channel').classList.remove('active');
      $('mute').disabled = true;
      stopSpeechMeter?.();
      renderVoicePanel();
      refreshVoiceUsers().catch(() => {});
    }
  }

  async function connectSfu() {
    if (connecting || (room && room.state === LK.ConnectionState.Connected)) return;
    if (!state.server) return openPicker();
    const run = ++generation, serverId = state.server.id, channel = { ...selectedVoiceChannel };
    connecting = true;
    desired = true;
    try {
      if (!microphoneStream) microphoneStream = await requestMicrophone();
      $('voice-channel').classList.add('active');
      $('mute').disabled = false;
      voiceServerId = serverId;
      setConnectionUi(false);
      const credentials = await api(`/api/servers/${encodeURIComponent(serverId)}/sfu-token`, {
        method: 'POST', body: JSON.stringify({ channel: channel.id })
      });
      if (run !== generation || !desired) return;
      const nextRoom = new LK.Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
      nextRoom
        .on(LK.RoomEvent.TrackSubscribed, attachRemoteTrack)
        .on(LK.RoomEvent.TrackUnsubscribed, removeRemoteTrack)
        .on(LK.RoomEvent.ActiveSpeakersChanged, markActiveSpeakers)
        .on(LK.RoomEvent.Reconnecting, () => setConnectionUi(false))
        .on(LK.RoomEvent.Reconnected, () => setConnectionUi(true))
        .on(LK.RoomEvent.Disconnected, reason => {
          if (room !== nextRoom) return;
          room = null;
          setConnectionUi(false);
          if (desired) setTimeout(() => connectSfu().catch(() => {}), reason ? 1500 : 500);
        });
      room = nextRoom;
      await nextRoom.connect(credentials.url, credentials.token, { autoSubscribe: true });
      if (run !== generation || !desired) { await nextRoom.disconnect(); return; }
      await syncPublishedMedia();
      await publishPresence(serverId, channel.id);
      setConnectionUi(true);
      startSpeechMeter?.();
      mediaSyncTimer = setInterval(() => {
        syncPublishedMedia().catch(error => console.warn('Falha ao atualizar microfone no SFU', error));
        for (const item of remoteAudio.values()) setAudioPreferences(participantId(item.participant), item.audio);
      }, 500);
    } catch (error) {
      if (run === generation) {
        await disconnectSfu();
        alert(`Não foi possível entrar na sala de voz da VPS: ${microphoneErrorMessage(error)}`);
      }
    } finally { connecting = false; }
  }

  startVoice = connectSfu;
  stopVoice = () => { disconnectSfu().catch(error => console.warn('Falha ao sair da voz', error)); };
  connectVoiceSignal = connectSfu;
  sendVoiceSignal = () => {};
  pollVoiceSignal = () => {};

  $('voice-channel').onclick = startVoice;
  $('leave').onclick = () => stopVoice();
  addEventListener('beforeunload', () => { desired = false; room?.disconnect(); });
  addEventListener('online', () => { if (desired && !room) connectSfu().catch(() => {}); });
})();
