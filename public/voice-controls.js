(() => {
  const levels = new Map();
  const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
  function preferences(id) { return readSettings().participants?.[id] || {}; }
  function applyOutput(peer) {
    const prefs = preferences(peer.person.id);
    peer.audio.volume = clamp(readSettings().outputVolume ?? 100) * clamp(prefs.volume ?? 100) / 10000;
    peer.audio.muted = deafened || !!prefs.muted;
  }
  async function routeOutput(peer) {
    applyOutput(peer);
    if (peer.audio.setSinkId) await peer.audio.setSinkId(readSettings().output || '');
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
      if (event.track.kind !== 'audio' || event.transceiver === peer.screenAudioTransceiver) return;
      applyOutput(peer);
      try {
        const context = new AudioContext(), source = context.createMediaStreamSource(new MediaStream([event.track]));
        const analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
        levels.get(person.id)?.context.close().catch(() => {});
        levels.set(person.id, { context, source, analyser, samples: new Uint8Array(512), until: 0 });
        context.resume().catch(() => {});
      } catch (error) { console.warn('Indicador de fala indisponível', error); }
    });
    return peer;
  };
  const baseClose = closeVoicePeer;
  closeVoicePeer = id => {
    const meter = levels.get(id); meter?.source.disconnect(); meter?.context.close().catch(() => {}); levels.delete(id);
    baseClose(id);
  };
  setInterval(() => {
    for (const peer of voicePeers.values()) applyOutput(peer);
    for (const row of $('voice-users').children) {
      const meter = levels.get(row.dataset.voiceUserId);
      if (!meter) continue;
      meter.analyser.getByteTimeDomainData(meter.samples);
      const rms = Math.sqrt(meter.samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / meter.samples.length);
      if (rms > 0.025) meter.until = Date.now() + 250;
      row.dataset.speaking = String(Date.now() < meter.until);
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
      replacement = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: prefs.input ? { exact: prefs.input } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: prefs.autoGain !== false } });
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
