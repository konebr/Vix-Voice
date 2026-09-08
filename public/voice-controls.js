(() => {
  const levels = new Map();
  const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
  const shouldPlayRemoteAudio = (settings, muted, speaking) => !muted && (settings.voiceActivatedOutput === false || speaking);
  const isRemoteSpeaking = (contextState, rms, until, now) => contextState !== 'running' || rms > 0.012 || now < until;
  function preferences(id) { return readSettings().participants?.[id] || {}; }
  function applyOutput(peer) {
    const settings = readSettings(), prefs = preferences(peer.person.id), blocked = deafened || !!prefs.muted;
    peer.audio.volume = clamp(settings.outputVolume ?? 100) * clamp(prefs.volume ?? 100) / 10000;
    peer.audio.muted = !shouldPlayRemoteAudio(settings, blocked, peer.remoteSpeaking === true);
  }
  async function routeOutput(peer) {
    applyOutput(peer);
    if (peer.audio.setSinkId) await peer.audio.setSinkId(readSettings().output || '');
    if (peer.audio.paused) await peer.audio.play().catch(() => {});
  }
  function syncRemotePlayback(peer, speaking) {
    peer.remoteSpeaking = speaking;
    applyOutput(peer);
    if (peer.audio.paused) peer.audio.play().catch(() => {});
  }
  function saveParticipant(id, patch) {
    saveSettings({ participants: { ...readSettings().participants, [id]: { ...preferences(id), ...patch } } });
    const peer = voicePeers.get(id);
    if (peer) applyOutput(peer);
  }
  function decorate() {
    for (const row of $('voice-users').children) {
      const id = row.dataset.voiceUserId;
      if (!id || id === state.identity?.id || row.querySelector('.person-volume')) continue;
      const control = document.createElement('details');
      control.className = 'person-volume';
      const summary = document.createElement('summary'); summary.textContent = 'Volume';
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = 0; slider.max = 100;
      slider.value = preferences(id).volume ?? 100;
      slider.setAttribute('aria-label', `Volume de ${row.textContent}`);
      const value = document.createElement('span'); value.textContent = `${slider.value}%`;
      slider.oninput = () => { saveParticipant(id, { volume: clamp(slider.value) }); value.textContent = `${slider.value}%`; };
      const mute = document.createElement('button'); mute.type = 'button';
      const label = () => { mute.textContent = preferences(id).muted ? 'Ouvir usuário' : 'Silenciar usuário'; };
      label(); mute.onclick = () => { saveParticipant(id, { muted: !preferences(id).muted }); label(); };
      control.append(summary, slider, value, mute); row.append(control); row.style.flexWrap = 'wrap';
    }
  }
  new MutationObserver(decorate).observe($('voice-users'), { childList: true });
  const css = document.createElement('style');
  css.textContent = '.person-volume{margin-left:auto;font-size:11px}.person-volume[open]{width:100%}.person-volume summary{cursor:pointer;color:#b5bac1}.person-volume input{width:65%;vertical-align:middle}.person-volume button{display:block;background:#41434a;color:white;border:0;padding:5px;border-radius:4px}.voice-user[data-speaking="true"]>span:first-child{outline:2px solid #23a559;box-shadow:0 0 8px #23a559}.voice-user[data-speaking="true"]{color:#b8ffce!important}';
  document.head.append(css);
  const basePeer = ensureVoicePeer;
  ensureVoicePeer = person => {
    const peer = basePeer(person);
    if (peer.voiceControlsReady) return peer;
    peer.voiceControlsReady = true;
    routeOutput(peer).catch(error => console.warn('Saída de áudio indisponível', error));
    peer.connection.addEventListener('track', event => {
      if (event.track.kind !== 'audio' || !event.streams[0]) return;
      applyOutput(peer);
      try {
        const context = playbackContext || new AudioContext(), ownsContext = context !== playbackContext;
        const source = context.createMediaStreamSource(new MediaStream([event.track]));
        const analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
        const previous = levels.get(person.id); previous?.source.disconnect(); if (previous?.ownsContext) previous.context.close().catch(() => {});
        levels.set(person.id, { context, ownsContext, source, analyser, samples: new Uint8Array(512), until: 0 });
        syncRemotePlayback(peer, false);
        context.resume().catch(() => {});
      } catch (error) { console.warn('Indicador de fala indisponível', error); }
    });
    return peer;
  };
  const baseClose = closeVoicePeer;
  closeVoicePeer = id => {
    const meter = levels.get(id); meter?.source.disconnect(); if (meter?.ownsContext) meter.context.close().catch(() => {}); levels.delete(id);
    baseClose(id);
  };
  setInterval(() => {
    for (const peer of voicePeers.values()) applyOutput(peer);
    for (const row of $('voice-users').children) {
      const meter = levels.get(row.dataset.voiceUserId);
      if (!meter) continue;
      meter.analyser.getByteTimeDomainData(meter.samples);
      const rms = Math.sqrt(meter.samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / meter.samples.length);
      const now = Date.now(); if (rms > 0.012) meter.until = now + 600;
      const speaking = isRemoteSpeaking(meter.context.state, rms, meter.until, now);
      row.dataset.speaking = String(speaking);
      const peer = voicePeers.get(row.dataset.voiceUserId);
      if (peer) syncRemotePlayback(peer, speaking);
    }
  }, 100);
  document.addEventListener('pointerdown', () => {
    for (const meter of levels.values()) if (meter.context.state === 'suspended') meter.context.resume().catch(() => {});
  }, { passive: true });

  let switching = false;
  async function switchMicrophone() {
    if (!microphoneStream || switching) return;
    switching = true;
    const original = microphoneStream;
    let replacement;
    try {
      const prefs = readSettings();
      replacement = await requestMicrophone(prefs);
      const old = original;
      if (microphoneStream !== original) { replacement.getTracks().forEach(track => track.stop()); return; }
      replacement.getAudioTracks()[0].enabled = old.getAudioTracks()[0]?.enabled ?? true;
      for (const peer of voicePeers.values()) {
        const sender = peer.connection.getSenders().find(item => item.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(replacement.getAudioTracks()[0]);
      }
      micGainNode?.disconnect(); await micGainContext?.close();
      micGainNode = null; micGainContext = null; micGainStream = null;
      microphoneStream = replacement;
      old.getTracks().forEach(track => track.stop());
      await applyMicrophoneVolume(prefs.inputVolume ?? 100);
      startSpeechMeter(); renderVoicePanel();
    } catch (error) {
      if (replacement && replacement !== microphoneStream) {
        for (const peer of voicePeers.values()) {
          const sender = peer.connection.getSenders().find(item => item.track?.kind === 'audio');
          if (sender && microphoneStream) await sender.replaceTrack(micGainStream?.getAudioTracks()[0] || microphoneStream.getAudioTracks()[0]).catch(() => {});
        }
        replacement.getTracks().forEach(track => track.stop());
      }
      alert(`Não foi possível trocar o microfone: ${error.message}`);
    } finally { switching = false; }
  }
  const baseBind = bindVoiceSettings;
  bindVoiceSettings = () => {
    baseBind();
    const autoGain = $('settings-auto-gain'), makeToggle = (id, text, key) => {
      const label = document.createElement('label'); label.className = 'settings-switch'; label.textContent = text;
      const input = document.createElement('input'); input.id = id; input.type = 'checkbox'; input.checked = readSettings()[key] !== false;
      input.onchange = async () => { saveSettings({ [key]: input.checked }); await switchMicrophone(); };
      label.append(input); return label;
    };
    const echo = makeToggle('settings-echo-cancellation', 'Cancelar eco do ambiente', 'echoCancellation');
    const noise = makeToggle('settings-noise-suppression', 'Reduzir ruído de fundo', 'noiseSuppression');
    const activatedOutput = makeToggle('settings-voice-activated-output', 'Ativar saída somente quando alguém falar', 'voiceActivatedOutput');
    activatedOutput.querySelector('input').onchange = () => {
      const enabled = activatedOutput.querySelector('input').checked;
      saveSettings({ voiceActivatedOutput: enabled });
      for (const peer of voicePeers.values()) syncRemotePlayback(peer, enabled ? peer.remoteSpeaking === true : true);
    };
    autoGain.closest('label').after(echo, noise, activatedOutput);
    const activeTrack = microphoneStream?.getAudioTracks()[0], active = activeTrack?.getSettings?.();
    if (activeTrack) {
      const format = document.createElement('p'); format.className = 'voice-format';
      format.textContent = `Formato ativo: ${active.sampleRate ? `${Math.round(active.sampleRate / 1000)} kHz` : 'automático'} · ${active.channelCount > 1 ? 'estéreo' : 'mono'}`;
      noise.after(format);
    }
    $('settings-input').onchange = async event => { saveSettings({ input: event.target.value }); await switchMicrophone(); };
    $('settings-auto-gain').onchange = async event => { saveSettings({ autoGain: event.target.checked }); await switchMicrophone(); };
    $('settings-output').disabled = !('setSinkId' in HTMLMediaElement.prototype);
    $('settings-output').title = $('settings-output').disabled ? 'Use a saída padrão do sistema neste navegador.' : 'Dispositivo que reproduz a voz';
    $('settings-output').onchange = async event => {
      const previous = readSettings().output || '';
      saveSettings({ output: event.target.value });
      try { await Promise.all([...voicePeers.values()].map(routeOutput)); }
      catch (error) { saveSettings({ output: previous }); event.target.value = previous; await Promise.allSettled([...voicePeers.values()].map(routeOutput)); alert(`Não foi possível mudar a saída: ${error.message}`); }
    };
    $('settings-output-volume').oninput = event => { saveSettings({ outputVolume: clamp(event.target.value) }); for (const peer of voicePeers.values()) applyOutput(peer); };
    $('settings-output-volume').onchange = $('settings-output-volume').oninput;
  };
})();
