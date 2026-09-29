// Amplificação local da saída. Acima de 100%, Web Audio aplica ganho real.
(() => {
  let context = null;
  const nodes = new WeakMap();
  const clamp = value => Math.max(0, Math.min(200, Number(value) || 0));
  function ensureNode(audio) {
    let node = nodes.get(audio); if (node) return node;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext; if (!Context) return null;
    context ||= new Context({ latencyHint: 'interactive' });
    const source = context.createMediaElementSource(audio), gain = context.createGain(), limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -5; limiter.knee.value = 8; limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .12;
    source.connect(gain); gain.connect(limiter); limiter.connect(context.destination); node = { gain, limiter }; nodes.set(audio, node); return node;
  }
  globalThis.vixSetOutputVolume = (audio, percent) => {
    if (!audio) return;
    const level = clamp(percent) / 100, existing = nodes.get(audio);
    if (level <= 1 && !existing) { audio.volume = level; return; }
    try {
      const node = existing || ensureNode(audio); if (!node) { audio.volume = Math.min(1, level); return; }
      audio.volume = 1; node.gain.setTargetAtTime(level, context.currentTime, .015); context.resume().catch(() => {});
    } catch (error) { audio.volume = Math.min(1, level); console.warn('Amplificação de saída indisponível', error); }
  };
  globalThis.vixSetBoostOutputDevice = async deviceId => { if (context?.setSinkId) await context.setSinkId(deviceId || 'default'); };
  document.addEventListener('pointerdown', () => context?.resume().catch(() => {}), { passive: true });
})();
