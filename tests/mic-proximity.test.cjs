'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../mic-proximity/core.js');
const root = path.join(__dirname, '..');

function signal(amplitude = 0.05, harmonics = [1, 0.25, 0.12, 0.05]) {
  const rate = 48000, size = 4096, hz = 240;
  const waveform = Float32Array.from({ length: size }, (_, i) => harmonics.reduce((sum, value, k) =>
    sum + amplitude * value * Math.sin(2 * Math.PI * hz * (k + 1) * i / rate), 0));
  const spectrum = new Float32Array(size / 2).fill(-115);
  for (let k = 0; k < harmonics.length; k++) {
    const bin = Math.round(hz * (k + 1) * size / rate);
    for (const [offset, scale] of [[-1, 0.2], [0, 0.6], [1, 0.2]]) {
      spectrum[bin + offset] = 10 * Math.log10(Math.max(1e-16, (amplitude * harmonics[k]) ** 2 * scale));
    }
  }
  return { waveform, spectrum, rate };
}
const extract = value => P.extract(value.waveform, value.spectrum, value.rate);
const samples = frame => Array.from({ length: 20 }, () => frame);

test('features measure a hum; silence, DC, clipping and broadband noise do not indicate distance', () => {
  const input = signal(), frame = extract(input);
  assert.equal(frame.valid, true);
  assert.ok(frame.bass > 0.9);
  assert.ok(frame.centroid > 240 && frame.centroid < 350);
  assert.equal(extract({ ...input, waveform: new Float32Array(4096) }).reason, 'quiet');
  assert.equal(extract({ ...input, waveform: new Float32Array(4096).fill(0.2) }).reason, 'quiet');
  assert.equal(extract({ ...input, waveform: Float32Array.from({ length: 4096 }, (_, i) => i % 2 ? 1 : -1) }).reason, 'clipped');
  assert.equal(extract({ ...input, spectrum: new Float32Array(2048).fill(-45) }).reason, 'noisy');
});

test('two acoustic profiles classify their endpoints and leave intermediate or unfamiliar sounds uncertain', () => {
  const away = extract(signal()), near = extract(signal(0.16, [1, 0.6, 0.3, 0.15]));
  const model = P.fit(P.profile(samples(away)), P.profile(samples(near)));
  assert.equal(P.classify(away, model).kind, 'away');
  assert.equal(P.classify(near, model).kind, 'near');
  const middle = { ...away, vector: away.vector.map((x, i) => (x + near.vector[i]) / 2) };
  assert.equal(P.classify(middle, model).kind, 'between');
  const stranger = { ...away, vector: away.vector.map((x, i) => i === 1 ? x + 35 : x) };
  assert.equal(P.classify(stranger, model).kind, 'unknown');
  assert.equal(P.classify({ valid: false, reason: 'quiet' }, model).score, null);
  assert.equal(P.classify(away, null).kind, 'uncalibrated');
});

test('hand mode learns spectral changes and rejects loudness-only samples that do not separate well', () => {
  const away = extract(signal(0.05, [1, 0.2, 0.1, 0.05]));
  const near = extract(signal(0.05, [0.15, 1, 0.7, 0.3]));
  const model = P.fit(P.profile(samples(away)), P.profile(samples(near)), 'hand');
  assert.equal(P.classify(near, model).kind, 'near');
  const louder = extract(signal(0.15, [1, 0.2, 0.1, 0.05]));
  assert.throws(() => P.fit(P.profile(samples(away)), P.profile(samples(louder)), 'hand'), /too similar/);
});

test('calibration requires enough clear samples and a meaningful separation', () => {
  const frame = extract(signal());
  assert.throws(() => P.profile(samples(frame).slice(0, 5)), /humming steadily/);
  assert.throws(() => P.profile(samples({ valid: false })), /humming steadily/);
  assert.throws(() => P.fit(P.profile(samples(frame)), P.profile(samples(frame))), /too similar/);
});

test('endpoint labels need a stable observation and silence immediately clears the estimate', () => {
  const tracker = new P.Tracker();
  const near = { kind: 'near', score: 1, clarity: 1 };
  assert.equal(tracker.update(near, 0).kind, 'between');
  assert.equal(tracker.update(near, 100).kind, 'between');
  assert.equal(tracker.update(near, 200).kind, 'near');
  assert.equal(tracker.update({ kind: 'quiet', score: null, clarity: 0 }, 300).kind, 'quiet');
  assert.equal(tracker.score, null);
});

function harness(permission) {
  let now = 0, nextId = 0, input = signal(), reads = 0;
  const timers = new Map(), elements = new Map(), contexts = [], tracks = [], visibility = [];
  const ctx = new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
  const element = () => ({ value: '', textContent: '', dataset: {}, style: {}, listeners: {}, hidden: false,
    clientWidth: 800, clientHeight: 145, addEventListener(type, callback) { this.listeners[type] = callback; },
    replaceChildren() {}, getContext: () => ctx });
  const html = fs.readFileSync(path.join(root, 'testing-mic-proximity.html'), 'utf8');
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], element());
  elements.get('mode').value = 'voice';
  const document = { hidden: false, getElementById: id => elements.get(id),
    addEventListener(type, callback) { if (type === 'visibilitychange') visibility.push(callback); } };
  const node = () => ({ connect() {}, disconnect() {}, gain: {} });
  class AudioContext {
    constructor() { this.sampleRate = 48000; this.state = 'suspended'; contexts.push(this); }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    createGain() { return node(); }
    createMediaStreamSource() { return node(); }
    createAnalyser() { return { ...node(), frequencyBinCount: 2048,
      getFloatTimeDomainData(array) { reads++; array.set(input.waveform); },
      getFloatFrequencyData(array) { array.set(input.spectrum); } }; }
  }
  const makeStream = () => {
    const track = { getSettings: () => ({ deviceId: 'test-mic' }), addEventListener() {}, stop() { this.stopped = true; } };
    tracks.push(track); return { getAudioTracks: () => [track], getTracks: () => [track] };
  };
  const context = vm.createContext({
    MicProximity: P, document, console, performance: { now: () => now },
    Option: class {}, window: { isSecureContext: true, AudioContext, devicePixelRatio: 1, addEventListener() {} },
    navigator: { mediaDevices: { getUserMedia: permission ? () => permission(makeStream) : async () => makeStream() } },
    setTimeout(callback, delay = 0) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'mic-proximity/app.js'), 'utf8'), context);
  return { elements, contexts, tracks, timers, reads: () => reads,
    click: id => elements.get(id).listeners.click(),
    input(value) { input = value; },
    visible(value) { document.hidden = !value; visibility.forEach(fn => fn()); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let first;
        for (const item of timers) if (item[1].at <= end && (!first || item[1].at < first[1].at)) first = item;
        if (!first) break;
        timers.delete(first[0]); now = first[1].at; first[1].callback();
      }
      now = end;
    }
  };
}

test('page captures both positions, follows acoustic changes, and reports no estimate in silence', async () => {
  const h = harness();
  assert.equal(h.elements.get('capture-away').disabled, true);
  await h.click('start');
  h.click('capture-away'); h.advance(2100);
  assert.equal(h.elements.get('away-badge').textContent, 'Captured ✓');
  h.input(signal(0.16, [1, 0.6, 0.3, 0.15]));
  h.click('capture-near'); h.advance(2500);
  assert.equal(h.elements.get('status').textContent, 'Listening · calibrated');
  assert.equal(h.elements.get('state').textContent, 'Near.');
  h.input(signal()); h.advance(800);
  assert.equal(h.elements.get('state').textContent, 'Away.');
  h.input({ ...signal(), waveform: new Float32Array(4096) }); h.advance(100);
  assert.equal(h.elements.get('state').textContent, 'Keep humming.');
  assert.equal(h.elements.get('position-marker').hidden, true);
  h.click('stop');
  assert.equal(h.tracks[0].stopped, true);
  assert.equal(h.timers.size, 0);
});

test('hidden tabs suspend all frame reads; a mode change invalidates calibration', async () => {
  const h = harness(); await h.click('start'); h.advance(200);
  h.click('capture-away'); h.advance(2100);
  h.visible(false);
  const reads = h.reads(); h.advance(2000);
  assert.equal(h.reads(), reads);
  assert.equal(h.contexts[0].state, 'suspended');
  h.visible(true); await Promise.resolve(); h.advance(100);
  assert.ok(h.reads() > reads);
  h.elements.get('mode').value = 'hand'; h.elements.get('mode').listeners.change();
  assert.equal(h.elements.get('away-badge').textContent, 'Not captured');
  assert.equal(h.elements.get('near-title').textContent, 'Hand beside the mic');
  h.click('stop');
});

test('stop during a permission request releases a stream that arrives afterwards', async () => {
  let grant, announce;
  const requested = new Promise(resolve => { announce = resolve; });
  const h = harness(makeStream => new Promise(resolve => { grant = () => resolve(makeStream()); announce(); }));
  const start = h.click('start'); await requested;
  h.click('stop'); grant(); await start;
  assert.equal(h.tracks[0].stopped, true);
  assert.equal(h.elements.get('start').disabled, false);
  assert.equal(h.timers.size, 0);
});
