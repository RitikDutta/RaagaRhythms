importScripts('pitch-core.js');

let previous = null;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'reset') { previous = null; return; }
    const raw = VocalPitch.level(data.frame.subarray(data.frame.length - Math.round(data.rate * 0.02)));
    const requested = data.options || {};
    const recent = requested.continuous !== false && previous && data.t > previous.t && data.t - previous.t <= 200;
    const options = { ...requested,
      gateDb: recent ? Math.max(-80, (requested.gateDb ?? -72) - 10) : requested.gateDb,
      previousHz: recent ? previous.hz : null };
    const gate = 10 ** ((options.gateDb ?? -72) / 20);
    // Silence and clipping need no resampling, YIN search or neural frame.
    if (raw.rms < gate || raw.clipping > 0.02) {
      previous = null;
      self.postMessage({ ...raw, t: data.t, hz: null, quality: 0, gate,
        minHz: options.minHz || 65, maxHz: options.maxHz || 1200,
        continuous: options.continuous ?? true, sensitivity: options.sensitivity ?? 70,
        blocked: true, reason: raw.clipping > 0.02 ? 'Mic clipping — lower input level' : 'Below mic threshold' });
      return;
    }
    const samples = VocalPitch.resample(data.frame, data.rate);
    const result = VocalPitch.analyze(samples, options);
    if (result.hz && (result.continuation || result.quality >= 0.8)) previous = { hz: result.hz, t: data.t };
    else if (!recent || (result.blocked && (result.reason !== 'Pitch outside selected voice range' || result.quality >= 0.9))) previous = null;
    if (data.needNeural && !result.blocked) {
      const neuralFrame = samples.slice(-1024);
      self.postMessage({ ...result, t: data.t, neuralFrame, waveform: samples }, [neuralFrame.buffer, samples.buffer]);
    } else self.postMessage({ ...result, t: data.t });
  } catch (error) { self.postMessage({ error: error.message, t: data.t }); }
};
