importScripts('pitch-core.js');

self.onmessage = ({ data }) => {
  try {
    const raw = VocalPitch.level(data.frame.subarray(data.frame.length - Math.round(data.rate * 0.02)));
    const options = data.options || {};
    const gate = 10 ** ((options.gateDb ?? -72) / 20);
    // Silence and clipping need no resampling, YIN search or neural frame.
    if (raw.rms < gate || raw.clipping > 0.02) {
      self.postMessage({ ...raw, t: data.t, hz: null, quality: 0, gate,
        minHz: options.minHz || 65, maxHz: options.maxHz || 1200,
        continuous: options.continuous ?? true, sensitivity: options.sensitivity ?? 70,
        blocked: true, reason: raw.clipping > 0.02 ? 'Mic clipping — lower input level' : 'Below mic threshold' });
      return;
    }
    const samples = VocalPitch.resample(data.frame, data.rate);
    const result = VocalPitch.analyze(samples, options);
    if (raw.clipping > 0.02) { result.hz = null; result.blocked = true; result.reason = 'Mic clipping — lower input level'; }
    if (data.needNeural && !result.blocked) {
      const neuralFrame = samples.slice(-1024);
      self.postMessage({ ...result, t: data.t, neuralFrame, waveform: samples }, [neuralFrame.buffer, samples.buffer]);
    } else self.postMessage({ ...result, t: data.t });
  } catch (error) { self.postMessage({ error: error.message, t: data.t }); }
};
