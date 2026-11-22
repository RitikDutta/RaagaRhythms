'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const P = new Function(fs.readFileSync(path.join(root, 'vocal-accuracy/pitch-core.js'), 'utf8') + ';return VocalPitch;')();
const workerSource = fs.readFileSync(path.join(root, 'vocal-accuracy/analysis-worker.js'), 'utf8');

for (const noteMs of [60, 80, 100]) test(`live capture follows ${noteMs} ms notes, including octave leaps`, () => {
  const steps = [0, 2, 4, 5, 7, 9, 11, 12, 7, 4, 2, 0, 12, 0, 7, 0, 4, 9, 2, 11];
  const notes = steps.map(step => 240 * 2 ** (step / 12));
  const wave = new Float32Array(16000 * steps.length * noteMs / 1000);
  let phase = 0, seed = 17;
  for (let i = 0; i < wave.length; i++) {
    const t = i / 16000 * 1000, index = Math.floor(t / noteMs), position = t % noteMs;
    const hz = notes[index] * 2 ** (12 * Math.sin(t * 0.03) / 1200);
    phase += 2 * Math.PI * hz / 16000;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const envelope = Math.min(1, position / 3, (noteMs - position) / 3);
    wave[i] = envelope * (0.15 * Math.sin(phase) + 0.07 * Math.sin(2 * phase) + 0.04 * Math.sin(3 * phase))
      + 0.008 * ((seed >>> 0) / 4294967296 - 0.5);
  }
  let output;
  const self = { postMessage(data) { output = data; } };
  new Function('self', 'importScripts', 'VocalPitch', workerSource)(self, () => {}, P);
  const tracker = new P.Tracker(), firstDetection = new Map();
  for (let end = 1680; end < wave.length; end += 320) {
    const t = end / 16000 * 1000, index = Math.floor(t / noteMs);
    self.onmessage({ data: { frame: wave.subarray(end - 1680, end), rate: 16000, t } });
    const result = tracker.push(output);
    if (index >= 2 && result.hz && Math.abs(P.cents(result.hz, notes[index])) < 50 && !firstDetection.has(index)) {
      firstDetection.set(index, t - index * noteMs);
    }
  }
  assert.ok(firstDetection.size >= (noteMs === 60 ? 16 : 18), `captured ${firstDetection.size}/18 fast notes`);
  assert.ok([...firstDetection.values()].every(delay => delay <= (noteMs === 60 ? 45 : 65)));
});
