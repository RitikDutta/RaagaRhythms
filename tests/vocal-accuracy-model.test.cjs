'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const tf = require(path.join(root, 'vocal-accuracy/tfjs-4.22.0.min.js'));
const workerSource = fs.readFileSync(path.join(root, 'vocal-accuracy/neural-worker.js'), 'utf8');
const modelDir = path.join(root, 'crepe/model');
const manifest = JSON.parse(fs.readFileSync(path.join(modelDir, 'model.json'), 'utf8'));
const weightSpecs = [], parts = [];
for (const group of manifest.weightsManifest) {
  weightSpecs.push(...group.weights);
  for (const file of group.paths) parts.push(fs.readFileSync(path.join(modelDir, file)));
}
const bytes = Buffer.concat(parts);
const artifacts = {
  modelTopology: manifest.modelTopology, weightSpecs,
  weightData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
};

test('bundled CREPE runtime passes startup checks and tracks distinct tones without leaking tensors', async () => {
  let output;
  let model;
  const self = { postMessage: message => { output = message; } };
  const context = vm.createContext({
    self, Float32Array, Math, Number, importScripts() {},
    // Replace only transport: use the exact bundled model from disk instead
    // of the browser's HTTP loader. The worker's inference code is unchanged.
    tf: { ...tf, loadLayersModel: async () => { model = await tf.loadLayersModel(tf.io.fromMemory(artifacts)); return model; } }
  });
  vm.runInContext(workerSource, context);
  try {
    await self.onmessage({ data: { type: 'init', runtimeURL: 'local runtime', modelURL: 'local model' } });
    assert.equal(output.type, 'ready', output.message);
    const tensorsBefore = tf.memory().numTensors;
    const errors = [];
    for (const hz of [110, 240, 440, 660]) {
      for (const amplitude of [0.02, 0.2]) {
        const frame = Float32Array.from({ length: 1024 }, (_, i) => amplitude * (
          Math.sin(2 * Math.PI * hz * i / 16000) + 0.4 * Math.sin(4 * Math.PI * hz * i / 16000)));
        await self.onmessage({ data: { type: 'process', frame } });
        assert.equal(output.type, 'prediction', output.message);
        const error = Math.abs(1200 * Math.log2(output.hz / hz));
        errors.push(error);
        assert.ok(error < 15, `${hz} Hz predicted as ${output.hz} Hz`);
        assert.ok(output.confidence > 0.5);
      }
    }
    assert.equal(tf.memory().numTensors, tensorsBefore);
    console.log('Bundled CREPE maximum harmonic-tone error:', Math.max(...errors).toFixed(3), 'cents');
  } finally { model?.dispose(); }
});
