// Decode audio with ffmpeg first; see vocal-accuracy/README.md for commands.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), args = process.argv.slice(2);
const value = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const file = args[0], rate = Number(value('--rate', 44100));
if (!file || !Number.isFinite(rate) || rate < 16000) {
  console.error('Usage: node scripts/benchmark-vocal-audio.cjs audio.f32 --rate 44100 [--offline --neural] [--output report.json]');
  process.exit(1);
}
const read = filename => fs.readFileSync(filename, 'utf8');
const P = new Function(read(value('--core', path.join(root, 'vocal-accuracy/pitch-core.js'))) + ';return VocalPitch;')();
const bytes = fs.readFileSync(file);
if (bytes.length % 4) throw new Error('Input must be mono little-endian float32 PCM.');
const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);

async function run() {
  const started = performance.now();
  let records, summary, model;
  try {
    if (args.includes('--offline')) {
      if (rate !== 16000) throw new Error('Offline input must be decoded at 16000 Hz.');
      const O = new Function('VocalPitch', read(path.join(root, 'vocal-accuracy/offline-core.js')) + ';return VocalOffline;')(P);
      let output, lastProgress = -1;
      const self = { postMessage(data) {
        if (data.type === 'song-progress') {
          const progress = Math.floor(data.progress * 10);
          if (progress !== lastProgress) { console.error(`Analysis: ${progress * 10}%`); lastProgress = progress; }
        } else output = data;
      } };
      let runtime;
      if (args.includes('--neural')) {
        const tf = require(path.join(root, 'vocal-accuracy/tfjs-4.22.0.min.js'));
        const manifest = JSON.parse(read(path.join(root, 'crepe/model/model.json')));
        const weightSpecs = [], parts = [];
        for (const group of manifest.weightsManifest) {
          weightSpecs.push(...group.weights);
          for (const shard of group.paths) parts.push(fs.readFileSync(path.join(root, 'crepe/model', shard)));
        }
        const weights = Buffer.concat(parts);
        runtime = { ...tf, loadLayersModel: async () => {
          model = await tf.loadLayersModel(tf.io.fromMemory({ modelTopology: manifest.modelTopology, weightSpecs,
            weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength) }));
          return model;
        } };
      }
      new Function('self', 'importScripts', 'tf', 'VocalOffline', read(path.join(root, 'vocal-accuracy/neural-worker.js')))(self, () => {}, runtime, O);
      if (runtime) {
        await self.onmessage({ data: { type: 'init' } });
        if (output.type !== 'ready') throw new Error(output.message);
      }
      await self.onmessage({ data: { type: 'analyze-song', samples, options: { gateDb: -72 } } });
      if (output.type !== 'song-complete') throw new Error(output.message);
      records = output.frames;
      summary = { mode: 'offline', neural: output.neural, duration: output.duration, hopMs: output.hopMs, coverage: output.coverage };
    } else {
      let output;
      const self = { postMessage(data) { output = data; } };
      new Function('self', 'importScripts', 'VocalPitch', read(value('--worker', path.join(root, 'vocal-accuracy/analysis-worker.js'))))(self, () => {}, P);
      const tracker = new P.Tracker(), count = Math.ceil(rate * 0.105), hop = Math.round(rate * 0.02), costs = [];
      records = [];
      for (let end = count; end < samples.length; end += hop) {
        const before = performance.now();
        self.onmessage({ data: { frame: samples.subarray(end - count, end), rate, t: end / rate * 1000, options: { gateDb: -72 } } });
        if (output.error) throw new Error(output.error);
        const result = tracker.push(output);
        costs.push(performance.now() - before);
        records.push({ t: output.t, measuredHz: output.hz, hz: result.hz, quality: output.quality, source: result.source, reason: result.hz ? '' : result.reason });
      }
      costs.sort((a, b) => a - b);
      summary = { mode: 'live YIN only', duration: samples.length / rate, hopMs: 20,
        coverage: records.filter(frame => frame.hz).length / records.length,
        frameP50Ms: costs[Math.floor(costs.length * 0.5)], frameP95Ms: costs[Math.floor(costs.length * 0.95)] };
    }
    summary.frames = records.length; summary.processingMs = performance.now() - started;
    summary.note = 'Coverage is not accuracy. No ground-truth vocal annotations are supplied.';
    if (value('--output')) fs.writeFileSync(value('--output'), JSON.stringify({ summary, records }));
    console.log(JSON.stringify(summary, null, 2));
  } finally { model?.dispose(); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
