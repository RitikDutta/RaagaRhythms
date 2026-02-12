importScripts('tfjs-0.8.0.min.js');

const MODEL_URL = 'model/model.json';
const CENT_BINS = 360;
const CENT_RANGE = 7180;
const CENT_OFFSET = 1997.3794084376191;
const CENT_STEP = CENT_RANGE / (CENT_BINS - 1);

let model = null;
let loadPromise = null;
let centMapping = null;

function ensureCentMapping() {
  if (centMapping) return;
  centMapping = new Float32Array(CENT_BINS);
  for (let i = 0; i < CENT_BINS; i++) {
    centMapping[i] = CENT_OFFSET + CENT_STEP * i;
  }
}

async function loadModel() {
  if (model) return model;
  if (loadPromise) return loadPromise;
  loadPromise = tf.loadModel(MODEL_URL)
    .then((loaded) => {
      model = loaded;
      return loaded;
    })
    .catch((error) => {
      loadPromise = null;
      throw error;
    });
  return loadPromise;
}

function postError(error) {
  const message = error && error.message ? error.message : 'Worker error';
  self.postMessage({ type: 'error', message });
}

function computePrediction(frame) {
  ensureCentMapping();
  tf.tidy(() => {
    const input = tf.tensor(frame, [1024], 'float32');
    const mean = tf.mean(input);
    const zeromean = tf.sub(input, mean);
    const normValue = tf.norm(zeromean).dataSync()[0];
    const rms = normValue / Math.sqrt(1024);

    if (!isFinite(rms) || rms < 1e-6) {
      const silence = new Float32Array(CENT_BINS);
      self.postMessage({
        type: 'prediction',
        hz: NaN,
        confidence: 0,
        activation: silence.buffer
      }, [silence.buffer]);
      return;
    }

    const framestd = tf.tensor([rms], [1], 'float32');
    const normalized = tf.div(zeromean, framestd);
    const batch = normalized.reshape([1, 1024]);
    const activation = model.predict([batch]).reshape([CENT_BINS]);
    const confidence = activation.max().dataSync()[0];
    const center = activation.argMax().dataSync()[0];

    const start = Math.max(0, center - 4);
    const end = Math.min(CENT_BINS, center + 5);
    const weights = activation.slice([start], [end - start]);
    const weightData = weights.dataSync();
    let productSum = 0;
    let weightSum = 0;
    for (let i = 0; i < weightData.length; i++) {
      const weight = weightData[i];
      weightSum += weight;
      productSum += weight * centMapping[start + i];
    }

    const predictedCent = weightSum ? productSum / weightSum : NaN;
    const predictedHz = 10 * Math.pow(2, predictedCent / 1200.0);
    const activationData = activation.dataSync();
    const activationCopy = new Float32Array(activationData);

    self.postMessage({
      type: 'prediction',
      hz: predictedHz,
      confidence,
      activation: activationCopy.buffer
    }, [activationCopy.buffer]);
  });
}

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type === 'init') {
    try {
      await loadModel();
      self.postMessage({ type: 'ready' });
    } catch (error) {
      postError(error);
    }
    return;
  }

  if (data.type === 'process') {
    if (!model) return;
    if (!data.frame) return;
    try {
      const frame = data.frame instanceof Float32Array ? data.frame : new Float32Array(data.frame);
      computePrediction(frame);
    } catch (error) {
      postError(error);
    }
  }
};
