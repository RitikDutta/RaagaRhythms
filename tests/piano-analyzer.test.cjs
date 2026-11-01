'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'piano.html'), 'utf8');
const runtimePath = html.match(/<script src="(crepe\/tfjs-[^"]+)"/)[1];
const tf = require(path.join(root, runtimePath));
const pianoSource = fs.readFileSync(path.join(root, 'piano.js'), 'utf8');
const analyzerSource = pianoSource.slice(pianoSource.indexOf('// --- Voice Pitch Analyzer (CREPE) ---'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'crepe/model/model.json'), 'utf8'));
const weightSpecs = [], parts = [];
for (const group of manifest.weightsManifest) {
    weightSpecs.push(...group.weights);
    for (const file of group.paths) parts.push(fs.readFileSync(path.join(root, 'crepe/model', file)));
}
const bytes = Buffer.concat(parts);
const artifacts = {
    modelTopology: manifest.modelTopology,
    weightSpecs,
    weightData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
};

function harness(runtime = tf, navigator = {}, AudioContext = class {}) {
    const elements = new Map();
    for (const id of ['pitchStartBtn', 'pitchTabBtn', 'pitchStopBtn', 'pitchStatus',
        'pitch-note', 'pitch-hz', 'pitch-cents', 'voicing-confidence', 'confidence-fill']) {
        elements.set(id, { textContent: '', style: {}, addEventListener() {} });
    }
    const context = vm.createContext({
        tf: runtime,
        window: { tf: runtime, isSecureContext: true },
        document: { getElementById: id => elements.get(id) || null, querySelectorAll: () => [] },
        navigator, AudioContext, Float32Array,
        console: { warn() {}, error() {} },
        NOTE_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
        globalPitchShiftSemitones: 0,
        getSargamNotation: note => ({ indian: note }),
        pianoKeyElementsByNote: new Map(),
        analyzerHighlightedKeyElement: null,
        analyzerHighlightedNote: null
    });
    vm.runInContext(analyzerSource, context);
    return { context, elements, run: source => vm.runInContext(source, context) };
}

function tone(hz, sampleRate = 16000, amplitude = 0.2) {
    const size = 2 ** Math.ceil(Math.log2(sampleRate / 16000 * 1024));
    return Float32Array.from({ length: size }, (_, i) => amplitude * (
        Math.sin(2 * Math.PI * hz * i / sampleRate) + 0.4 * Math.sin(4 * Math.PI * hz * i / sampleRate)));
}

function mediaStream() {
    const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {}, removeEventListener() {} };
    return { track, getAudioTracks: () => [track], getTracks: () => [track] };
}

function audioContext() {
    return class {
        constructor() { this.state = 'suspended'; this.sampleRate = 48000; this.currentTime = 0; }
        async resume() { this.state = 'running'; }
        async close() { this.state = 'closed'; }
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        createScriptProcessor() { return { connect() {}, disconnect() {} }; }
        createGain() { return { gain: { setValueAtTime() {} }, connect() {}, disconnect() {} }; }
    };
}

test('actual piano model tracks distinct, quiet and normal tones through microphone resampling', async () => {
    const model = await tf.loadLayersModel(tf.io.fromMemory(artifacts));
    const h = harness();
    h.context.model = model;
    try {
        h.run('validateCrepeModel(model); crepeModel = model; crepeRunning = true;');
        const tensorsBefore = tf.memory().numTensors;
        const errors = [];
        for (const sampleRate of [44100, 48000, 96000]) {
            for (const hz of [110, 240, 440, 660]) {
                for (const amplitude of [0.002, 0.2]) {
                    const samples = tone(hz, sampleRate, amplitude);
                    h.context.event = { inputBuffer: { sampleRate, getChannelData: () => samples } };
                    h.run('processAudioBuffer(event)');
                    const detected = parseFloat(h.elements.get('pitch-hz').textContent);
                    const error = Math.abs(1200 * Math.log2(detected / hz));
                    assert.ok(error < 15, `${hz} Hz at ${sampleRate}: ${detected} Hz`);
                    errors.push(error);
                }
            }
        }
        assert.equal(tf.memory().numTensors, tensorsBefore, 'prediction tensors are disposed');
        console.log('Piano maximum harmonic-tone error:', Math.max(...errors).toFixed(3), 'cents');
    } finally { model.dispose(); }
});

test('silent, DC-only and invalid input never reach the neural model', () => {
    const h = harness();
    h.context.model = { predict() { assert.fail('silence must not run inference'); } };
    for (const samples of [new Float32Array(1024), new Float32Array(1024).fill(0.2), new Float32Array(1024).fill(NaN)]) {
        h.context.samples = samples;
        const result = h.run('predictCrepeFrame(model, samples)');
        assert.ok(Number.isNaN(result.hz));
        assert.equal(result.confidence, 0);
        assert.ok(result.activation.every(value => value === 0));
    }
});

test('an incorrect graphics backend is disposed and retried on CPU once', async () => {
    let backend = 'webgl', loads = 0, disposals = 0, checks = 0;
    const runtime = {
        async ready() {}, getBackend: () => backend,
        async setBackend(value) { backend = value; },
        async loadLayersModel() { loads++; return { dispose() { disposals++; } }; }
    };
    const h = harness(runtime);
    h.context.check = () => { checks++; if (backend === 'webgl') throw new Error('incorrect pitch'); };
    h.run('validateCrepeModel = check');
    const [first, second] = await Promise.all([h.run('loadCrepeModel()'), h.run('loadCrepeModel()')]);
    assert.equal(first, second, 'concurrent starts share a model');
    assert.equal(await h.run('loadCrepeModel()'), first);
    assert.equal(backend, 'cpu');
    assert.equal(loads, 2);
    assert.equal(checks, 2);
    assert.equal(disposals, 1);
});

test('failed startup releases the model and permits a subsequent retry', async () => {
    let disposals = 0;
    const runtime = {
        async ready() {}, getBackend: () => 'cpu',
        async loadLayersModel() { return { dispose() { disposals++; } }; }
    };
    const h = harness(runtime);
    h.run('validateCrepeModel = () => { throw new Error("invalid model"); }');
    await assert.rejects(h.run('loadCrepeModel()'), /invalid model/);
    assert.equal(disposals, 1);
    assert.equal(h.run('crepeLoadingPromise'), null);
    h.run('validateCrepeModel = () => {}');
    assert.ok(await h.run('loadCrepeModel()'));
});

test('microphone start, device suspension, stop and restart preserve unprocessed capture', async () => {
    const streams = [];
    const Context = audioContext();
    const h = harness(tf, { mediaDevices: { async getUserMedia(constraints) {
        assert.equal(constraints.audio.echoCancellation, false);
        assert.equal(constraints.audio.noiseSuppression, false);
        assert.equal(constraints.audio.autoGainControl, false);
        const stream = mediaStream(); streams.push(stream);
        // Simulate a device opening suspending an already-running context.
        h.run('crepeAudioContext.state = "suspended"');
        return stream;
    } } }, Context);
    h.run('loadCrepeModel = async () => {}');
    for (let attempt = 0; attempt < 2; attempt++) {
        await h.run('startCrepeAnalyzer()');
        assert.equal(h.run('crepeAudioContext.state'), 'running');
        assert.equal(h.run('crepeRunning'), true);
        assert.equal(h.elements.get('pitchStatus').textContent, 'Mic on.');
        assert.equal(h.elements.get('pitchStopBtn').disabled, false);
        await h.run('stopCrepeAnalyzer()');
        assert.equal(h.run('crepeAudioContext'), null);
        assert.equal(h.run('crepeRunning'), false);
        assert.equal(streams[attempt].track.stopped, true);
    }
});

test('Chrome tab sharing opens the picker before asynchronous model loading', async () => {
    const order = [], stream = mediaStream();
    const h = harness(tf, { mediaDevices: { async getDisplayMedia() { order.push('picker'); return stream; } } }, audioContext());
    h.context.load = async () => { order.push('model'); };
    h.run('loadCrepeModel = load');
    await h.run('startCrepeTabAnalyzer()');
    assert.deepEqual(order, ['picker', 'model']);
    assert.equal(h.run('crepeInputMode'), 'tab');
    await h.run('stopCrepeAnalyzer()');
    assert.equal(stream.track.stopped, true);
});

test('model failure after tab permission releases the shared stream', async () => {
    const stream = mediaStream();
    const h = harness(tf, { mediaDevices: { async getDisplayMedia() { return stream; } } }, audioContext());
    h.run('loadCrepeModel = async () => { throw new Error("model unavailable"); }');
    await h.run('startCrepeTabAnalyzer()');
    assert.equal(stream.track.stopped, true);
    assert.equal(h.run('crepeAudioContext'), null);
    assert.equal(h.elements.get('pitchStopBtn').disabled, true);
    assert.equal(h.elements.get('pitchStatus').textContent, 'model unavailable');
});
