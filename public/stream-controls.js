function screenCaptureOptions() {
  const quality = readSettings().screenQuality || '720';
  const heights = { '480': 480, '720': 720, '1080': 1080 };
  return {
    video: { height: { ideal: heights[quality] || 720 }, frameRate: { ideal: 30, max: 30 } },
    audio: readSettings().screenAudio !== false
  };
}

(() => {
  const baseRender = renderVoicePanel;
  renderVoicePanel = () => {
    baseRender();
    if (!microphoneStream) return;
    const box = document.createElement('div');
    box.style.cssText = 'display:grid;gap:7px;margin-top:10px;font-size:12px';
    const label = document.createElement('label'); label.textContent = 'Qualidade da transmissão ';
    const quality = document.createElement('select');
    for (const [value, text] of [['480', '480p · Econômica'], ['720', '720p · Equilibrada'], ['1080', '1080p · Alta']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; quality.append(option);
    }
    quality.value = readSettings().screenQuality || '720';
    quality.disabled = !!screenStream;
    quality.onchange = () => saveSettings({ screenQuality: quality.value });
    label.append(quality);
    const audioLabel = document.createElement('label');
    const audio = document.createElement('input'); audio.type = 'checkbox'; audio.checked = readSettings().screenAudio !== false;
    audio.disabled = !!screenStream;
    audio.onchange = () => saveSettings({ screenAudio: audio.checked });
    audioLabel.append(audio, ' Compartilhar áudio da tela');
    const hint = document.createElement('span');
    hint.textContent = screenStream
      ? (screenStream.getAudioTracks().length ? 'Transmitindo tela e áudio.' : 'Transmitindo sem áudio da tela.')
      : 'Para transmitir som, escolha uma aba e marque compartilhar áudio na janela do navegador.';
    box.append(label, audioLabel, hint); $('voice-state').append(box);
  };
})();
