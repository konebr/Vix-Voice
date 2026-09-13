class VixVoiceGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thresholdDb = -42;
    this.enabled = true;
    this.gain = 1;
    this.holdFrames = 0;
    this.reportFrames = 0;
    this.open = true;
    this.port.onmessage = event => {
      if (Number.isFinite(event.data?.thresholdDb)) this.thresholdDb = event.data.thresholdDb;
      if (typeof event.data?.enabled === 'boolean') this.enabled = event.data.enabled;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input?.length || !output?.length) return true;
    let energy = 0, count = 0;
    for (const channel of input) for (const sample of channel) { energy += sample * sample; count++; }
    const rms = Math.sqrt(energy / Math.max(1, count));
    const levelDb = 20 * Math.log10(Math.max(0.00001, rms));
    const openThreshold = this.thresholdDb;
    const closeThreshold = this.thresholdDb - 5;
    if (!this.enabled || levelDb >= openThreshold) {
      this.open = true;
      this.holdFrames = Math.round(sampleRate * .34);
    } else if (this.holdFrames > 0) {
      this.holdFrames -= input[0].length;
    } else if (levelDb < closeThreshold) {
      this.open = false;
    }
    const target = !this.enabled || this.open ? 1 : .003;
    const attack = 1 - Math.exp(-1 / (sampleRate * .006));
    const release = 1 - Math.exp(-1 / (sampleRate * .11));
    for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
      const source = input[Math.min(channelIndex, input.length - 1)], destination = output[channelIndex];
      for (let index = 0; index < destination.length; index++) {
        this.gain += (target - this.gain) * (target > this.gain ? attack : release);
        destination[index] = (source?.[index] || 0) * this.gain;
      }
    }
    this.reportFrames += input[0].length;
    if (this.reportFrames >= sampleRate / 12) {
      this.reportFrames = 0;
      this.port.postMessage({ levelDb: Math.max(-60, levelDb), open: !this.enabled || this.open });
    }
    return true;
  }
}

registerProcessor('vix-voice-gate', VixVoiceGateProcessor);
