(() => {
  const streams = new Map();
  let selected = null, popout = null;
  const list = document.createElement('section');
  list.id = 'professional-stream-list';
  list.innerHTML = '<header><strong>TRANSMISSÕES</strong><span>0 ao vivo</span></header><div></div>';
  document.getElementById('voice-users')?.after(list);

  const viewer = document.createElement('section');
  viewer.id = 'professional-stream-viewer'; viewer.hidden = true;
  viewer.innerHTML = '<div class="stream-viewer-shell"><header><div><span class="stream-live-dot"></span><div><strong></strong><small>TRANSMISSÃO AO VIVO</small></div></div><nav><button data-action="popout" type="button">Janela destacada</button><button data-action="fullscreen" type="button">Tela cheia</button><button data-action="close" type="button" aria-label="Fechar">×</button></nav></header><main><video autoplay playsinline></video><p role="status"></p></main><footer><label><span>Volume da transmissão</span><input type="range" min="0" max="100" value="100"><output>100%</output></label></footer></div>';
  document.body.append(viewer);
  const shell = viewer.querySelector('.stream-viewer-shell'), video = viewer.querySelector('video'), status = viewer.querySelector('[role="status"]'), volume = viewer.querySelector('input'), output = viewer.querySelector('output');

  function closeViewer() { selected = null; video.pause(); video.srcObject = null; viewer.hidden = true; }
  function streamMedia(item) { return item?.video?.srcObject || item?.stream || null; }
  function applyVolume(item, value) { const amount = Number(value) / 100; if (item?.audio) item.audio.volume = amount; video.volume = amount; output.value = `${value}%`; }
  function watch(id) {
    const item = streams.get(id); if (!item) return closeViewer(); selected = id; viewer.hidden = false;
    viewer.querySelector('header strong').textContent = item.name; status.textContent = 'Preparando transmissão…';
    const media = streamMedia(item); if (video.srcObject !== media) video.srcObject = media;
    applyVolume(item, volume.value); video.play().then(() => { status.textContent = ''; }).catch(() => { status.textContent = 'Clique no vídeo para iniciar a reprodução.'; });
  }
  function render() {
    const body = list.querySelector('div'), count = list.querySelector('header span'); body.replaceChildren(); count.textContent = `${streams.size} ao vivo`;
    list.hidden = !streams.size;
    for (const [id, item] of streams) { const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `<span class="stream-live-dot"></span><span><strong></strong><small>AO VIVO · Assistir</small></span>`; button.querySelector('strong').textContent = item.name; button.onclick = () => watch(id); body.append(button); }
  }
  function remove(id) { streams.delete(String(id)); if (selected === String(id)) closeViewer(); render(); }
  addEventListener('vix:stream-added', event => { const item = event.detail; streams.set(String(item.id), { ...streams.get(String(item.id)), ...item }); render(); if (selected === String(item.id)) watch(selected); });
  addEventListener('vix:stream-audio', event => { const id = String(event.detail.id), item = streams.get(id); if (!item) return; item.audio = event.detail.audio; applyVolume(item, volume.value); });
  addEventListener('vix:stream-removed', event => remove(event.detail.id));
  viewer.querySelector('[data-action="close"]').onclick = closeViewer;
  viewer.querySelector('[data-action="fullscreen"]').onclick = () => shell.requestFullscreen?.().catch(() => vixToast('Tela cheia indisponível.', 'error'));
  viewer.querySelector('[data-action="popout"]').onclick = () => {
    const item = streams.get(selected), media = streamMedia(item); if (!media) return;
    popout?.close(); popout = open('', 'vix-stream', 'popup,width=960,height=600'); if (!popout) return vixAlert('Permita a abertura da janela destacada.');
    popout.document.write('<title>Vix Voice · Transmissão</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080a0f}video{width:100%;height:100%;object-fit:contain}</style><video autoplay playsinline controls></video>');
    const detached = popout.document.querySelector('video'); detached.srcObject = media; detached.volume = Number(volume.value) / 100; detached.play().catch(() => {});
  };
  volume.oninput = () => applyVolume(streams.get(selected), volume.value);
  video.onclick = () => video.play().then(() => { status.textContent = ''; }).catch(() => {});

  let localTrack = null;
  setInterval(() => { const track = screenStream?.getVideoTracks?.().find(item => item.readyState === 'live') || null; if (track === localTrack) return; localTrack = track; if (!track) return remove(state.identity?.id || 'local'); const local = { id: String(state.identity?.id || 'local'), name: `${state.identity?.name || 'Você'} (sua transmissão)`, stream: screenStream }; streams.set(local.id, local); render(); }, 400);
  render();
})();
