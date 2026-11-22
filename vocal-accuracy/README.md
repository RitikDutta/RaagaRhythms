# Vocal accuracy experiment

Open `testing-vocal-accuracy.html` from the project root using a static server:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000/testing-vocal-accuracy.html. The page, its worker assets, and `song_test.mp3` are also included in the existing Flask app's asset allowlist.

Start the microphone, sing your comfortable madhya Sa steadily for a second, then choose **Capture steady Sa**. Alternatively, enter a known tonic. A stable sequence of recent, confident measurements is used for capture; wide vibrato, long gaps, and stale readings are rejected. Use headphones for accompaniment. Room-noise measurement is optional and requires 1.5 seconds of silence.

**Capture Chrome tab** opens Chrome's share picker during the click. Choose a browser tab and enable **Share tab audio**. Microphone and tab capture use the same live detector; sharing ends cleanly when Chrome stops either captured track. Stereo tab audio is downmixed to mono before analysis. Troubleshooting samples contain audio only.

## Analyze a song locally

Choose a file and click **Analyze song**, or use **Analyze song_test.mp3** for the supplied test recording. Files up to 50 MB and 10 minutes are decoded and resampled in the browser, then processed in a dedicated worker. Playback becomes available when processing finishes. Native playback, pause, speed changes, and seeking use the audio element's current time to select the precomputed 20 ms pitch frames. Live capture pauses playback and cancels an in-progress file job. Cancel also releases the analysis worker and decoder; late results cannot replace a newer session.

File analysis runs the bundled CREPE model on every usable centered frame, independently of the live inference budget. Centered YIN contributes pitch alternatives. A whole-sequence dynamic program chooses among measured candidates and unvoiced states; it can use future context without imposing a live response delay. This is a custom candidate decoder, not a full pYIN implementation. Silence, clipping, unsupported neural predictions, and out-of-range pitches remain gaps. If the neural model fails its startup check or initialization times out, the UI identifies the YIN-only fallback.

Audio and model processing stay on the device. Processing time depends on the device and backend and can exceed the song's duration. Sa and reference tuning can be changed during playback without rerunning detection. Changing the input threshold or voice range requires reanalysis. Live tracking mode and sensitivity apply to live capture.

Offline processing provides more context, not a correctness guarantee. These are single-pitch detectors. A full mix can produce instrumental pitches instead of the singer; use an isolated vocal track for vocal-note analysis. Vocal separation is a separate processing step, for example with [Demucs](https://github.com/facebookresearch/demucs). Pitch coverage and model activation are not accuracy percentages. Ground-truth vocal annotations are needed to measure note correctness. The use of sequence context is motivated by [pYIN's candidate-tracking approach](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/MauchDixon-PYIN-ICASSP2014.pdf).

If singing drops out, start with **Vocal sensitivity** at 70% and raise it toward 85–90%. This adjusts the periodicity acceptance rules, independently of graph smoothing. Weaker estimates need repeated matching frames, or continuity with a recently accepted pitch. Very high sensitivity may accept more background sounds. The mic threshold defaults to −72 dBFS in both pitch experiments; the original experiment previously used a much higher cutoff near −42 dBFS. The live mic feedback shows the level, threshold, and rejection reason. **Reset mic sensitivity** restores the defaults in the accuracy lab. Previously saved defaults are migrated; custom thresholds remain as saved.

Sa capture accepts a small number of brief dropouts, but requires at least 75% confident voiced frames, a sustained phrase, and tightly grouped pitch estimates. It still refuses long gaps, stale readings, and wide vibrato.

## What changed

- Corrected YIN's cumulative normalization: every delay contributes, and difference comparisons use the same window length. The original skipped the initial delays. Frequency is refined around the raw difference minimum. See the [YIN reference](https://labrosa.ee.columbia.edu/doc/yin.html).
- AudioWorklet capture sends overlapping frames to a worker, with low-pass resampling to 16 kHz. Resampling coefficients are cached for each capture shape instead of recalculated for every frame. Silent and clipped input skips the expensive analysis. Short and longer analysis windows balance changes in pitch against periodicity evidence. Queues are bounded; delayed frames are dropped.
- An additional recent-window estimate requires strong current-cycle support before taking priority over older audio. The wide low-register search remains active. A verified recent-window change needs two frames rather than the older 40 ms jump hold; one-frame octave glitches are still rejected.
- Silence, clipping, weak periodicity, and isolated octave jumps are rejected. A wider detection range is checked before applying the selected vocal range, reducing octave folding at range boundaries.
- For noisy or breathy tones, YIN prefers the earliest comparable periodic minimum instead of an arbitrary longer-period dip. Multiple observed cycles refine the same fundamental without smoothing across time. Vocal sensitivity controls how weaker evidence is confirmed.
- In continuous mode, a recent measured period can guide a narrow search in the current waveform when broad YIN estimates become unreliable during a sustained vowel. The three-cycle correlation peak must have fresh waveform support; it does not keep displaying the last note through silence. Sustain history and the 10 dB release margin run in the analysis worker, rather than depending on UI updates or delayed neural results. History expires after a 200 ms capture gap and resets on silence, clipping, and explicit reset. Clear new pitches take priority. Strict mode does not enable this recovery.
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
frames do not carry neural waveforms or wait for neural inference. Only uncertain
frames checked by CREPE wait at most 80 ms for exact-frame recovery. A newer clear
note bypasses that wait, and neural results from before a new onset cannot override
it. Uncertain input takes priority over routine checks of an already clear note.

The accuracy lab's readout updates at up to 50 fps while its canvas stays capped
at 20 fps. The original experiment retains its 20 fps display. Neither changes
the tracker's frame timestamps or pitch calculations. Hidden live tabs suspend their audio
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
node tests/sustained-pitch.test.cjs
node tests/rapid-vocal-pitch.test.cjs
node tests/offline-pitch.test.cjs
```

The DSP tests cover clean tones, harmonic-rich and missing-fundamental signals, noise, resampling/alias rejection, octave transitions, continuous pitch movements, swara mapping, and Sa capture. A separate test loads the real bundled CREPE weights and tests the actual neural worker's inference code, startup checks, and tensor cleanup. Performance regressions check cached filters, silence skipping, inference duty/rate limits, repaint coalescing, bounded queues, ordinary-frame latency, hidden tabs, and stop/restart using simulated browser surfaces.

Sustain regressions feed actual ten-second waveforms through the analysis worker
and tracker at 16 and 48 kHz, with a quiet or breathier tail beginning after two
seconds. They also verify rejection of silence, clipping, out-of-range tones,
noise, and expired history. Simulated page tests check that both readouts can
display a ten-second Sa using weaker current measurements. These tests do not
establish how a particular browser, microphone driver, or operating-system
audio filter treats a real sustained voice.

Browser verification uses generated Web Audio tones through the actual AudioWorklet/worker pipeline and covers Sa capture, Ga and upper-Sa transitions, silence, stop/restart, quiet input, sensitivity/threshold controls, and a 390-pixel mobile layout.

These tests are synthetic. They do not establish an accuracy percentage for real singers or an improvement on a labelled vocal dataset. Strict rejection can produce more gaps for breathy or noisy singing. A single-pitch tracker cannot separate your voice from tanpura, another singer, or other pitched accompaniment. For a meaningful next benchmark, compare this and the original on the same vocal recordings, including quiet notes, mandra passages, meend, and gamak; measure cents error, octave errors, voiced-frame coverage, and response delay.

The rapid-note tests feed actual harmonic-rich, slightly noisy waveforms through the live analysis worker and tracker at 60, 80, and 100 ms per note, including octave jumps. File tests cover centered timestamps, candidate decoding, short-note preservation, silence and noise rejection, waveform support, and playback/seek/cancel behavior on simulated browser surfaces. The current session has no available browser host, so the new upload controls have not been verified interactively in Chrome.

## Reproduce the song benchmark

With FFmpeg installed, decode the supplied MP3 to raw mono float32 PCM:

```bash
ffmpeg -v error -i song_test.mp3 -ac 1 -ar 44100 -f f32le -y /tmp/raaga-song-44100.f32
node scripts/benchmark-vocal-audio.cjs /tmp/raaga-song-44100.f32 --rate 44100 --output /tmp/raaga-live.json

ffmpeg -v error -i song_test.mp3 -ac 1 -ar 16000 -f f32le -y /tmp/raaga-song-16000.f32
node scripts/benchmark-vocal-audio.cjs /tmp/raaga-song-16000.f32 --rate 16000 --offline --neural --output /tmp/raaga-file.json
```

The live benchmark exercises the analysis worker and tracker with YIN only. It does not reproduce browser neural scheduling or audio-device latency. Offline `--neural` executes the actual neural worker's file-analysis branch with the bundled model and CPU runtime; omit it for the YIN-only fallback. Node CPU inference can take several minutes for the test clip. The browser attempts the WASM backend first. Optional `--core` and `--worker` paths allow comparisons against saved prior sources. Results report coverage, timing, and frame data, never a ground-truth accuracy percentage.

## Bundled dependency

`tfjs-4.22.0.min.js` is the unmodified browser distribution from `@tensorflow/tfjs@4.22.0`, copyright 2024 Google LLC, under Apache-2.0. See `TENSORFLOW-LICENSE` and the [versioned upstream source](https://github.com/tensorflow/tfjs/tree/tfjs-v4.22.0). The model remains in `../crepe/model/`; all runtime/model requests stay local. The main application and legacy CREPE demo retain their existing runtime.
