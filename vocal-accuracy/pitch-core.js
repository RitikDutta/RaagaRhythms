const VocalPitch = (() => {
  'use strict';
  const RATE = 16000;
  const SWARAS = ['Sa', 're', 'Re', 'ga', 'Ga', 'Ma', 'M^', 'Pa', 'dha', 'Dha', 'ni', 'Ni'];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const cents = (a, b) => 1200 * Math.log2(a / b);
  const median = values => {
    const a = Array.from(values).sort((x, y) => x - y);
    if (!a.length) return NaN;
    return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2;
  };

  // The capture shape repeats. Cache its windowed-sinc coefficients instead
  // of evaluating thousands of sin/cos calls for every overlapping frame.
  const resampleFilters = new Map();
  function resample(input, rate, count = 1536) {
    if (!Number.isFinite(rate) || rate < 16000) throw new Error('Audio rate must be at least 16 kHz.');
    const key = `${rate}:${input.length}:${count}`;
    let filter = resampleFilters.get(key);
    if (!filter) {
      const ratio = rate / RATE, radius = Math.ceil(12 * ratio);
      const cutoff = 0.43 / Math.max(1, ratio), end = input.length - 1 - radius;
      const taps = 2 * radius + 1;
      const starts = new Int32Array(count), lengths = new Uint16Array(count);
      const weights = new Float64Array(count * taps);
      for (let i = 0; i < count; i++) {
        const pos = end - (count - 1 - i) * ratio;
        const left = Math.max(0, Math.ceil(pos - radius));
        const right = Math.min(input.length - 1, Math.floor(pos + radius));
        starts[i] = left; lengths[i] = Math.max(0, right - left + 1);
        let total = 0;
        const offset = i * taps;
        for (let j = 0; j < lengths[i]; j++) {
          const d = left + j - pos, arg = 2 * Math.PI * cutoff * d;
          const sinc = Math.abs(arg) < 1e-10 ? 1 : Math.sin(arg) / arg;
          const weight = 2 * cutoff * sinc * (0.5 + 0.5 * Math.cos(Math.PI * d / radius));
          weights[offset + j] = weight; total += weight;
        }
        if (total) for (let j = 0; j < lengths[i]; j++) weights[offset + j] /= total;
      }
      filter = { starts, lengths, weights, taps };
      if (resampleFilters.size >= 4) resampleFilters.delete(resampleFilters.keys().next().value);
      resampleFilters.set(key, filter);
    }
    const out = new Float32Array(count);
    const { starts, lengths, weights, taps } = filter;
    for (let i = 0; i < count; i++) {
      let sum = 0;
      const offset = i * taps, start = starts[i];
      for (let j = 0; j < lengths[i]; j++) sum += input[start + j] * weights[offset + j];
      out[i] = sum;
    }
    return out;
  }

  function level(input) {
    let mean = 0, peak = 0, clipped = 0;
    for (const x of input) { mean += x; peak = Math.max(peak, Math.abs(x)); if (Math.abs(x) >= 0.985) clipped++; }
    mean /= input.length;
    let energy = 0;
    for (const x of input) energy += (x - mean) ** 2;
    return { rms: Math.sqrt(energy / input.length), peak, clipping: clipped / input.length };
  }

  // A pitch-only low-pass attenuates high-frequency breath noise and formants.
  // CREPE still receives the original resampled waveform. The two biquads
  // form a fourth-order Butterworth low-pass, without quantizing the pitch.
  function focusVoice(input) {
    let output = Float32Array.from(input);
    for (const q of [0.5411961, 1.306563]) {
      const w = 2 * Math.PI * 2200 / RATE, c = Math.cos(w), alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha, b0 = (1 - c) / (2 * a0), b1 = (1 - c) / a0;
      const a1 = -2 * c / a0, a2 = (1 - alpha) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < output.length; i++) {
        const x = output[i], y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
        output[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
      }
    }
    return output;
  }

  // Evaluate a neural pitch against THIS waveform, not a previously displayed
  // note. Correlation supplies independent evidence even when CMNDF rejects
  // a breathy or amplitude-modulated voice. Noise generally has low support.
  function pitchSupport(input, hz) {
    if (!Number.isFinite(hz) || hz < 45 || hz > 2000) return 0;
    const tau = RATE / hz;
    const start = Math.max(0, input.length - Math.ceil(tau) - 560);
    const end = input.length - Math.ceil(tau) - 1;
    let mean = 0;
    for (let i = start; i < input.length; i++) mean += input[i];
    mean /= input.length - start;
    let cross = 0, first = 0, second = 0;
    for (let i = start; i < end; i++) {
      const pos = i + tau, j = Math.floor(pos), fraction = pos - j;
      const a = input[i] - mean;
      const b = input[j] * (1 - fraction) + input[j + 1] * fraction - mean;
      cross += a * b; first += a * a; second += b * b;
    }
    return first > 1e-14 && second > 1e-14 ? clamp(cross / Math.sqrt(first * second), 0, 1) : 0;
  }

  function followPitch(input, previousHz) {
    if (!Number.isFinite(previousHz) || previousHz < 45 || previousHz > 2000) return null;
    // Search CURRENT audio near the previous period. This is a measured local
    // correlation peak, never a held display value or a guess through silence.
    const radius = 2 ** (70 / 1200);
    // Three cycles give finer period resolution than a noisy one-cycle peak.
    const cycles = 3;
    const firstLag = Math.max(2, Math.floor(cycles * RATE / (previousHz * radius)) - 1);
    const lastLag = Math.ceil(cycles * RATE * radius / previousHz) + 1;
    const width = Math.min(1024, input.length - lastLag);
    if (width < 256) return null;
    const start = input.length - lastLag - width;
    let mean = 0;
    for (let i = start; i < input.length; i++) mean += input[i];
    mean /= input.length - start;
    const correlations = new Float64Array(lastLag - firstLag + 1);
    let peak = 0;
    for (let lag = firstLag; lag <= lastLag; lag++) {
      let cross = 0, a2 = 0, b2 = 0;
      for (let i = start; i < start + width; i++) {
        const a = input[i] - mean, b = input[i + lag] - mean;
        cross += a * b; a2 += a * a; b2 += b * b;
      }
      const index = lag - firstLag;
      correlations[index] = a2 > 1e-14 && b2 > 1e-14 ? cross / Math.sqrt(a2 * b2) : 0;
      if (correlations[index] > correlations[peak]) peak = index;
    }
    if (!peak || peak === correlations.length - 1 || correlations[peak] < 0.5) return null;
    const left = correlations[peak - 1], center = correlations[peak], right = correlations[peak + 1];
    const denominator = left - 2 * center + right;
    const offset = Math.abs(denominator) > 1e-12 ? clamp(0.5 * (left - right) / denominator, -0.5, 0.5) : 0;
    const hz = cycles * RATE / (firstLag + peak + offset);
    if (Math.abs(cents(hz, previousHz)) > 70) return null;
    return { hz, quality: clamp(center, 0, 1) };
  }

  function yin(input, minHz = 65, maxHz = 1200, windowMs = 35) {
    const minTau = Math.max(2, Math.floor(RATE / maxHz));
    const maxTau = Math.min(input.length - 128, Math.ceil(RATE / minHz) + 1);
    const width = Math.min(input.length - maxTau, Math.round(RATE * windowMs / 1000));
    const start = input.length - maxTau - width;
    const diff = new Float64Array(maxTau + 1);
    const norm = new Float64Array(maxTau + 1);
    let cumulative = 0;
    norm[0] = 1;
    // Every lag, starting at 1, contributes to CMNDF. All comparisons use the
    // same integration length; omitting early lags biases the old estimator.
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let i = start; i < start + width; i++) {
        const d = input[i] - input[i + tau];
        sum += d * d;
      }
      diff[tau] = sum;
      cumulative += sum;
      norm[tau] = cumulative > 1e-18 ? sum * tau / cumulative : 1;
    }
    const candidates = [];
    for (let tau = minTau; tau < maxTau; tau++) {
      if (norm[tau] > 0.40 || norm[tau] > norm[tau - 1] || norm[tau] >= norm[tau + 1]) continue;
      // Refine the unnormalized minimum, which avoids CMNDF interpolation bias.
      const denominator = diff[tau - 1] - 2 * diff[tau] + diff[tau + 1];
      const offset = Math.abs(denominator) > 1e-18
        ? clamp(0.5 * (diff[tau - 1] - diff[tau + 1]) / denominator, -0.5, 0.5) : 0;
      const hz = RATE / (tau + offset);
      if (hz < minHz || hz > maxHz) continue;
      candidates.push({ hz, quality: clamp(1 - norm[tau], 0, 1), value: norm[tau] });
    }
    if (!candidates.length) return { hz: null, quality: 0, candidates };
    const deepest = candidates.reduce((a, b) => a.value < b.value ? a : b);
    // For breathy voices no minimum may cross the clean-tone threshold.
    // Prefer the first comparable dip, rather than an arbitrary much longer
    // period that happens to be slightly deeper in noise.
    // Apply the same comparison to every dip. An absolute clean-tone cutoff
    // can skip the fundamental of a breathy voice and choose its second or
    // third period, even though their evidence is almost identical.
    // At high pitches the first sampled minimum can fall between samples.
    // Allow that discretization error only when the waveform is very clean.
    const comparable = deepest.value < 0.005 ? 0.12 : deepest.value * 1.35 + 0.025;
    let best = candidates.find(c => c.value <= comparable);
    // A much deeper longer-period minimum is evidence for a weak fundamental,
    // not permission to blindly divide every pitch by two.
    for (const candidate of candidates) {
      const ratio = best.hz / candidate.hz;
      if (best.value > 0.06 && candidate.value < best.value * 0.2
          && Math.abs(ratio - Math.round(ratio)) < 0.04 && ratio < 3.1 && ratio > 1.9) best = candidate;
    }
    // Multiple observed cycles refine the same fundamental. This reduces the
    // sample-level jitter of a noisy one-period minimum without time smoothing.
    const refinements = [best.hz];
    for (const candidate of candidates) {
      const multiple = Math.round(best.hz / candidate.hz);
      if (multiple >= 2 && multiple <= 4 && candidate.quality >= best.quality - 0.04
          && Math.abs(cents(candidate.hz * multiple, best.hz)) < 50) refinements.push(candidate.hz * multiple);
    }
    return { ...best, hz: median(refinements), candidates };
  }

  function analyze(samples, options = {}) {
    const min = options.minHz || 65, max = options.maxHz || 1200;
    const energy = level(samples.subarray(samples.length - 320));
    const gate = Math.pow(10, (options.gateDb ?? -72) / 20);
    const meta = { ...energy, gate, minHz: min, maxHz: max,
      continuous: options.continuous ?? true, sensitivity: options.sensitivity ?? 70 };
    if (energy.rms < gate) return { hz: null, quality: 0, ...meta, blocked: true, reason: 'Below mic threshold' };
    if (energy.clipping > 0.02) return { hz: null, quality: 0, ...meta, blocked: true, reason: 'Mic clipping — lower input level' };
    // Detect in a wider guard range first. Searching only inside the selected
    // voice range can turn an out-of-range note into an in-range subharmonic.
    const focused = focusVoice(samples);
    const long = yin(focused.subarray(focused.length - 1024), 45, 2000, 35);
    const short = yin(focused.subarray(focused.length - 640), 45, 2000, 18);
    // A fresh, short window can identify the next note before the older
    // samples in the low-register window stop supporting the previous note.
    // Keep the wide search for low voices and require current-cycle support
    // before letting this faster estimate take priority.
    const fast = yin(focused.subarray(focused.length - 640), 80, 2000, 12);
    let chosen = long;
    if (short.hz && short.quality > 0.93 && (!long.hz || short.quality > long.quality + 0.025)) chosen = short;
    if (fast.hz && fast.quality >= 0.93) {
      const recent = focused.subarray(-Math.max(320, Math.ceil(2.5 * RATE / fast.hz)));
      const octaveConflict = long.hz && Math.abs(Math.abs(cents(fast.hz, long.hz)) - 1200) < 50;
      if (pitchSupport(recent, fast.hz) >= 0.9
          && !(octaveConflict && long.quality > 0.97 && fast.quality < long.quality + 0.01)) chosen = fast;
    }
    if (options.continuous !== false && options.previousHz && (!chosen.hz || chosen.quality < 0.8)) {
      const follow = followPitch(focused, options.previousHz);
      if (follow && follow.hz >= min && follow.hz <= max) {
        return { ...follow, ...meta, candidates: [{ ...follow }], agreement: false,
          continuation: true, source: 'Sustained vocal · current waveform', reason: '' };
      }
    }
    if (chosen.hz && (chosen.hz < min || chosen.hz > max)) {
      return { hz: null, quality: chosen.quality, ...meta, blocked: true, reason: 'Pitch outside selected voice range' };
    }
    const agreement = !!(chosen.hz && [short, long].some(other => other !== chosen && other.hz
      && Math.abs(cents(chosen.hz, other.hz)) < 30));
    return { ...chosen, ...meta,
      candidates: chosen.candidates.filter(c => c.hz >= min && c.hz <= max),
      agreement, responsive: chosen === fast, shortHz: short.hz, longHz: long.hz,
      source: chosen === fast ? 'Recent-window YIN' : chosen === short ? 'Short-window YIN' : 'YIN', reason: chosen.hz ? '' : 'No periodic vocal pitch' };
  }

  function neuralIsUsable(frame, neural) {
    if (!neural || !Number.isFinite(neural.hz) || neural.confidence < 0.55) return false;
    const age = frame.t - neural.t;
    if (age < 0) return false;
    if (age <= 100) return !Number.isFinite(frame.stableSince) || neural.t >= frame.stableSince;
    // CPU inference can be slower than the audio hop. Older evidence may only
    // reinforce agreement on an uninterrupted, unchanged pitch, never override
    // a new note or resolve a delayed octave disagreement.
    return age <= 450 && Number.isFinite(frame.stableSince) && neural.t >= frame.stableSince
      && frame.hz && Math.abs(cents(frame.hz, neural.hz)) < 35;
  }

  // It can select an actually observed candidate; it cannot invent a pitch
  // during silence. Neural confidence is not a calibrated probability.
  function fuse(frame, neural) {
    const sensitivity = clamp((frame.sensitivity ?? 70) / 100, 0, 1);
    const minimum = 0.72 - sensitivity * 0.06;
    // Exact-frame neural recovery can stand on its own when the waveform also
    // supports its period. Never recover through silence, clipping, or range gates.
    if (frame.continuous !== false && !frame.blocked && neural && neural.t === frame.t
        && neural.confidence >= 0.7 && neural.support >= 0.45
        && Number.isFinite(neural.hz) && neural.hz >= (frame.minHz || 65) && neural.hz <= (frame.maxHz || 1200)
        && frame.rms > 0 && frame.rms >= (frame.gate || 1e-6)
        && (!frame.hz || frame.quality < 0.8)) {
      const matches = frame.hz && Math.abs(cents(frame.hz, neural.hz)) < 55;
      return { ...frame, hz: matches ? frame.hz : neural.hz,
        quality: Math.max(frame.quality || 0, neural.support), supported: true, weak: false,
        source: matches ? 'YIN + CREPE recovery' : 'CREPE · waveform-supported' };
    }
    const measuredContinuation = frame.continuation && !frame.blocked && frame.quality >= 0.5
      && frame.rms > 0 && frame.rms >= (frame.gate || 1e-6);
    const canContinue = frame.continuous !== false && sensitivity >= 0.5 && frame.hz
      && (measuredContinuation || (frame.lastHz && frame.quality >= 0.6 && Math.abs(cents(frame.hz, frame.lastHz)) < 100));
    if (!frame.hz || (frame.quality < minimum && !canContinue)) return { ...frame, hz: null, reason: frame.reason || 'Pitch too uncertain' };
    const n = neuralIsUsable(frame, neural) ? neural : null;
    if (n) {
      const delta = Math.abs(cents(frame.hz, n.hz));
      if (delta < 45) return { ...frame, supported: true, weak: frame.quality < 0.8, source: 'YIN + CREPE agreement' };
      // Resolve an octave only if YIN also contains a credible minimum there.
      const alternative = (frame.candidates || []).find(c => Math.abs(cents(c.hz, n.hz)) < 40
        && c.quality > 0.86 && c.quality >= frame.quality - 0.035);
      if (alternative && n.confidence > 0.8 && frame.quality < 0.97) {
        return { ...frame, hz: alternative.hz, quality: alternative.quality, supported: true, source: 'CREPE-supported YIN candidate' };
      }
      // Do not blend two different notes into an invented intermediate note.
      // A conflicting neural reading is not a veto on a supported current YIN
      // pitch. Its candidate may be a harmonic or a note from an earlier window.
      if (frame.continuous === false && (frame.quality < 0.86 || (!frame.agreement && frame.quality < 0.95))) {
        return { ...frame, hz: null, reason: 'Detectors disagree' };
      }
    }
    const directMinimum = frame.agreement ? 0.88 - 0.14 * sensitivity : 0.93 - 0.12 * sensitivity;
    if (frame.quality >= directMinimum) return { ...frame, weak: frame.quality < 0.85 };
    // Once acquired, weaker CURRENT measurements can continue a vocal contour
    // without requiring the short and long windows to agree on every frame.
    if (canContinue) {
      return { ...frame, weak: true, continuation: true, source: 'Vocal continuity · measured' };
    }
    if (sensitivity >= 0.5 && frame.quality >= minimum && frame.agreement) {
      return { ...frame, weak: true, source: 'Consistent vocal periodicity' };
    }
    return { ...frame, hz: null, reason: 'Uncertain pitch — try higher vocal sensitivity' };
  }

  class Tracker {
    constructor() { this.reset(); }
    reset() { this.last = null; this.pending = null; this.weakPending = null; this.lastT = -Infinity; }
    push(frame, neural = null) {
      if (!Number.isFinite(frame.t) || frame.t <= this.lastT) return null;
      if (this.last && frame.t - this.last.t > 180) this.last = null;
      this.lastT = frame.t;
      const result = fuse({ ...frame, lastHz: this.last?.hz }, neural);
      if (!result.hz) {
        this.pending = null;
        if (frame.blocked || !frame.rms || frame.t - (this.weakPending?.lastT ?? -Infinity) > 100) this.weakPending = null;
        if (this.last && frame.t - this.last.t > 140) this.last = null;
        return result;
      }
      if (result.weak) {
        const continues = result.continuation || (this.last && frame.t - this.last.t <= 140
          && Math.abs(cents(result.hz, this.last.hz)) < 70);
        if (!continues) {
          if (!this.weakPending || frame.t - this.weakPending.lastT > 100
              || Math.abs(cents(result.hz, this.weakPending.hz)) > 40) {
            this.weakPending = { hz: result.hz, t: frame.t, lastT: frame.t, count: 1 };
          } else { this.weakPending.count++; this.weakPending.lastT = frame.t; }
          if (this.weakPending.count < 3 || frame.t - this.weakPending.t < 40) {
            this.pending = null;
            return { ...result, hz: null, reason: 'Checking soft vocal pitch' };
          }
        }
      } else this.weakPending = null;
      const jump = this.last ? Math.abs(cents(result.hz, this.last.hz)) : 0;
      if (!this.last || jump > 650) {
        if (!this.pending || frame.t - this.pending.lastT > 100 || Math.abs(cents(result.hz, this.pending.hz)) > 70) {
          this.pending = { hz: result.hz, t: frame.t, lastT: frame.t, count: 1 };
          return { ...result, hz: null, reason: 'Confirming pitch' };
        }
        this.pending.count++;
        this.pending.lastT = frame.t;
        const hold = this.last && !result.responsive ? 40 : 20;
        if (this.pending.count < 2 || frame.t - this.pending.t < hold) return { ...result, hz: null, reason: 'Confirming pitch' };
      }
      this.pending = null;
      this.last = { hz: result.hz, t: frame.t };
      return result;
    }
  }

  function swara(hz, sa, offsets = new Array(12).fill(0)) {
    const relative = cents(hz, sa);
    const baseOctave = Math.floor(relative / 1200);
    let best = null;
    for (let octave = baseOctave - 1; octave <= baseOctave + 1; octave++) {
      for (let pc = 0; pc < 12; pc++) {
        const center = octave * 1200 + pc * 100 + (pc ? offsets[pc] || 0 : 0);
        const error = relative - center;
        if (!best || Math.abs(error) < Math.abs(best.error)) {
          best = { pc, octave, error, relativeCents: relative, centerCents: center,
            key: `${pc}:${octave}`, label: SWARAS[pc] + (octave < 0 ? '↓'.repeat(-octave) : '↑'.repeat(octave)) };
        }
      }
    }
    return best;
  }

  function captureSa(frames, now) {
    const recent = frames.filter(f => now - f.t >= 0 && now - f.t <= 1000);
    const voiced = recent.filter(f => Number.isFinite(f.hz) && f.hz > 0 && f.quality >= 0.78);
    if (voiced.length < 12 || voiced.length < recent.length * 0.75
        || now - voiced[voiced.length - 1].t > 120
        || voiced[voiced.length - 1].t - voiced[0].t < 650
        || voiced.some((f, i) => i && f.t - voiced[i - 1].t > 140)) return null;
    const middle = median(voiced.map(f => Math.log2(f.hz)));
    const deviations = voiced.map(f => Math.abs(1200 * (Math.log2(f.hz) - middle))).sort((a, b) => a - b);
    if (deviations[Math.floor(deviations.length * 0.9)] > 18) return null;
    return 2 ** middle;
  }
  return { RATE, SWARAS, cents, median, clamp, resample, level, focusVoice, pitchSupport, followPitch, yin, analyze, neuralIsUsable, fuse, Tracker, swara, captureSa };
})();
