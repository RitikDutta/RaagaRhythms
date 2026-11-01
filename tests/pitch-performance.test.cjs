'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const coreSource = read('vocal-accuracy/pitch-core.js');
const schedulingSource = read('vocal-accuracy/scheduling.js');

function fakeClock() {
  let now = 0, nextId = 0;
  const timers = new Map();
  const set = (callback, delay = 0, interval = 0) => {
    const id = ++nextId; timers.set(id, { callback, at: now + delay, interval }); return id;
  };
  return {
    now: () => now,
    timers,
    globals: {
      performance: { now: () => now },
      setTimeout: (callback, delay) => set(callback, delay),
      clearTimeout: id => timers.delete(id),
      setInterval: (callback, delay) => set(callback, delay, delay),
      clearInterval: id => timers.delete(id)
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let chosen;
        for (const [id, timer] of timers) if (timer.at <= end && (!chosen || timer.at < chosen[1].at)) chosen = [id, timer];
        if (!chosen) break;
        const [id, timer] = chosen; now = timer.at;
        if (timer.interval) timer.at += timer.interval; else timers.delete(id);
        timer.callback();
      }
      now = end;
    }
  };
}

test('steady-state resampling reuses filter coefficients but reads every new waveform', () => {
  let trigCalls = 0;
  const math = Object.create(Math);
  for (const key of ['sin', 'cos']) math[key] = x => { trigCalls++; return Math[key](x); };
  const P = vm.runInNewContext(coreSource + '\nVocalPitch;', { Math: math });
  const wave = Float32Array.from({ length: 5040 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 240 * i / 48000));
  const first = P.resample(wave, 48000);
  const callsAfterWarmup = trigCalls;
  assert.ok(callsAfterWarmup > 10000);
  for (let i = 0; i < 50; i++) P.resample(wave, 48000);
  assert.equal(trigCalls, callsAfterWarmup, 'no repeated sin/cos work in overlapping frames');
  const quieter = P.resample(Float32Array.from(wave, x => x * 0.1), 48000);
  assert.ok(quieter.every((x, i) => Math.abs(x - first[i] * 0.1) < 1e-8), 'cached filters do not cache old audio');
});

test('neural checks have one request in flight, a four-per-second cap, and a 20% duty budget', () => {
  const { NeuralBudget } = vm.runInNewContext(schedulingSource + '\nPitchScheduling;');
  const fast = new NeuralBudget();
  const starts = [];
  for (let t = 0; t < 1000; t += 20) if (fast.start(t)) {
    starts.push(t);
    assert.equal(fast.start(t), false, 'no overlapping inference');
    fast.finish(t + 5, 5);
  }
  assert.equal(starts.length, 4);
  const slow = new NeuralBudget();
  assert.equal(slow.start(0), true);
  slow.finish(200, 200);
  assert.equal(slow.available(999), false);
  assert.equal(slow.available(1000), true, '200 ms inference gets 800 ms rest');
});

test('UI updates coalesce to 20 fps and stop when hidden or cancelled', () => {
  const clock = fakeClock(), document = { hidden: false };
  let paints = 0;
  const context = vm.createContext({ ...clock.globals, document, paint: () => paints++ });
  vm.runInContext(schedulingSource + '\nvar painter = PitchScheduling.createPainter(paint);', context);
  for (let i = 0; i < 100; i++) { vm.runInContext('painter.request()', context); clock.advance(10); }
  assert.ok(paints <= 21, `paint count: ${paints}`);
  document.hidden = true;
  const before = paints;
  vm.runInContext('painter.request()', context); clock.advance(500);
  assert.equal(paints, before);
  document.hidden = false;
  vm.runInContext('painter.request(); painter.cancel()', context); clock.advance(500);
  assert.equal(paints, before);
});

test('analysis worker skips expensive work for silence and only transfers audio for a scheduled neural check', () => {
  let output, resamples = 0;
  const P = new Function(coreSource + '\nreturn VocalPitch;')();
  const context = vm.createContext({
    importScripts() {}, self: { postMessage: message => { output = message; } },
    VocalPitch: { ...P, resample(...args) { resamples++; return P.resample(...args); } }
  });
  vm.runInContext(read('vocal-accuracy/analysis-worker.js'), context);
  const send = data => context.self.onmessage({ data });
  for (let i = 0; i < 50; i++) send({ frame: new Float32Array(5040), rate: 48000, t: i * 20 });
  assert.equal(resamples, 0);
  assert.equal(output.blocked, true);
  const frame = Float32Array.from({ length: 5040 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 240 * i / 48000));
  send({ frame, rate: 48000, t: 1000 });
  assert.ok(Math.abs(output.hz - 240) < 1);
  assert.equal(output.waveform, undefined);
  assert.equal(output.neuralFrame, undefined);
  send({ frame, rate: 48000, t: 1020, needNeural: true });
  assert.equal(output.waveform.length, 1536);
  assert.equal(output.neuralFrame.length, 1024);
});

function pageHarness(file) {
  const clock = fakeClock(), elements = new Map(), visibilityListeners = [];
  let draws = 0;
  const ctx = new Proxy({ clearRect() { draws++; } }, { get: (target, key) => target[key] || (() => {}) });
  const element = (value = '') => ({
    value, textContent: '', style: {}, children: [], listeners: {}, clientWidth: 900, clientHeight: 220,
    addEventListener(event, fn) { this.listeners[event] = fn; },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    querySelectorAll() { return []; }, checkValidity() { return true; },
    getContext() { return ctx; }, getBoundingClientRect() { return { width: 900, height: 220 }; }
  });
  const html = read(file);
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) elements.set(match[1], element(match[0].match(/\bvalue="([^"]*)"/)?.[1] || ''));
  const document = {
    hidden: false, getElementById: id => elements.get(id), createElement: () => element(),
    addEventListener(event, fn) { if (event === 'visibilitychange') visibilityListeners.push(fn); }
  };
  const workers = [], nodes = [], streams = [], contexts = [];
  class Worker {
    constructor(url) { this.url = String(url); this.messages = []; workers.push(this); }
    postMessage(data) { this.messages.push(data); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data }); }
  }
  class AudioContext {
    constructor() { this.sampleRate = 48000; this.state = 'suspended'; this.audioWorklet = { async addModule() {} }; contexts.push(this); }
    get currentTime() { return clock.now() / 1000; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { connect() {}, disconnect() {}, getFloatTimeDomainData(array) { array.fill(0); } }; }
  }
  class AudioWorkletNode {
    constructor() { this.port = { messages: [], postMessage(data) { this.messages.push(data); }, close() {} }; nodes.push(this); }
    connect() {} disconnect() {}
  }
  const context = vm.createContext({
    ...clock.globals, document, Worker, AudioWorkletNode, URL, console,
    window: { AudioContext, isSecureContext: true, devicePixelRatio: 1, addEventListener() {} },
    location: { href: 'http://localhost:8000/' + file },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { mediaDevices: { async getUserMedia() {
      const track = { stop() { this.stopped = true; }, addEventListener() {} };
      const stream = { getTracks: () => [track] }; streams.push(stream); return stream;
    } } }
  });
  vm.runInContext(schedulingSource, context);
  if (file.includes('vocal-accuracy')) vm.runInContext(coreSource, context);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(match => match[1].trim());
  vm.runInContext(scripts.at(-1)[1], context, { filename: file });
  return { clock, elements, workers, nodes, streams, contexts, draws: () => draws,
    click: id => elements.get(id).listeners.click(),
    visible(value) { document.hidden = !value; for (const fn of visibilityListeners) fn(); }
  };
}

test('original experiment never queues overlapping YIN frames and releases workers on stop/restart', async () => {
  const h = pageHarness('testing-new-method.html');
  await h.click('startBtn');
  assert.equal(h.workers.length, 2);
  const analysis = h.workers.find(w => w.url.endsWith('analysis-worker.js'));
  assert.equal(analysis.messages.length, 1);
  h.clock.advance(400);
  assert.equal(analysis.messages.length, 1, 'a busy worker cannot accumulate audio messages');
  analysis.reply({ t: 0, hz: 240, rms: 0.02, quality: 0.99 });
  h.visible(false); h.clock.advance(400);
  assert.equal(analysis.messages.length, 1, 'hidden page schedules no analysis');
  assert.equal(h.contexts[0].state, 'suspended');
  h.visible(true); h.clock.advance(40);
  assert.equal(analysis.messages.length, 2);
  analysis.reply({ t: h.clock.now(), hz: 240, rms: 0.02, quality: 0.99 });
  h.clock.advance(0);
  assert.equal(h.elements.get('hz').textContent, '240.00 Hz');
  assert.equal(h.elements.get('swara').textContent, 'Sa');
  h.click('stopBtn');
  assert.ok(h.workers.every(w => w.terminated));
  assert.equal(h.streams[0].getTracks()[0].stopped, true);
  assert.equal(h.clock.timers.size, 0);
  await h.click('startBtn');
  assert.equal(h.workers.length, 4);
  const previousReadout = h.elements.get('hz').textContent;
  analysis.reply({ t: h.clock.now(), hz: 440, rms: 0.02, quality: 0.99 });
  assert.equal(h.elements.get('hz').textContent, previousReadout, 'previous session cannot update the readout');
  h.click('stopBtn');
});

test('accuracy experiment displays ordinary YIN frames without waiting for CREPE and pauses hidden capture', async () => {
  const h = pageHarness('testing-vocal-accuracy.html');
  await h.click('startBtn');
  const analysis = h.workers.find(w => w.url.endsWith('analysis-worker.js'));
  const neural = h.workers.find(w => w.url.endsWith('neural-worker.js'));
  neural.reply({ type: 'ready', backend: 'cpu' });
  const initialDraws = h.draws();
  for (let i = 0; i < 50; i++) {
    analysis.reply({ t: h.clock.now(), hz: 240, rms: 0.02, quality: 0.99, gate: 0.0002, agreement: true, candidates: [] });
    h.clock.advance(20);
    if (i === 3) assert.equal(h.elements.get('hz').textContent, '240.00 Hz', 'no 200 ms delay on ordinary frames');
  }
  assert.ok(h.draws() - initialDraws <= 21, 'rendering is capped independently of capture');
  h.visible(false);
  h.nodes[0].port.onmessage({ data: { frame: new Float32Array(5040), rate: 48000, t: h.clock.now() } });
  assert.equal(analysis.messages.length, 0, 'hidden worklet frames are not forwarded for analysis');
  assert.equal(h.contexts[0].state, 'suspended');
  h.visible(true);
  h.click('stopBtn');
  assert.ok(h.workers.every(w => w.terminated));
  assert.equal(h.clock.timers.size, 0);
});
