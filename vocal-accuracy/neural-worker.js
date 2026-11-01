let model = null;
const clock = () => typeof performance === 'undefined' ? Date.now() : performance.now();
function predict(frame) {
  return tf.tidy(() => {
    const raw = tf.tensor1d(frame), zero = raw.sub(raw.mean());
    const deviation = zero.square().mean().sqrt();
    const input = zero.div(deviation.maximum(1e-8)).reshape([1, 1024]);
    const activation = model.predict(input).dataSync();
    let peak = 0;
    for (let i = 1; i < activation.length; i++) if (activation[i] > activation[peak]) peak = i;
    let weights = 0, weightedCents = 0;
    for (let i = Math.max(0, peak - 4); i < Math.min(360, peak + 5); i++) {
      weights += activation[i]; weightedCents += activation[i] * (1997.3794084376191 + 20 * i);
    }
    return { hz: 10 * 2 ** (weightedCents / weights / 1200), confidence: activation[peak] };
  });
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      importScripts(data.runtimeURL);
      if (data.wasmURL) {
        try {
          importScripts(data.wasmURL);
          tf.wasm.setWasmPaths(data.wasmPath);
          tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
          await tf.setBackend('wasm'); await tf.ready();
        } catch (_) { await tf.setBackend('cpu'); await tf.ready(); }
      } else { await tf.setBackend('cpu'); await tf.ready(); }
      model = await tf.loadLayersModel(data.modelURL);
      // Test actual inference, not just whether the weights downloaded. Some
      // historical runtime/backend combinations return a constant wrong pitch.
      for (const hz of [110, 240, 440]) {
        const signal = Float32Array.from({ length: 1024 }, (_, i) =>
          0.2 * (Math.sin(2 * Math.PI * hz * i / 16000) + 0.4 * Math.sin(4 * Math.PI * hz * i / 16000)));
        const result = predict(signal);
        if (!Number.isFinite(result.hz) || Math.abs(1200 * Math.log2(result.hz / hz)) > 60 || result.confidence < 0.45) {
          throw new Error('CREPE tone check failed; using YIN alone.');
        }
      }
      self.postMessage({ type: 'ready', backend: tf.getBackend() });
    } else if (data.type === 'process' && model) {
      const start = clock();
      const result = predict(data.frame);
      self.postMessage({ type: 'prediction', t: data.t, ...result, inferenceMs: clock() - start });
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
