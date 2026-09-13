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
  let presenceTimer = null;
  let publishedMicrophoneTrack = null;
  let microphoneSourceTrack = null;
  let screenVideoPublication = null;
  let screenAudioPublication = null;
  let publishedScreenVideoTrack = null;
  let publishedScreenAudioTrack = null;
  let mediaSyncing = false;
  const remoteAudio = new Map();
  const remoteScreen = new Map();

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

  async function sfuMetrics() {
    if (!room || room.state !== LK.ConnectionState.Connected) return null;
    const reports = [];
    for (const publicationInfo of room.localParticipant.audioTrackPublications.values()) {
      const stats = await publicationInfo.track?.getRTCStatsReport?.().catch(() => null);
      if (stats) reports.push(stats);
    }
    for (const item of remoteAudio.values()) {
      if (item.screen) continue;
      const stats = await item.track?.getRTCStatsReport?.().catch(() => null);
      if (stats) reports.push(stats);
    }
    const latency = [], jitter = []; let lost = 0, received = 0;
    for (const stats of reports) for (const report of stats.values()) {
      if (report.type === 'remote-inbound-rtp' && Number.isFinite(report.roundTripTime)) latency.push(report.roundTripTime * 1000);
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && Number.isFinite(report.currentRoundTripTime)) latency.push(report.currentRoundTripTime * 1000);
      if (report.type === 'inbound-rtp' && (!report.kind || report.kind === 'audio')) { if (Number.isFinite(report.jitter)) jitter.push(report.jitter * 1000); lost += Math.max(0, Number(report.packetsLost) || 0); received += Math.max(0, Number(report.packetsReceived) || 0); }
    }
    const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null, total = lost + received;
    return { latency: average(latency), jitter: average(jitter), loss: total ? Math.round(lost / total * 1000) / 10 : 0, route: 'SFU da VPS', peers: remoteAudio.size };
  }
  globalThis.vixGetSfuMetrics = sfuMetrics;

  function removeRemoteTrack(track) {
    for (const [sid, item] of remoteAudio) {
      if (item.track !== track) continue;
      for (const element of track.detach()) element.remove();
      remoteAudio.delete(sid);
    }
    for (const [sid, item] of remoteScreen) {
      if (item.track !== track) continue;
      for (const element of track.detach()) element.remove();
      remoteScreen.delete(sid);
      dispatchEvent(new CustomEvent('vix:stream-removed', { detail: { id: participantId(item.participant) } }));
    }
  }

  function attachRemoteTrack(track, publicationInfo, participant) {
    if (track.kind === LK.Track.Kind.Video && publicationInfo.source === LK.Track.Source.ScreenShare) {
      const video = track.attach();
      video.autoplay = true;
      video.playsInline = true;
      video.controls = true;
      video.title = `Transmissão de ${participantName(participant)}`;
      video.hidden = true;
      remoteScreen.set(publicationInfo.trackSid, { track, video, participant, publication: publicationInfo });
      dispatchEvent(new CustomEvent('vix:stream-added', { detail: { id: participantId(participant), name: participantName(participant), video, publication: publicationInfo } }));
      return;
    }
    if (track.kind !== LK.Track.Kind.Audio) return;
    const audio = track.attach();
    audio.autoplay = true;
    audio.hidden = true;
    audio.dataset.sfuParticipant = participantId(participant);
    if (publicationInfo.source === LK.Track.Source.ScreenShareAudio) {
      audio.volume = Math.max(0, Math.min(1, Number(readSettings().outputVolume ?? 100) / 100));
      audio.muted = deafened;
    } else setAudioPreferences(participantId(participant), audio);
    document.body.append(audio);
    audio.play().catch(() => {});
    remoteAudio.set(publicationInfo.trackSid, { track, audio, participant, screen: publicationInfo.source === LK.Track.Source.ScreenShareAudio });
    if (publicationInfo.source === LK.Track.Source.ScreenShareAudio) dispatchEvent(new CustomEvent('vix:stream-audio', { detail: { id: participantId(participant), audio } }));
  }

  function clearRemoteAudio() {
    for (const item of remoteAudio.values()) {
      for (const element of item.track.detach()) element.remove();
    }
    remoteAudio.clear();
    for (const item of remoteScreen.values()) { for (const element of item.track.detach()) element.remove(); dispatchEvent(new CustomEvent('vix:stream-removed', { detail: { id: participantId(item.participant) } })); }
    remoteScreen.clear();
  }

  function markActiveSpeakers(speakers) {
    const active = new Set(speakers.map(participantId));
    for (const item of remoteAudio.values()) {
      const id = participantId(item.participant), speaking = active.has(id);
      item.audio.dataset.speaking = String(speaking);
      const settings = readSettings(), prefs = participantPreferences(id);
      item.audio.muted = deafened || (!item.screen && Boolean(prefs.muted));
    }
    for (const row of document.querySelectorAll('.voice-user[data-voice-user-id]')) row.dataset.speaking = String(active.has(row.dataset.voiceUserId));
  }

  async function syncPublishedMedia() {
    if (!room || room.state !== LK.ConnectionState.Connected || mediaSyncing) return;
    mediaSyncing = true;
    try {
    const source = microphoneStream?.getAudioTracks?.()[0] || null;
    if (source && source !== microphoneSourceTrack) {
      microphoneSourceTrack = source;
      clearInterval(micGateTimer); micGateTimer = null; micGateNode = null; micGateAnalyser = null;
      await micGainContext?.close().catch(() => {});
      micGainContext = null;
      micGainNode = null;
      micGainStream = null;
      await applyMicrophoneVolume(readSettings().inputVolume ?? 100);
    }
    const next = micGainStream?.getAudioTracks?.()[0] || source;
    if (next && next !== publishedMicrophoneTrack) {
      const enabled = microphoneStream?.getAudioTracks?.()[0]?.enabled !== false;
      if (publication?.track) await room.localParticipant.unpublishTrack(publication.track, false).catch(() => {});
      publication = await room.localParticipant.publishTrack(next, { source: LK.Track.Source.Microphone, dtx: true, red: true, audioPreset: LK.AudioPresets?.speech, forceStereo: false });
      publishedMicrophoneTrack = next;
      if (!enabled) await publication.mute();
    }
    const nextScreenVideo = screenStream?.getVideoTracks?.().find(track => track.readyState === 'live') || null;
    const nextScreenAudio = screenStream?.getAudioTracks?.().find(track => track.readyState === 'live') || null;
    let screenChanged = false;
    if (nextScreenVideo !== publishedScreenVideoTrack) {
      if (screenVideoPublication?.track) await room.localParticipant.unpublishTrack(screenVideoPublication.track, false).catch(() => {});
      if (nextScreenVideo && 'contentHint' in nextScreenVideo) nextScreenVideo.contentHint = Number(readSettings().screenFps || 30) > 30 ? 'motion' : 'detail';
      screenVideoPublication = nextScreenVideo ? await room.localParticipant.publishTrack(nextScreenVideo, { source: LK.Track.Source.ScreenShare, simulcast: true, videoEncoding: typeof screenPublishOptions === 'function' ? screenPublishOptions() : { maxBitrate: 3500000, maxFramerate: 30, priority: 'high' } }) : null;
      publishedScreenVideoTrack = nextScreenVideo;
      screenChanged = true;
    }
    if (nextScreenAudio !== publishedScreenAudioTrack) {
      if (screenAudioPublication?.track) await room.localParticipant.unpublishTrack(screenAudioPublication.track, false).catch(() => {});
      screenAudioPublication = nextScreenAudio ? await room.localParticipant.publishTrack(nextScreenAudio, { source: LK.Track.Source.ScreenShareAudio, dtx: false, red: true }) : null;
      publishedScreenAudioTrack = nextScreenAudio;
      screenChanged = true;
    }
    if (screenChanged) setConnectionUi(true);
    } finally { mediaSyncing = false; }
  }

  addEventListener('vix:stream-view-quality', event => {
    const id = String(event.detail?.id || '');
    const quality = event.detail?.active ? LK.VideoQuality.HIGH : LK.VideoQuality.LOW;
    for (const item of remoteScreen.values()) {
      if (participantId(item.participant) !== id) continue;
      item.publication?.setVideoQuality?.(quality);
      item.publication?.setEnabled?.(true);
    }
  });

  function setConnectionUi(connected, phase = connected ? 'connected' : 'connecting') {
    voiceRoomConnected = connected;
    globalThis.vixVoiceTransport = connected ? 'sfu' : null;
    renderVoicePanel();
    const panel = $('voice-state'), header = panel.querySelector('.call-panel-head');
    const title = header?.querySelector('strong'), dot = header?.querySelector('.call-status-dot');
    panel.querySelector('.voice-recovery-note')?.remove();
    if (title) title.textContent = connected ? (screenStream ? 'Transmitindo · SFU da VPS' : 'Voz conectada · SFU da VPS') : phase === 'reconnecting' ? 'Reconectando à VPS…' : 'Conectando à VPS…';
    dot?.classList.toggle('is-connecting', !connected);
    dot?.classList.toggle('is-reconnecting', phase === 'reconnecting');
    dot?.classList.remove('is-offline');
    const route = panel.querySelector('.connection-route strong');
    if (route && connected) route.textContent = 'SFU da VPS';
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
    clearInterval(presenceTimer);
    presenceTimer = null;
    publication = null;
    publishedMicrophoneTrack = null;
    microphoneSourceTrack = null;
    screenVideoPublication = null;
    screenAudioPublication = null;
    publishedScreenVideoTrack = null;
    publishedScreenAudioTrack = null;
    mediaSyncing = false;
    clearInterval(micGateTimer); micGateTimer = null; micGateNode = null; micGateAnalyser = null;
    await micGainContext?.close().catch(() => {});
    micGainContext = null;
    micGainNode = null;
    micGainStream = null;
    room = null;
    globalThis.vixCanStream = undefined;
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
      globalThis.vixCanStream = credentials.canStream !== false;
      if (run !== generation || !desired) return;
      const nextRoom = new LK.Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
      nextRoom
        .on(LK.RoomEvent.TrackSubscribed, attachRemoteTrack)
        .on(LK.RoomEvent.TrackUnsubscribed, removeRemoteTrack)
        .on(LK.RoomEvent.ActiveSpeakersChanged, markActiveSpeakers)
        .on(LK.RoomEvent.Reconnecting, () => setConnectionUi(false, 'reconnecting'))
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
      setConnectionUi(true);
      await publishPresence(serverId, channel.id);
      startSpeechMeter?.();
      presenceTimer = setInterval(() => {
        if (room === nextRoom && nextRoom.state === LK.ConnectionState.Connected)
          publishPresence(serverId, channel.id).catch(error => console.warn('Falha ao renovar presença na voz', error));
      }, 10000);
      mediaSyncTimer = setInterval(() => {
        syncPublishedMedia().catch(error => console.warn('Falha ao atualizar microfone no SFU', error));
        for (const item of remoteAudio.values()) {
          if (item.screen) {
            item.audio.volume = Math.max(0, Math.min(1, Number(readSettings().outputVolume ?? 100) / 100));
            item.audio.muted = deafened;
          } else setAudioPreferences(participantId(item.participant), item.audio);
        }
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
  // The footer gear belongs to account settings. Voice disconnection is handled
  // by the dedicated "Sair da voz" control rendered inside the call panel.
  $('leave').onclick = () => openUserSettings();
  addEventListener('beforeunload', () => { desired = false; room?.disconnect(); });
  addEventListener('online', () => { if (desired && !room) connectSfu().catch(() => {}); });
})();
