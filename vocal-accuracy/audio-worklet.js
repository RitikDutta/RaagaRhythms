class VocalCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(Math.ceil(sampleRate * 0.105));
    this.index = 0; this.filled = 0; this.hop = 0; this.sent = false;
    this.port.onmessage = () => { this.sent = false; };
  }
  process(inputs, outputs) {
    // Explicit silence on output; the mic is never played through speakers.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const x of input) {
      this.ring[this.index] = x;
      this.index = (this.index + 1) % this.ring.length;
      this.filled = Math.min(this.filled + 1, this.ring.length);
    }
    this.hop += input.length;
    if (!this.sent && this.filled === this.ring.length && this.hop >= sampleRate * 0.02) {
      this.hop %= Math.round(sampleRate * 0.02);
      const frame = new Float32Array(this.ring.length);
      for (let i = 0; i < frame.length; i++) frame[i] = this.ring[(this.index + i) % frame.length];
      this.sent = true;
      this.port.postMessage({ frame, rate: sampleRate, t: (currentTime + input.length / sampleRate) * 1000 }, [frame.buffer]);
    }
    return true;
  }
}
registerProcessor('vocal-capture', VocalCapture);
