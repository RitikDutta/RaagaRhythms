'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const P = new Function(fs.readFileSync(path.join(root, 'vocal-accuracy/pitch-core.js'), 'utf8') + '\nreturn VocalPitch;')();
const workerSource = fs.readFileSync(path.join(root, 'vocal-accuracy/analysis-worker.js'), 'utf8');

function worker() {
  let output;
  const self = { postMessage(data) { output = data; } };
  const context = vm.createContext({ self, importScripts() {}, VocalPitch: P });
  vm.runInContext(workerSource, context);
  return data => { output = null; self.onmessage({ data }); return output; };
}
function tone(hz, amplitude = 0.1, count = 1680) {
  return Float32Array.from({ length: count }, (_, i) => amplitude * (Math.sin(2 * Math.PI * hz * i / 16000)
    + 0.35 * Math.sin(4 * Math.PI * hz * i / 16000) + 0.2 * Math.sin(6 * Math.PI * hz * i / 16000)));
}
function sustained(rate, breathy) {
  let seed = 73;
  const wave = new Float32Array(rate * 10);
  for (let i = 0; i < wave.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const random = (seed >>> 0) / 4294967296 - 0.5;
    const t = i / rate, tail = t >= 2;
    const amplitude = !tail ? 0.18 : breathy ? 0.04 : 0.0002;
    const noise = tail ? breathy ? 0.18 * Math.sqrt(rate / 16000) : 0.00001 : 0;
    wave[i] = amplitude * (Math.sin(2 * Math.PI * 240 * t) + 0.35 * Math.sin(4 * Math.PI * 240 * t)
      + 0.2 * Math.sin(6 * Math.PI * 240 * t)) + noise * random;
  }
  return wave;
}

for (const rate of [16000, 48000]) for (const breathy of [false, true]) {
  test(`ten-second Sa at ${rate} Hz survives a ${breathy ? 'breathier' : 'quieter'} tail after two seconds`, () => {
    const send = worker(), tracker = new P.Tracker(), wave = sustained(rate, breathy);
    const count = Math.ceil(rate * 0.105), hop = Math.round(rate * 0.02);
    let tailFrames = 0, captured = 0, gap = 0, longestGap = 0;
    const errors = [];
    for (let end = count; end <= wave.length; end += hop) {
      const t = end / rate * 1000;
      const analysis = send({ frame: wave.subarray(end - count, end), rate, t, options: { gateDb: -72 } });
      const result = tracker.push(analysis);
      if (t >= 2300) {
        tailFrames++;
        if (result.hz) { captured++; gap = 0; errors.push(Math.abs(P.cents(result.hz, 240))); }
        else { gap++; longestGap = Math.max(longestGap, gap); }
      }
    }
    console.log(`${rate} Hz ${breathy ? 'breathy' : 'quiet'} tail: ${captured}/${tailFrames}; longest gap ${longestGap * 20} ms`);
    assert.ok(captured / tailFrames >= 0.9, 'sustained note must not disappear after its onset');
    assert.ok(longestGap <= 5, 'no prolonged dropout during the sustained note');
    assert.ok(errors.every(error => error < 80), 'no octave errors or unrelated pitches');
  });
}

test('continuation clears for silence, clipping, a real out-of-range note and unpitched noise', () => {
  for (const kind of ['silence', 'clipping', 'out-of-range', 'noise']) {
    const send = worker(), tracker = new P.Tracker();
    for (let i = 0; i < 50; i++) tracker.push(send({ frame: tone(240), rate: 16000, t: i * 20 }));
    let seed = 59;
    for (let i = 0; i < 40; i++) {
      const frame = kind === 'silence' ? new Float32Array(1680) : kind === 'clipping' ? tone(240, 5)
        : kind === 'out-of-range' ? tone(1800) : Float32Array.from({ length: 1680 }, () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 0) / 4294967296 - 0.5) * 0.18;
        });
      const analysis = send({ frame, rate: 16000, t: 1000 + i * 20 });
      assert.ok(!analysis.continuation, `no held continuation for ${kind}`);
      assert.equal(tracker.push(analysis).hz, null, `old Sa must clear for ${kind}`);
    }
  }
});

test('a clear new note takes precedence over the previous sustained note', () => {
  const send = worker();
  for (let i = 0; i < 50; i++) send({ frame: tone(240), rate: 16000, t: i * 20 });
  const result = send({ frame: tone(269.391), rate: 16000, t: 1000 });
  assert.ok(Math.abs(P.cents(result.hz, 269.391)) < 6);
  assert.ok(!result.continuation);
});

test('reset or an expired capture gap cannot use the previous note as evidence', () => {
  const send = worker();
  send({ frame: tone(240), rate: 16000, t: 0 });
  send({ type: 'reset' });
  const result = send({ frame: tone(240, 0.0002), rate: 16000, t: 20 });
  assert.equal(result.hz, null, 'reset restores the acquisition cutoff');
  send({ frame: tone(240), rate: 16000, t: 40 });
  const late = send({ frame: tone(240, 0.0002), rate: 16000, t: 400 });
  assert.equal(late.hz, null, 'an old voiced frame cannot lower the current gate indefinitely');
});
