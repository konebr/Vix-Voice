// Each participant owns a separate screen track. Watching never changes voice audio.
(() => {
  const screens = new Map();
  let selected = null;
  const list = document.createElement('section');
  list.id = 'room-streams';
  list.setAttribute('aria-label', 'Transmissões da sala');
  $('voice-users').after(list);
  const viewer = document.createElement('section');
  viewer.hidden = true;
  viewer.innerHTML = '<header><strong></strong><button type="button">Tela cheia</button><button type="button">Fechar</button></header><video autoplay playsinline controls></video><p role="status"></p>';
  viewer.id = 'stream-viewer';
  document.body.append(viewer);
  const video = viewer.querySelector('video');
  const status = viewer.querySelector('p');
  const buttons = viewer.querySelectorAll('button');
  const style = document.createElement('style');
  style.textContent = '#room-streams{padding:8px}#room-streams button{display:block;width:100%;margin:6px 0;padding:9px;border:0;border-radius:6px;background:#41434a;color:white;text-align:left;cursor:pointer}#stream-viewer:not([hidden]){position:fixed;inset:8vh 5vw;z-index:40;display:flex;flex-direction:column;background:#111214;border:2px solid #5865f2;border-radius:12px;padding:14px}#stream-viewer header{display:flex;gap:12px;align-items:center}#stream-viewer strong{flex:1}#stream-viewer video{width:100%;flex:1;min-height:0;object-fit:contain}#stream-viewer button{padding:8px;cursor:pointer}';
  document.head.append(style);
  function close() { selected = null; video.pause(); video.srcObject = null; viewer.hidden = true; }
  buttons[1].onclick = close;
  buttons[0].onclick = () => viewer.requestFullscreen?.().catch(() => {});
  function watch(id) {
    const item = screens.get(id);
    if (!item?.active) return close();
    selected = id;
    viewer.hidden = false;
    viewer.querySelector('strong').textContent = `Tela de ${item.person.name}`;
    status.textContent = item.track ? '' : 'Aguardando a transmissão…';
    const stream = item.track ? new MediaStream([item.track, ...(item.audioTrack ? [item.audioTrack] : [])]) : null;
    if (video.srcObject?.getVideoTracks()[0] !== item.track || video.srcObject?.getAudioTracks()[0] !== item.audioTrack) video.srcObject = stream;
    if (stream) video.play().catch(() => { status.textContent = 'Clique no vídeo para iniciar.'; });
  }
  video.onclick = () => video.play().then(() => { status.textContent = ''; }).catch(() => {});
  function render() {
    list.replaceChildren();
    for (const [id, item] of screens) {
      if (!item.active) continue;
      const button = document.createElement('button');
      button.textContent = `${item.person.name} · AO VIVO · Assistir`;
      button.onclick = () => watch(id);
      list.append(button);
    }
  }
  function remove(id) { screens.delete(id); if (selected === id) close(); render(); }
  const basePeer = ensureVoicePeer;
  ensureVoicePeer = person => {
    const peer = basePeer(person);
    if (peer.screenTransceiver) return peer;
    peer.screenTransceiver = peer.connection.addTransceiver('video', { direction: 'sendrecv' });
    peer.screenSender = peer.screenTransceiver.sender;
    peer.screenApplied = null;
    peer.screenAudioTransceiver = peer.connection.addTransceiver('audio', { direction: 'sendrecv' });
    peer.screenAudioApplied = null;
    peer.connection.addEventListener('track', event => {
      const screenAudio = event.transceiver === peer.screenAudioTransceiver;
      if (event.track.kind !== 'video' && !screenAudio) return;
      const item = screens.get(person.id) || { person, active: false };
      if (screenAudio) item.audioTrack = event.track; else item.track = event.track;
      screens.set(person.id, item);
      event.track.addEventListener('ended', () => { if (screenAudio) { item.audioTrack = null; if (selected === person.id) watch(person.id); } else remove(person.id); }, { once: true });
      if (selected === person.id) watch(person.id);
    });
    return peer;
  };
  const baseSignal = handleVoiceSignal;
  handleVoiceSignal = event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.from && message.from.id !== state.identity?.id && ['screen-start', 'screen-stop'].includes(message.type)) {
      const item = screens.get(message.from.id) || { person: message.from };
      item.active = message.type === 'screen-start';
      screens.set(message.from.id, item);
      if (!item.active && selected === message.from.id) close();
      render();
      if (selected === message.from.id) watch(selected);
      return;
    }
    return baseSignal(event);
  };
  const baseClosePeer = closeVoicePeer;
  closeVoicePeer = id => { remove(id); baseClosePeer(id); };
  let syncing = false;
  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      const track = screenStream?.getVideoTracks().find(item => item.readyState === 'live') || null;
      for (const peer of voicePeers.values()) {
        if (!peer.screenSender || peer.connection.signalingState !== 'stable') continue;
        const audioTrack = track ? screenStream?.getAudioTracks().find(item => item.readyState === 'live') || null : null;
        if (peer.screenAudioApplied !== audioTrack) { await peer.screenAudioTransceiver.sender.replaceTrack(audioTrack); peer.screenAudioApplied = audioTrack; }
        if (peer.screenApplied === track) continue;
        await peer.screenSender.replaceTrack(track);
        peer.screenApplied = track;
        sendVoiceSignal({ type: track ? 'screen-start' : 'screen-stop', to: peer.person.id });
      }
    } catch (error) { console.warn('Falha ao transmitir a tela', error); }
    finally { syncing = false; }
  }
  setInterval(sync, 250);
  const baseStop = stopVoice;
  stopVoice = () => { baseStop(); screens.clear(); close(); render(); };
})();
