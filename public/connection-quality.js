(() => {
  const samples = [];
  let measuring = false;

  function qualityFor(ms) {
    if (!Number.isFinite(ms)) return { label: 'Medindo conexão', level: 'unknown' };
    if (ms <= 80) return { label: 'Conexão excelente', level: 'excellent' };
    if (ms <= 150) return { label: 'Conexão boa', level: 'good' };
    if (ms <= 250) return { label: 'Conexão instável', level: 'fair' };
    return { label: 'Conexão ruim', level: 'poor' };
  }

  function median(values) {
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
  }

  function paintPing(ms = null, source = '') {
    const header = document.querySelector('.call-panel-head');
    if (!header || !microphoneStream) return;
    let badge = header.querySelector('.connection-ping');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'connection-ping';
      header.append(badge);
    }
    const quality = qualityFor(ms);
    badge.className = `connection-ping is-${quality.level}`;
    badge.innerHTML = `<span class="connection-bars" aria-hidden="true"><i></i><i></i><i></i></span><strong>${Number.isFinite(ms) ? `${ms} ms` : '— ms'}</strong>`;
    badge.title = `${quality.label}${source ? ` · ${source}` : ''}`;
    badge.setAttribute('aria-label', badge.title);
  }

  async function peerRoundTripTime() {
    const values = [];
    for (const peer of voicePeers.values()) {
      if (peer.connection.connectionState !== 'connected') continue;
      const stats = await peer.connection.getStats();
      const selectedPairs = new Set();
      for (const report of stats.values()) {
        if (report.type === 'transport' && report.selectedCandidatePairId) selectedPairs.add(report.selectedCandidatePairId);
      }
      let peerRtt = null;
      for (const report of stats.values()) {
        const selectedPair = report.type === 'candidate-pair' && report.state === 'succeeded' && (report.nominated || selectedPairs.has(report.id));
        const audioReport = report.type === 'remote-inbound-rtp' && (!report.kind || report.kind === 'audio');
        const seconds = report.currentRoundTripTime ?? report.roundTripTime;
        if ((selectedPair || audioReport) && Number.isFinite(seconds)) {
          peerRtt = Math.round(seconds * 1000);
          if (selectedPair && selectedPairs.has(report.id)) break;
        }
      }
      if (Number.isFinite(peerRtt)) values.push(peerRtt);
    }
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }

  async function serverRoundTripTime() {
    const started = performance.now();
    const response = await fetch(`/ping.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Ping indisponível (${response.status})`);
    return Math.max(1, Math.round(performance.now() - started));
  }

  async function measureConnection() {
    if (measuring || !microphoneStream || !voiceRoomConnected) return;
    measuring = true;
    try {
      const rtcPing = await peerRoundTripTime();
      const value = rtcPing ?? await serverRoundTripTime();
      samples.push(value);
      if (samples.length > 5) samples.shift();
      paintPing(median(samples), rtcPing === null ? 'Servidor' : 'WebRTC');
    } catch (error) {
      console.warn('Não foi possível medir a latência', error);
      paintPing();
    } finally {
      measuring = false;
    }
  }

  const renderVoicePanelBase = renderVoicePanel;
  renderVoicePanel = () => {
    renderVoicePanelBase();
    if (microphoneStream) paintPing(samples.length ? median(samples) : null);
    else samples.length = 0;
  };

  setInterval(measureConnection, 3000);
  setTimeout(measureConnection, 500);
})();
