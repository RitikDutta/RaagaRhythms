// File analysis uses centered windows and the complete candidate sequence.
// Live tracking remains causal and uses its own low-latency tracker.
const VocalOffline = (() => {
  'use strict';
  const RATE = 16000, HOP = 320;

  function observations(samples, center, options, neural = null) {
    const P = VocalPitch;
    const window = new Float32Array(1536);
    const start = center - 768, lo = Math.max(0, start), hi = Math.min(samples.length, start + window.length);
    window.set(samples.subarray(lo, hi), lo - start);
    const energy = P.level(window.subarray(608, 928));
    const gate = 10 ** ((options.gateDb ?? -72) / 20);
    const base = { t: center / RATE * 1000, ...energy, gate, candidates: [] };
    if (energy.rms < gate || energy.clipping > 0.02) {
      return { ...base, blocked: true, reason: energy.rms < gate ? 'Below input threshold' : 'Clipped audio' };
    }
    const focused = P.focusVoice(window);
    const long = P.yin(focused.subarray(256, 1280), 45, 2000, 35);
    const short = P.yin(focused.subarray(448, 1088), 80, 2000, 12);
    const min = options.minHz || 65, max = options.maxHz || 1200;
    const add = candidate => {
      if (!Number.isFinite(candidate.hz) || candidate.hz < min || candidate.hz > max) return;
      const existing = base.candidates.find(c => Math.abs(P.cents(c.hz, candidate.hz)) < 35);
      if (existing) {
        if (candidate.strength > existing.strength) Object.assign(existing, candidate);
      } else base.candidates.push(candidate);
    };
    for (const result of [long, short]) {
      if (!result.hz || result.hz < min || result.hz > max) continue;
      for (const c of result.candidates) {
        if (c.quality < 0.75) continue;
        const primary = Math.abs(P.cents(c.hz, result.hz)) < 35;
        add({ hz: c.hz, quality: c.quality,
          strength: P.clamp((c.quality - 0.5) * 1.8 - (primary ? 0 : 0.22), 0.05, 0.95),
          source: 'Centered YIN' });
      }
    }
    if (neural && neural.confidence >= 0.65) {
      const support = P.pitchSupport(focused.subarray(256, 1280), neural.hz);
      base.neuralHz = neural.hz; base.neuralConfidence = neural.confidence;
      if (support >= 0.45) add({ hz: neural.hz, quality: support,
        strength: P.clamp(0.25 + 0.55 * neural.confidence + 0.25 * support, 0, 0.99),
        source: 'CREPE + waveform support' });
    }
    base.candidates.sort((a, b) => b.strength - a.strength);
    base.candidates.length = Math.min(8, base.candidates.length);
    return base;
  }

  function decode(frames) {
    if (!frames.length) return [];
    const states = [], backs = [];
    let previousCosts = null;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const best = Math.max(0, ...frame.candidates.map(c => c.strength));
      const current = [{ hz: null, strength: Math.max(0.06, 1 - best), source: 'No reliable pitch' }, ...frame.candidates];
      states.push(current);
      const costs = new Float64Array(current.length), back = new Int16Array(current.length);
      for (let j = 0; j < current.length; j++) {
        let cost = 0, index = 0;
        if (i) {
          cost = Infinity;
          for (let k = 0; k < states[i - 1].length; k++) {
            const old = states[i - 1][k], next = current[j];
            const transition = old.hz && next.hz ? Math.min(1.2, Math.abs(VocalPitch.cents(next.hz, old.hz)) / 400)
              : Boolean(old.hz) !== Boolean(next.hz) ? 0.3 : 0;
            const trial = previousCosts[k] + transition;
            if (trial < cost) { cost = trial; index = k; }
          }
        }
        costs[j] = cost - Math.log(Math.max(1e-6, current[j].strength)); back[j] = index;
      }
      // Removing a common offset prevents cost growth on long recordings.
      const floor = Math.min(...costs);
      for (let j = 0; j < costs.length; j++) costs[j] -= floor;
      backs.push(back); previousCosts = costs;
    }
    let best = 0;
    for (let j = 1; j < previousCosts.length; j++) if (previousCosts[j] < previousCosts[best]) best = j;
    const result = new Array(frames.length);
    for (let i = frames.length - 1; i >= 0; i--) {
      const { candidates, ...frame } = frames[i], chosen = states[i][best];
      result[i] = { ...frame, hz: chosen.hz, quality: chosen.quality || 0, source: chosen.source,
        reason: chosen.hz ? '' : frame.reason || 'No reliable pitch', supported: chosen.source.startsWith('CREPE') };
      best = backs[i][best];
    }
    return result;
  }

  async function analyze(samples, options = {}, predict = null, progress = () => {}) {
    if (!(samples instanceof Float32Array) || !samples.length) throw new Error('No decoded audio to analyze.');
    const frames = [], total = Math.ceil(samples.length / HOP);
    for (let i = 0; i < total; i++) {
      const center = i * HOP;
      let neural = null;
      // Check level before inference so silence and clipping remain gaps.
      const preliminary = observations(samples, center, options);
      if (predict && !preliminary.blocked) {
        const window = new Float32Array(1024), start = center - 512;
        const lo = Math.max(0, start), hi = Math.min(samples.length, start + window.length);
        window.set(samples.subarray(lo, hi), lo - start);
        neural = await predict(window);
      }
      frames.push(neural ? observations(samples, center, options, neural) : preliminary);
      if (i % 25 === 0) {
        progress(i / total);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    progress(0.99);
    const result = decode(frames);
    progress(1);
    return { frames: result, duration: samples.length / RATE, hopMs: HOP / RATE * 1000,
      neural: Boolean(predict), coverage: result.filter(frame => frame.hz).length / result.length };
  }
  return { observations, decode, analyze };
})();
