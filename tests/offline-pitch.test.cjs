'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const P = new Function(fs.readFileSync(path.join(root, 'vocal-accuracy/pitch-core.js'), 'utf8') + ';return VocalPitch;')();
const O = new Function('VocalPitch', fs.readFileSync(path.join(root, 'vocal-accuracy/offline-core.js'), 'utf8') + ';return VocalOffline;')(P);
const candidate = (hz, strength = 0.95) => ({ hz, quality: strength, strength, source: 'Centered YIN' });

function phrase(notes, noteMs) {
  const wave = new Float32Array(Math.round(16000 * notes.length * noteMs / 1000));
  let phase = 0;
  for (let i = 0; i < wave.length; i++) {
    const hz = notes[Math.min(notes.length - 1, Math.floor(i / 16000 * 1000 / noteMs))];
    phase += 2 * Math.PI * hz / 16000;
    wave[i] = hz ? 0.15 * Math.sin(phase) + 0.06 * Math.sin(2 * phase) + 0.03 * Math.sin(3 * phase) : 0;
  }
  return wave;
}

test('offline candidate decoding removes an isolated octave error using measured alternatives', () => {
  const frames = Array.from({ length: 15 }, (_, i) => ({ t: i * 20, candidates: [candidate(240)] }));
  frames[7].candidates = [candidate(480, 0.99), candidate(240, 0.8)];
  assert.ok(O.decode(frames).every(frame => frame.hz === 240));
});

test('offline decoding retains fast real note changes and never fills silence with a held pitch', () => {
  const pitches = [240, 302.381, 480, 240, null, 269.391];
  const frames = pitches.flatMap((hz, note) => Array.from({ length: 4 }, (_, i) => ({
    t: note * 80 + i * 20, candidates: hz ? [candidate(hz)] : [], blocked: !hz
  })));
  const result = O.decode(frames);
  result.forEach((frame, i) => assert.equal(frame.hz, pitches[Math.floor(i / 4)]));
});

test('centered file analysis timestamps 80 ms notes against the original audio clock', async () => {
  const notes = [240, 269.391, 302.381, 320.361, 359.594, 403.631, 453.06, 480, 240, 480];
  const progress = [];
  const result = await O.analyze(phrase(notes, 80), {}, null, value => progress.push(value));
  assert.equal(result.frames.length, 40);
  assert.equal(result.hopMs, 20);
  assert.equal(result.neural, false);
  assert.equal(result.duration, 0.8);
  for (let note = 1; note < notes.length - 1; note++) {
    const frame = result.frames[note * 4 + 2];
    assert.ok(frame.hz && Math.abs(P.cents(frame.hz, notes[note])) < 20,
      `note ${note} at ${frame.t} ms: ${frame.hz} vs ${notes[note]}`);
  }
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, i) => !i || value >= progress[i - 1]));
});

test('file analysis rejects silence, clipping, noise and pitches outside the chosen range', async () => {
  const clipped = new Float32Array(16000).fill(1);
  for (let i = 0; i < clipped.length; i++) if (i % 2) clipped[i] = -1;
  let seed = 19;
  const noise = Float32Array.from({ length: 16000 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 0) / 4294967296 - 0.5) * 0.2;
  });
  for (const samples of [new Float32Array(16000), clipped, noise, phrase([1600], 1000)]) {
    const result = await O.analyze(samples, { minHz: 100, maxHz: 600 });
    assert.ok(result.frames.every(frame => !frame.hz));
  }
});

test('file neural candidates require support from their own centered waveform', () => {
  const samples = phrase([240], 400);
  const supported = O.observations(samples, 3200, {}, { hz: 240, confidence: 0.95 });
  assert.ok(supported.candidates.some(candidate => candidate.source.startsWith('CREPE')));
  const unsupported = O.observations(samples, 3200, {}, { hz: 367, confidence: 0.99 });
  assert.ok(!unsupported.candidates.some(candidate => candidate.source.startsWith('CREPE')));
  assert.equal(O.observations(new Float32Array(6400), 3200, {}, { hz: 240, confidence: 0.99 }).candidates.length, 0);
});

test('empty file analysis fails clearly', async () => {
  await assert.rejects(O.analyze(new Float32Array()), /No decoded audio/);
});
