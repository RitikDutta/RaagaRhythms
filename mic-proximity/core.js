/* Acoustic fingerprint comparison. These scores are not physical distances. */
const MicProximity = (() => {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const median = values => {
    const sorted = Array.from(values).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const BANDS = [70, 220, 600, 1600, 4000, 8000];
  const FLOORS = [3, 2.5, 2.5, 2.5, 2.5, 2.5, 0.15];

  function extract(waveform, spectrum, sampleRate, gateDb = -65) {
    if (!waveform.length || !spectrum.length || !Number.isFinite(sampleRate) || sampleRate < 16000) {
      return { valid: false, reason: 'invalid', levelDb: -120 };
    }
    let mean = 0, energy = 0, clipped = 0;
    for (const x of waveform) { mean += x; if (Math.abs(x) >= 0.985) clipped++; }
    mean /= waveform.length;
    for (const x of waveform) energy += (x - mean) ** 2;
    const levelDb = 10 * Math.log10(Math.max(1e-12, energy / waveform.length));
    if (!Number.isFinite(levelDb)) return { valid: false, reason: 'invalid', levelDb: -120 };
    if (clipped / waveform.length > 0.005) return { valid: false, reason: 'clipped', levelDb };
    if (levelDb < gateDb) return { valid: false, reason: 'quiet', levelDb };

    const bands = new Float64Array(5), binHz = sampleRate / (spectrum.length * 2);
    let total = 0, weighted = 0, logPower = 0, bins = 0, peak = 0;
    for (let i = Math.max(1, Math.ceil(BANDS[0] / binHz)); i < spectrum.length; i++) {
      const hz = i * binHz;
      if (hz >= BANDS[5]) break;
      const db = spectrum[i];
      if (!Number.isFinite(db)) continue;
      const power = 10 ** (Math.max(-160, db) / 10);
      let band = 0;
      while (band < 4 && hz >= BANDS[band + 1]) band++;
      bands[band] += power; total += power; weighted += power * hz;
      logPower += Math.log(Math.max(1e-16, power)); bins++; peak = Math.max(peak, power);
    }
    if (!total || !bins) return { valid: false, reason: 'quiet', levelDb };
    const flatness = Math.exp(logPower / bins) / (total / bins);
    if (flatness > 0.4 || peak / total < 0.025) return { valid: false, reason: 'noisy', levelDb };
    const centroid = weighted / total;
    // Ignore bands more than 40 dB below the signal. Amplifying a hum above a
    // fixed noise floor must not masquerade as a changed spectral fingerprint.
    const vector = [levelDb, ...Array.from(bands, power => 10 * Math.log10(Math.max(1e-4, power / total))), Math.log(centroid)];
    return { valid: true, vector, levelDb, centroid, bass: (bands[0] + bands[1]) / total, flatness };
  }

  function profile(frames) {
    const valid = frames.filter(frame => frame.valid && frame.vector?.length === FLOORS.length
      && frame.vector.every(Number.isFinite));
    if (valid.length < 16) throw new Error('Keep humming steadily for two seconds, then capture again.');
    const center = FLOORS.map((_, i) => median(valid.map(frame => frame.vector[i])));
    const spread = center.map((value, i) => 1.4826 * median(valid.map(frame => Math.abs(frame.vector[i] - value))));
    return { center, spread, count: valid.length };
  }

  function fit(away, near, mode = 'voice') {
    const weights = mode === 'hand' ? [0.25, 1, 1, 1, 1, 1, 0.5] : [2, 0.7, 0.7, 0.7, 0.7, 0.7, 0.5];
    const scales = FLOORS.map((floor, i) => Math.max(floor, away.spread[i], near.spread[i]));
    const delta = near.center.map((x, i) => (x - away.center[i]) / scales[i]);
    const length = delta.reduce((sum, x, i) => sum + weights[i] * x * x, 0);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const separation = Math.sqrt(length / totalWeight);
    if (!Number.isFinite(separation) || separation < 0.9) {
      throw new Error('The two samples sound too similar. Try a clearer change in position and capture again.');
    }
    return { away: away.center, near: near.center, weights, scales, delta, length, totalWeight, separation };
  }

  function classify(frame, model) {
    if (!frame.valid) return { kind: frame.reason, score: null, clarity: 0 };
    if (!model) return { kind: 'uncalibrated', score: null, clarity: 0 };
    const relative = frame.vector.map((x, i) => (x - model.away[i]) / model.scales[i]);
    const projection = relative.reduce((sum, x, i) => sum + model.weights[i] * x * model.delta[i], 0) / model.length;
    const score = clamp(projection, 0, 1);
    const residual = Math.sqrt(relative.reduce((sum, x, i) => sum + model.weights[i] * (x - score * model.delta[i]) ** 2, 0) / model.totalWeight);
    if (!Number.isFinite(projection) || residual > 2.8 || projection < -0.6 || projection > 1.6) {
      return { kind: 'unknown', score: null, clarity: 0 };
    }
    const clarity = clamp(Math.abs(score - 0.5) * 2 * Math.exp(-residual * residual / 5), 0, 1);
    const kind = clarity < 0.3 ? 'between' : score >= 0.66 ? 'near' : score <= 0.34 ? 'away' : 'between';
    return { kind, score, clarity };
  }

  class Tracker {
    constructor() { this.reset(); }
    reset() { this.score = null; this.lastAt = null; this.candidate = null; }
    update(result, now) {
      if (!Number.isFinite(result.score)) { this.reset(); return result; }
      const dt = this.lastAt === null ? 100 : clamp(now - this.lastAt, 0, 500);
      this.lastAt = now;
      this.score = this.score === null ? result.score : this.score + (1 - Math.exp(-dt / 160)) * (result.score - this.score);
      const kind = result.kind === 'between' ? 'between' : this.score >= 0.66 ? 'near' : this.score <= 0.34 ? 'away' : 'between';
      if (!this.candidate || this.candidate.kind !== kind) this.candidate = { kind, since: now };
      return { ...result, score: this.score, kind: now - this.candidate.since >= 200 ? kind : 'between' };
    }
  }
  return { extract, profile, fit, classify, Tracker };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MicProximity;
