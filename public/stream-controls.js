function screenCaptureOptions() {
  const quality = readSettings().screenQuality || '720';
  const fps = Number(readSettings().screenFps || 30);
  const presets = { '480': { width: 854, height: 480 }, '720': { width: 1280, height: 720 }, '1080': { width: 1920, height: 1080 } };
  const preset = presets[quality] || presets['720'];
  return {
    video: { width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: fps, max: fps }, resizeMode: 'none' },
    audio: readSettings().screenAudio !== false
  };
}

function prepareScreenStream(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (track && 'contentHint' in track) track.contentHint = Number(readSettings().screenFps || 30) > 30 ? 'motion' : 'detail';
  return stream;
}

function screenPublishOptions() {
  const quality = readSettings().screenQuality || '720';
  const fps = Number(readSettings().screenFps || 30);
  const bitrate = { '480': 1400000, '720': 3500000, '1080': 6500000 }[quality] || 3500000;
  return { maxBitrate: Math.round(bitrate * (fps > 30 ? 1.35 : 1)), maxFramerate: fps, priority: 'high' };
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
