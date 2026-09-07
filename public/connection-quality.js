(() => {
  const samples = [];
  let measuring = false;
  let detailsOpen = false;
  let latest = { latency: null, jitter: null, loss: null, route: 'Servidor', peers: 0 };

  function qualityFor(metrics) {
    const { latency, jitter, loss } = metrics;
    if (!Number.isFinite(latency)) return { label: 'Medindo conexão', level: 'unknown' };
    if (latency > 250 || jitter > 50 || loss > 5) return { label: 'Conexão ruim', level: 'poor' };
    if (latency > 150 || jitter > 30 || loss > 2) return { label: 'Conexão instável', level: 'fair' };
    if (latency > 80 || jitter > 15 || loss > 1) return { label: 'Conexão boa', level: 'good' };
    return { label: 'Conexão excelente', level: 'excellent' };
  }

  function median(values) {
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
  }

  const metricValue = (value, suffix) => Number.isFinite(value) ? `${value}${suffix}` : '—';

  function paintDetails(panel) {
    panel.querySelector('.connection-details')?.remove();
    if (!detailsOpen) return;
    const quality = qualityFor(latest);
    const details = document.createElement('section');
    details.className = 'connection-details';
    details.innerHTML = `
      <div class="connection-details-head"><strong>Qualidade da chamada</strong><span class="is-${quality.level}">${quality.label}</span></div>
      <div class="connection-metrics">
        <div><small>LATÊNCIA</small><strong>${metricValue(latest.latency, ' ms')}</strong></div>
        <div><small>JITTER</small><strong>${metricValue(latest.jitter, ' ms')}</strong></div>
        <div><small>PERDA</small><strong>${metricValue(latest.loss, '%')}</strong></div>
      </div>
      <div class="connection-route"><span>Rota</span><strong>${latest.route}</strong></div>
      <p>${latest.peers ? `${latest.peers} conexão${latest.peers > 1 ? 'ões' : ''} WebRTC ativa${latest.peers > 1 ? 's' : ''}.` : 'Latência medida até o servidor de voz.'}</p>`;
    panel.append(details);
  }

  function paintPing(metrics = latest) {
    const panel = document.getElementById('voice-state');
    const header = panel?.querySelector('.call-panel-head');
    if (!header || !microphoneStream) return;
    latest = { ...latest, ...metrics };
    let badge = header.querySelector('.connection-ping');
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'connection-ping';
      header.append(badge);
    }
    const quality = qualityFor(latest);
    badge.className = `connection-ping is-${quality.level}${detailsOpen ? ' is-open' : ''}`;
    badge.innerHTML = `<span class="connection-bars" aria-hidden="true"><i></i><i></i><i></i></span><strong>${metricValue(latest.latency, ' ms')}</strong>`;
    badge.title = `${quality.label} · clique para ver os detalhes`;
    badge.setAttribute('aria-label', badge.title);
    badge.onclick = event => {
      event.stopPropagation();
      detailsOpen = !detailsOpen;
      paintPing();
    };
    paintDetails(panel);
  }

  async function peerMetrics() {
    const result = { latency: [], jitter: [], lost: 0, received: 0, route: 'Direta', peers: 0 };
    for (const peer of voicePeers.values()) {
      if (peer.connection.connectionState !== 'connected') continue;
      try {
        const stats = await peer.connection.getStats();
        const selectedIds = new Set();
        for (const report of stats.values()) if (report.type === 'transport' && report.selectedCandidatePairId) selectedIds.add(report.selectedCandidatePairId);
        let pair = null;
        for (const report of stats.values()) {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.nominated || selectedIds.has(report.id))) {
            if (!pair || selectedIds.has(report.id)) pair = report;
          }
          if (report.type === 'remote-inbound-rtp' && (!report.kind || report.kind === 'audio') && Number.isFinite(report.roundTripTime)) result.latency.push(report.roundTripTime * 1000);
          if (report.type === 'inbound-rtp' && (!report.kind || report.kind === 'audio')) {
            if (Number.isFinite(report.jitter)) result.jitter.push(report.jitter * 1000);
            result.lost += Math.max(0, Number(report.packetsLost) || 0);
            result.received += Math.max(0, Number(report.packetsReceived) || 0);
          }
        }
        if (Number.isFinite(pair?.currentRoundTripTime)) result.latency.push(pair.currentRoundTripTime * 1000);
        const local = pair && stats.get(pair.localCandidateId), remote = pair && stats.get(pair.remoteCandidateId);
        if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') result.route = 'TURN protegida';
        result.peers++;
      } catch (error) {
        console.warn('Estatísticas WebRTC indisponíveis', error);
      }
    }
    if (!result.peers) return null;
    const total = result.received + result.lost;
    return {
      latency: result.latency.length ? Math.round(result.latency.reduce((sum, value) => sum + value, 0) / result.latency.length) : null,
      jitter: result.jitter.length ? Math.round(result.jitter.reduce((sum, value) => sum + value, 0) / result.jitter.length) : null,
      loss: total ? Math.round(result.lost / total * 1000) / 10 : 0,
      route: result.route,
      peers: result.peers
    };
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
      const rtc = await peerMetrics();
      const rawLatency = Number.isFinite(rtc?.latency) ? rtc.latency : await serverRoundTripTime();
      samples.push(rawLatency);
      if (samples.length > 5) samples.shift();
      paintPing({ latency: median(samples), jitter: rtc?.jitter ?? null, loss: rtc?.loss ?? null, route: rtc?.route || 'Servidor', peers: rtc?.peers || 0 });
    } catch (error) {
      console.warn('Não foi possível medir a qualidade da chamada', error);
      paintPing({ latency: null });
    } finally {
      measuring = false;
    }
  }

  const renderVoicePanelBase = renderVoicePanel;
  renderVoicePanel = () => {
    renderVoicePanelBase();
    if (microphoneStream) paintPing(samples.length ? { latency: median(samples) } : { latency: null });
    else {
      samples.length = 0;
      detailsOpen = false;
      latest = { latency: null, jitter: null, loss: null, route: 'Servidor', peers: 0 };
    }
  };

  document.addEventListener('click', event => {
    if (detailsOpen && !event.target.closest('.connection-details')) {
      detailsOpen = false;
      paintPing();
    }
  });
  setInterval(measureConnection, 3000);
  setTimeout(measureConnection, 500);
})();
