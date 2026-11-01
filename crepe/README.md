# Piano pitch runtime

`piano.html` uses the bundled `@tensorflow/tfjs@4.22.0` browser distribution,
`tfjs-4.22.0.min.js`, under Apache-2.0 (see `TENSORFLOW-LICENSE`). The upstream
source is https://github.com/tensorflow/tfjs/tree/tfjs-v4.22.0. Runtime and model
files are served locally; microphone audio stays in the browser.

The piano checks the real CREPE model against 110, 240, and 440 Hz before
enabling capture. A failing graphics backend is retried using TensorFlow's CPU
backend. If that also fails, startup reports an error instead of displaying
misleading notes. Silent frames are skipped before normalization.

The older `tfjs-0.8.0.min.js` remains available for the other existing pages.

Run the piano regression tests without installing packages:

```sh
node --test tests/piano-analyzer.test.cjs
```

Tests use the actual bundled model, generated tones at common microphone sample
rates, and simulated capture/backend failures. They do not replace testing a
physical microphone in Chrome and Firefox. For audio playing in the browser,
use **Analyze This Tab**, choose the playing tab, and enable **Share audio**.
