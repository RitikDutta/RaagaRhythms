# Vocal accuracy experiment

Open `testing-vocal-accuracy.html` from the project root using a static server:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000/testing-vocal-accuracy.html. This experimental page is not registered in the existing Flask app's asset allowlist.

Start the microphone, sing your comfortable madhya Sa steadily for a second, then choose **Capture steady Sa**. Alternatively, enter a known tonic. A stable sequence of recent, confident measurements is used for capture; wide vibrato, long gaps, and stale readings are rejected. Use headphones for accompaniment. Room-noise measurement is optional and requires 1.5 seconds of silence.

If singing drops out, start with **Vocal sensitivity** at 70% and raise it toward 85–90%. This adjusts the periodicity acceptance rules, independently of graph smoothing. Weaker estimates need repeated matching frames, or continuity with a recently accepted pitch. Very high sensitivity may accept more background sounds. The mic threshold now defaults to −65 dBFS rather than −55; lower it toward −70 for especially quiet input. The live mic feedback shows the level, threshold, and rejection reason. **Reset mic sensitivity** restores the new defaults. Previously saved −55 defaults are migrated; custom thresholds remain as saved.

Sa capture accepts a small number of brief dropouts, but requires at least 75% confident voiced frames, a sustained phrase, and tightly grouped pitch estimates. It still refuses long gaps, stale readings, and wide vibrato.

## What changed

- Corrected YIN's cumulative normalization: every delay contributes, and difference comparisons use the same window length. The original skipped the initial delays. Frequency is refined around the raw difference minimum. See the [YIN reference](https://labrosa.ee.columbia.edu/doc/yin.html).
- AudioWorklet capture sends overlapping frames to a worker, with low-pass resampling to 16 kHz. Resampling coefficients are cached for each capture shape instead of recalculated for every frame. Silent and clipped input skips the expensive analysis. Short and longer analysis windows balance changes in pitch against periodicity evidence. Queues are bounded; delayed frames are dropped.
- Silence, clipping, weak periodicity, and isolated octave jumps are rejected. A wider detection range is checked before applying the selected vocal range, reducing octave folding at range boundaries.
- For noisy or breathy tones, YIN prefers the earliest comparable periodic minimum instead of an arbitrary longer-period dip. Multiple observed cycles refine the same fundamental without smoothing across time. Vocal sensitivity controls how weaker evidence is confirmed.
- The original TF.js 0.8 worker returned approximately 1936.6 Hz for four different harmonic test tones in this environment. The same local model, run with TF.js 4.22.0, distinguished them correctly. The new neural worker checks 110, 240, and 440 Hz before enabling CREPE; a failed check leaves YIN running alone.
- CREPE's actual activation confidence and local pitch-bin weighted average are used, following the [upstream implementation](https://github.com/marl/crepe). Fresh evidence may choose an observed YIN candidate. Slower results can only reinforce an uninterrupted matching pitch, not override a new note. Separate notes are never averaged together.
- Swaras use your Sa, with octave labels, continuous Hz, and cents offsets. Optional per-swara reference adjustments affect labels and guide lines only. These are configurable references, not a claim that Indian classical intonation has one fixed tuning. Graph smoothing does not change detection or span silent gaps.

## Processing load

Both experiments now share the corrected pitch core and worker files in this
directory. `testing-new-method.html` no longer downloads ml5 or performs YIN or
CREPE inference on the UI thread. It sends at most one audio frame at a time to
the analysis worker, at 25 frames per second. The accuracy experiment retains
its 20 ms capture hop and one-frame backpressure.

CREPE runs in a separate worker, using the local WASM backend when available.
Neural checks are capped at four per second, with additional rest after slow
inference to keep their sustained duty cycle at or below 20%. Ordinary audio
frames do not carry neural waveforms or wait for neural inference. Frames that
are checked by CREPE wait at most 80 ms for exact-frame recovery.

Readout and canvas updates coalesce at 20 fps without changing the tracker's
frame timestamps or pitch calculations. Hidden tabs suspend their audio
context and stop submitting analysis/inference work; returning to the page
resumes tracking with fresh continuity state. Stop terminates both workers.

A warmed-up local Node benchmark of resampling plus YIN on a generated 240 Hz
tone measured about 4.5–5.4× less processing time at 44.1, 48, and 96 kHz after
filter caching. This measures that processing path, not browser-wide CPU usage
or real-microphone latency.

## Validation

Run the included tests with Node.js, without installing packages:

```bash
node tests/vocal-accuracy.test.cjs
node tests/vocal-accuracy-model.test.cjs
node tests/pitch-performance.test.cjs
```

The DSP tests cover clean tones, harmonic-rich and missing-fundamental signals, noise, resampling/alias rejection, octave transitions, continuous pitch movements, swara mapping, and Sa capture. A separate test loads the real bundled CREPE weights and tests the actual neural worker's inference code, startup checks, and tensor cleanup. Performance regressions check cached filters, silence skipping, inference duty/rate limits, repaint coalescing, bounded queues, ordinary-frame latency, hidden tabs, and stop/restart using simulated browser surfaces.

Browser verification uses generated Web Audio tones through the actual AudioWorklet/worker pipeline and covers Sa capture, Ga and upper-Sa transitions, silence, stop/restart, quiet input, sensitivity/threshold controls, and a 390-pixel mobile layout.

These tests are synthetic. They do not establish an accuracy percentage for real singers or an improvement on a labelled vocal dataset. Strict rejection can produce more gaps for breathy or noisy singing. A single-pitch tracker cannot separate your voice from tanpura, another singer, or other pitched accompaniment. For a meaningful next benchmark, compare this and the original on the same vocal recordings, including quiet notes, mandra passages, meend, and gamak; measure cents error, octave errors, voiced-frame coverage, and response delay.

## Bundled dependency

`tfjs-4.22.0.min.js` is the unmodified browser distribution from `@tensorflow/tfjs@4.22.0`, copyright 2024 Google LLC, under Apache-2.0. See `TENSORFLOW-LICENSE` and the [versioned upstream source](https://github.com/tensorflow/tfjs/tree/tfjs-v4.22.0). The model remains in `../crepe/model/`; all runtime/model requests stay local. The main application and legacy CREPE demo retain their existing runtime.
