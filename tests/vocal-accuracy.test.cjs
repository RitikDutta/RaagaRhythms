'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../vocal-accuracy/pitch-core.js'), 'utf8');
const P = vm.runInNewContext(source + '\nVocalPitch;', { Float32Array, Float64Array, Math, Number, Array, Infinity });
let seed = 19;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }
function tone(hz, rate = 16000, count = 1536, harmonics = [1], noise = 0, phase = 0) {
  return Float32Array.from({ length: count }, (_, i) => {
    let x = 0;
    for (let k = 0; k < harmonics.length; k++) x += harmonics[k] * Math.sin(2 * Math.PI * hz * (k + 1) * i / rate + phase * (k + 1));
    return x * 0.18 + (random() * 2 - 1) * noise;
  });
}
function near(actual, expected, tolerance = 5) {
  assert.ok(actual && Math.abs(P.cents(actual, expected)) <= tolerance, `${actual} Hz vs ${expected} Hz (${P.cents(actual, expected).toFixed(2)} cents)`);
}
const options = { minHz: 55, maxHz: 1400, gateDb: -55 };
function frame(hz, t, extra = {}) {
  return { hz, t, quality: 0.99, agreement: true, candidates: [{ hz, quality: 0.99 }], ...extra };
}

test('clean pitches across the vocal range at multiple phases', () => {
  let maxError = 0;
  for (const hz of [55.5, 65, 82.41, 98, 130.81, 196, 240, 261.626, 329.628, 440, 523.251, 783.99, 1046.5, 1390]) {
    for (const phase of [0, 0.43, 1.6]) {
      const result = P.analyze(tone(hz, 16000, 1536, [1], 0, phase), options);
      near(result.hz, hz, 6);
      maxError = Math.max(maxError, Math.abs(P.cents(result.hz, hz)));
    }
  }
  console.log('Clean-tone maximum error:', maxError.toFixed(3), 'cents');
});

test('Sa-relative swaras and octave boundaries preserve continuous cents', () => {
  for (const sa of [130.81, 220, 240, 261.63, 320]) {
    for (let step = -12; step <= 24; step++) {
      const note = P.swara(sa * 2 ** ((step * 100 + 17) / 1200), sa);
      assert.equal(note.pc, ((step % 12) + 12) % 12);
      assert.equal(note.octave, Math.floor(step / 12));
      assert.ok(Math.abs(note.error - 17) < 1e-7);
    }
  }
  const offsets = new Array(12).fill(0); offsets[4] = -14;
  const note = P.swara(240 * 2 ** (386 / 1200), 240, offsets);
  assert.equal(note.label, 'Ga'); assert.ok(Math.abs(note.error) < 1e-8);
});

test('weak or missing fundamentals and strong harmonics', () => {
  for (const harmonics of [[0.2, 1, 0.5, 0.3], [0, 1, 0.8, 0.4], [1, 0.6, 0.3, 0.2, 0.1]]) {
    for (const hz of [70, 110, 196, 240, 350, 500]) near(P.analyze(tone(hz, 16000, 1536, harmonics, 0.005), options).hz, hz, 6);
  }
});

test('44.1, 48, and 96 kHz resampling keeps pitch and suppresses aliasing', () => {
  for (const rate of [44100, 48000, 96000]) {
    for (const hz of [70, 130.81, 240, 440, 880, 1200]) {
      const samples = P.resample(tone(hz, rate, Math.ceil(rate * 0.105), [1, 0.4, 0.2]), rate);
      near(P.analyze(samples, options).hz, hz, 6);
    }
    const alias = P.resample(tone(16000 - 240, rate, Math.ceil(rate * 0.105)), rate);
    assert.ok(P.level(alias).rms < 0.001, `alias leakage at ${rate}: ${P.level(alias).rms}`);
  }
});

test('silence, DC offset, breath-like noise, and clipping do not report a note', () => {
  const silence = new Float32Array(1536);
  assert.equal(P.analyze(silence, options).hz, null);
  assert.equal(P.analyze(new Float32Array(1536).fill(0.2), options).hz, null);
  for (let i = 0; i < 20; i++) {
    const noise = Float32Array.from({ length: 1536 }, () => (random() * 2 - 1) * 0.12);
    assert.equal(P.fuse({ ...P.analyze(noise, options), t: i * 20 }, null).hz, null);
  }
  const clipped = Float32Array.from(tone(240), x => Math.max(-1, Math.min(1, x * 20)));
  assert.equal(P.analyze(clipped, options).hz, null);
});

test('fresh neural evidence selects an observed candidate; stale or weak evidence cannot', () => {
  const y = frame(480, 200, { sensitivity: 0, quality: 0.91, agreement: false, candidates: [{ hz: 480, quality: 0.91 }, { hz: 240, quality: 0.94 }] });
  assert.equal(P.fuse(y, { hz: 240, confidence: 0.95, t: 180 }).hz, 240);
  assert.equal(P.fuse(y, { hz: 240, confidence: 0.95, t: 0 }).hz, null);
  assert.equal(P.fuse(y, { hz: 240, confidence: 0.2, t: 180 }).hz, null);
  assert.equal(P.fuse({ hz: null, t: 200, quality: 0 }, { hz: 240, confidence: 0.99, t: 200 }).hz, null);
  near(P.fuse(frame(240, 200), { hz: 480, confidence: 0.95, t: 180 }).hz, 240);
});

test('tracker rejects one-frame octave errors but accepts a sustained octave leap', () => {
  const tracker = new P.Tracker();
  assert.equal(tracker.push(frame(240, 0)).hz, null);
  near(tracker.push(frame(240, 20)).hz, 240);
  assert.equal(tracker.push(frame(480, 40)).hz, null);
  near(tracker.push(frame(240, 60)).hz, 240);
  assert.equal(tracker.push(frame(480, 80)).hz, null);
  assert.equal(tracker.push(frame(480, 100)).hz, null);
  near(tracker.push(frame(480, 120)).hz, 480);
  assert.equal(tracker.push(frame(240, 100)), null, 'out-of-order frames ignored');
  assert.equal(tracker.push({ hz: null, quality: 0, t: 140 }).hz, null, 'no stale pitch after silence');
});

test('meend and gamak remain continuous through the tracking stage', () => {
  for (const motion of [t => 240 * 2 ** (t * 400 / 1200), t => 240 * 2 ** (70 * Math.sin(2 * Math.PI * 5 * t) / 1200)]) {
    const tracker = new P.Tracker();
    for (let i = 0; i < 60; i++) {
      const hz = motion(i * 0.02), result = tracker.push(frame(hz, i * 20));
      if (i > 0) near(result.hz, hz, 1e-7);
    }
  }
});

test('audio glide and rapid swara changes produce the expected pitch', () => {
  const rate = 16000;
  let phase = 0;
  const wave = new Float32Array(rate * 2);
  for (let i = 0; i < wave.length; i++) {
    const hz = 180 * 2 ** ((i / rate) * 200 / 1200);
    phase += 2 * Math.PI * hz / rate;
    wave[i] = 0.2 * Math.sin(phase) + 0.08 * Math.sin(2 * phase);
  }
  for (let end = 1536; end < wave.length; end += 640) {
    const result = P.analyze(wave.subarray(end - 1536, end), options);
    near(result.hz, 180 * 2 ** (((end / rate) - 0.03) * 200 / 1200), 12);
  }
  const old = tone(240), next = tone(269.391);
  for (const elapsed of [640, 960, 1280]) {
    const mixed = new Float32Array(1536);
    mixed.set(old.subarray(elapsed), 0); mixed.set(next.subarray(0, elapsed), 1536 - elapsed);
    const result = P.analyze(mixed, options);
    if (elapsed >= 960) near(result.hz, 269.391, 6);
  }
});

test('Sa capture requires a recent, continuous, steady voiced phrase', () => {
  const frames = Array.from({ length: 46 }, (_, i) => frame(240 * 2 ** ((random() - 0.5) * 4 / 1200), i * 20));
  near(P.captureSa(frames, 920), 240, 1);
  assert.equal(P.captureSa(frames.slice(-5), 920), null);
  assert.equal(P.captureSa(frames, 1300), null);
  const vibrato = frames.map(f => ({ ...f, hz: 240 * 2 ** (70 * Math.sin(f.t / 50) / 1200) }));
  assert.equal(P.captureSa(vibrato, 920), null);
  const gap = frames.map((f, i) => i === 25 ? { ...f, hz: null } : f);
  near(P.captureSa(gap, 920), 240, 1, 'one brief dropout should not prevent Sa capture');
  const longGap = frames.map((f, i) => i >= 15 && i <= 30 ? { ...f, hz: null } : f);
  assert.equal(P.captureSa(longGap, 920), null);
});

test('slow neural inference only reinforces an uninterrupted matching pitch', () => {
  const stable = frame(240, 400, { stableSince: 0 });
  assert.equal(P.neuralIsUsable(stable, { hz: 241, confidence: 0.9, t: 200 }), true);
  assert.equal(P.neuralIsUsable(stable, { hz: 480, confidence: 0.9, t: 200 }), false);
  assert.equal(P.neuralIsUsable({ ...stable, stableSince: 300 }, { hz: 240, confidence: 0.9, t: 200 }), false);
  assert.equal(P.neuralIsUsable({ ...stable, t: 700 }, { hz: 240, confidence: 0.9, t: 200 }), false);
});

test('voice range rejects out-of-range notes instead of folding them by octaves', () => {
  for (const hz of [80, 100, 660, 880, 1600]) {
    assert.equal(P.analyze(tone(hz), { minHz: 150, maxHz: 500, gateDb: -55 }).hz, null, `out-of-range ${hz} Hz`);
  }
  near(P.analyze(tone(240), { minHz: 150, maxHz: 500 }).hz, 240);
});

test('quiet vocals pass the new default mic gate but silence stays rejected', () => {
  const quiet = Float32Array.from(tone(240), x => x * 0.007);
  assert.equal(P.analyze(quiet, { gateDb: -55 }).hz, null);
  near(P.analyze(quiet).hz, 240, 1);
  const tracker = new P.Tracker();
  tracker.push({ ...P.analyze(quiet), t: 0 });
  near(tracker.push({ ...P.analyze(quiet), t: 20 }).hz, 240, 1);
  assert.equal(tracker.push({ ...P.analyze(new Float32Array(1536)), t: 40 }).hz, null);
});

test('sensitivity accepts consistent breathy readings but rejects isolated weak pitches', () => {
  const breathy = (hz, t, sensitivity = 70) => frame(hz, t, { sensitivity, quality: 0.75, agreement: true });
  assert.equal(P.fuse(breathy(240, 0, 0), null).hz, null, 'strict mode rejects this periodicity');
  const tracker = new P.Tracker();
  assert.equal(tracker.push(breathy(240, 0)).hz, null);
  assert.equal(tracker.push(breathy(241, 20)).hz, null);
  tracker.push(breathy(240.5, 40));
  near(tracker.push(breathy(240, 60)).hz, 240, 1);
  near(tracker.push(breathy(241, 80)).hz, 241, 1);
  assert.equal(tracker.push(breathy(320, 100)).hz, null, 'one uncertain new note is not committed');
  assert.equal(tracker.push({ hz: null, quality: 0, t: 120 }).hz, null);
  const noisy = new P.Tracker();
  for (let i = 0; i < 15; i++) assert.equal(noisy.push(breathy(i % 2 ? 310 : 200, i * 20)).hz, null);
});

test('noisy sustained tones maintain coverage without octave folding', () => {
  let signalSeed = 79;
  function signalRandom() { signalSeed = (Math.imul(signalSeed, 1664525) + 1013904223) | 0; return (signalSeed >>> 0) / 4294967296; }
  const hz = 240, wave = new Float32Array(16000 * 2);
  for (let i = 0; i < wave.length; i++) wave[i] = 0.18 * Math.sin(2 * Math.PI * hz * i / 16000) + (signalRandom() * 2 - 1) * 0.10;
  const strict = new P.Tracker(), sensitive = new P.Tracker();
  let strictCount = 0, sensitiveCount = 0; const errors = [];
  for (let end = 1536, t = 0; end <= wave.length; end += 320, t += 20) {
    const analysis = { ...P.analyze(wave.subarray(end - 1536, end)), t };
    if (strict.push({ ...analysis, sensitivity: 0, continuous: false }).hz) strictCount++;
    const result = sensitive.push({ ...analysis, sensitivity: 70 });
    if (result.hz) { sensitiveCount++; errors.push(Math.abs(P.cents(result.hz, hz))); }
  }
  console.log('Noisy-tone frames captured: strict', strictCount, 'sensitive', sensitiveCount);
  assert.ok(sensitiveCount >= strictCount);
  assert.ok(sensitiveCount >= 90, 'continuous tone should not have repeated gaps');
  assert.ok(errors.every(error => error < 100), 'no octave or large pitch errors');
  errors.sort((a, b) => a - b);
  assert.ok(errors[Math.floor(errors.length * 0.9)] < 30, '90% of estimates within 30 cents');
});

test('sensitive mode still rejects pure noise at different levels', () => {
  for (const amplitude of [0.001, 0.005, 0.05, 0.2]) {
    const tracker = new P.Tracker();
    for (let i = 0; i < 40; i++) {
      const noise = Float32Array.from({ length: 1536 }, () => (random() * 2 - 1) * amplitude);
      const result = tracker.push({ ...P.analyze(noise, { sensitivity: 100 }), t: i * 20 });
      assert.equal(result.hz, null);
    }
  }
});

test('CREPE can recover rejected YIN on its exact supported audio frame', () => {
  const waveform = P.focusVoice(tone(240));
  const support = P.pitchSupport(waveform, 240);
  assert.ok(support > 0.98);
  const rejected = { hz: null, quality: 0, t: 200, rms: 0.02, gate: 0.0002, continuous: true, minHz: 65, maxHz: 1200 };
  const neural = { hz: 240, confidence: 0.9, t: 200, support };
  near(P.fuse(rejected, neural).hz, 240);
  assert.equal(P.fuse({ ...rejected, blocked: true }, neural).hz, null);
  assert.equal(P.fuse({ ...rejected, rms: 0 }, neural).hz, null);
  assert.equal(P.fuse({ ...rejected, continuous: false }, neural).hz, null);
  assert.equal(P.fuse(rejected, { ...neural, t: 180 }).hz, null, 'an earlier result cannot invent a current pitch');
  assert.equal(P.fuse(rejected, { ...neural, support: 0.1 }).hz, null);
  assert.equal(P.fuse(rejected, { ...neural, confidence: 0.3 }).hz, null);
  assert.equal(P.fuse(rejected, { ...neural, hz: 1800 }).hz, null);
});

test('continuous mode follows weaker current pitch when analysis windows disagree', () => {
  const tracker = new P.Tracker();
  tracker.push(frame(240, 0)); tracker.push(frame(240, 20));
  for (let i = 2; i < 60; i++) {
    const hz = 240 * 2 ** (30 * Math.sin(i / 6) / 1200);
    const result = tracker.push(frame(hz, i * 20, { quality: 0.63, agreement: false, continuous: true }));
    near(result.hz, hz);
    assert.equal(result.continuation, true);
  }
  assert.equal(tracker.push({ hz: null, quality: 0, rms: 0, t: 1200 }).hz, null, 'silence clears the output');
  assert.equal(tracker.push(frame(600, 1220, { quality: 0.63, agreement: false })).hz, null, 'unrelated weak pitch is not continued');
});

test('vowel focus keeps amplitude-varying breathy pitch measurable', () => {
  let signalSeed = 123;
  function rand() { signalSeed = (Math.imul(signalSeed, 1664525) + 1013904223) | 0; return (signalSeed >>> 0) / 4294967296; }
  const wave = new Float32Array(16000 * 3); let phase = 0;
  for (let i = 0; i < wave.length; i++) {
    const t = i / 16000, hz = 240 * 2 ** (25 * Math.sin(2 * Math.PI * 4 * t) / 1200);
    phase += 2 * Math.PI * hz / 16000;
    const amplitude = 0.12 + 0.035 * Math.sin(2 * Math.PI * 1.3 * t);
    wave[i] = amplitude * (Math.sin(phase) + 0.35 * Math.sin(2 * phase)) + (rand() * 2 - 1) * 0.13;
  }
  const tracker = new P.Tracker(); let captured = 0, total = 0, longestGap = 0, gap = 0;
  const errors = [];
  for (let end = 1536, t = 0; end <= wave.length; end += 320, t += 20) {
    const data = { ...P.analyze(wave.subarray(end - 1536, end)), t };
    const result = tracker.push(data); total++;
    if (result.hz) {
      captured++; gap = 0;
      const expected = 240 * 2 ** (25 * Math.sin(2 * Math.PI * 4 * ((end / 16000) - 0.03)) / 1200);
      errors.push(Math.abs(P.cents(result.hz, expected)));
    } else { gap++; longestGap = Math.max(longestGap, gap); }
  }
  console.log('Amplitude-varying vocal frames:', captured, '/', total, 'longest gap ms:', longestGap * 20);
  assert.ok(captured / total > 0.9);
  assert.ok(longestGap <= 5, 'no prolonged dropouts during a continuous vowel');
  assert.ok(errors.every(error => error < 100));
});
