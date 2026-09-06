(() => {
  const labels = {
    mic: 'Ativar ou silenciar microfone', sound: 'Silenciar áudio recebido',
    camera: 'Ligar ou desligar câmera', screen: 'Compartilhar tela', leave: 'Desconectar da voz'
  };
  const findAction = (panel, label) => [...panel.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label);
  function configure(button, icon, text, active, danger = false) {
    if (!button) return document.createElement('span');
    button.className = `call-action${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`;
    button.innerHTML = `<span class="call-action-icon" aria-hidden="true">${icon}</span><span>${text}</span>`;
    return button;
  }
  function streamSettings() {
    const box = document.createElement('section'); box.className = 'stream-settings';
    const head = document.createElement('div'); head.className = 'stream-settings-head'; head.innerHTML = '<span>Qualidade da tela</span><small>30 FPS</small>';
    const choices = document.createElement('div'); choices.className = 'quality-choices';
    const current = readSettings().screenQuality || '720';
    for (const quality of ['480', '720', '1080']) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `${quality}p`;
      button.className = quality === current ? 'selected' : ''; button.disabled = !!screenStream;
      button.onclick = () => { saveSettings({ screenQuality: quality }); renderVoicePanel(); }; choices.append(button);
    }
    const audioLabel = document.createElement('label'); audioLabel.className = 'stream-audio-toggle';
    const copy = document.createElement('span'); copy.innerHTML = '<strong>Áudio da tela</strong><small>Inclui o som da aba compartilhada</small>';
    const audio = document.createElement('input'); audio.type = 'checkbox'; audio.checked = readSettings().screenAudio !== false; audio.disabled = !!screenStream;
    audio.onchange = () => saveSettings({ screenAudio: audio.checked });
    const toggle = document.createElement('span'); toggle.className = 'switch';
    audioLabel.append(copy, audio, toggle); box.append(head, choices, audioLabel); return box;
  }
  const baseRender = renderVoicePanel;
  renderVoicePanel = () => {
    baseRender();
    const panel = $('voice-state'); panel.classList.add('modern-call-panel');
    if (!microphoneStream) {
      panel.classList.remove('is-connected');
      panel.innerHTML = '<div class="call-offline"><span class="call-status-dot"></span><div><strong>Fora da chamada</strong><small>Entre no canal Geral para conversar</small></div></div>';
      return;
    }
    const micTrack = microphoneStream.getAudioTracks()[0];
    const mic = configure(findAction(panel, labels.mic), micTrack?.enabled ? '●' : '×', micTrack?.enabled ? 'Microfone' : 'Silenciado', micTrack?.enabled);
    const sound = configure(findAction(panel, labels.sound), deafened ? '×' : '◖', deafened ? 'Sem áudio' : 'Ouvir', !deafened);
    const camera = configure(findAction(panel, labels.camera), '▣', cameraStream ? 'Câmera ligada' : 'Câmera', !!cameraStream);
    const screen = configure(findAction(panel, labels.screen), screenStream ? '■' : '↗', screenStream ? 'Parar transmissão' : 'Compartilhar tela', !!screenStream, !!screenStream);
    const leave = configure(findAction(panel, labels.leave), '☎', 'Sair da voz', false, true);
    leave.onclick = () => stopVoice();
    const header = document.createElement('header'); header.className = 'call-panel-head';
    header.innerHTML = `<div><span class="call-status-dot${voiceRoomConnected ? '' : ' is-connecting'}"></span><strong>${voiceRoomConnected ? (screenStream ? 'Transmitindo' : 'Voz conectada') : 'Conectando…'}</strong></div><small>${selectedVoiceChannel.name}</small>`;
    const primary = document.createElement('div'); primary.className = 'call-primary-actions'; primary.append(mic, sound, camera);
    const screenRow = document.createElement('div'); screenRow.className = 'call-screen-row'; screenRow.append(screen, leave);
    panel.replaceChildren(header, primary, screenRow, streamSettings()); panel.classList.add('is-connected');
  };
  renderVoicePanel();
})();
