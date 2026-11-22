# Vocal tracking check · 15 November 2026

The supplied `song_test.mp3` was decoded and run through the real analysis code and bundled CREPE model. No ground-truth vocal notes or isolated vocal stem were provided. **These results measure pitch coverage and synthetic response, not vocal-note accuracy.**

Input: 44.1 kHz stereo MP3, 58.42 seconds of decoded audio, downmixed to mono. SHA-256: `569081e61bd0f08416a770dbffd5ca057843e69ee19e594e10e90cea2d704320`.

## Supplied song

Default input settings were 65–1200 Hz, −72 dBFS, 70% live sensitivity, and continuous mode. Live analysis used 105 ms input history and 20 ms hops. The file path used centered windows, 20 ms hops, and whole-sequence candidate decoding.

| Path | Accepted frames | Pitch coverage |
| --- | ---: | ---: |
| Previous live worker + tracker, YIN only | 1,444 / 2,916 | 49.52% |
| Revised live worker + tracker, YIN only | 1,516 / 2,916 | 51.99% |
| Offline centered YIN fallback | 1,632 / 2,921 | 55.87% |
| Offline centered YIN + per-frame CREPE | 1,831 / 2,921 | 62.68% |

The live rows exclude neural inference and UI/audio-device latency. They isolate the causal worker and tracker so their before/after coverage can be compared. This is not a benchmark of the complete Chrome capture path. Both live runs still contained a 1.52-second interval without an accepted pitch. Such intervals need reference annotations to distinguish missing vocals, musical rests, and detection errors.

The full offline pass executed the actual neural worker's `analyze-song` branch on 2,921 centered frames. It took about 579 seconds with the bundled pure-JavaScript CPU backend in this environment. Browser analysis attempts the bundled WASM backend first; browser processing time was not measured. The fast YIN-only file pass took about 6.9 seconds. Timings are environment-specific, with other validation work running concurrently.

Coverage improves, but there are still substantial ambiguous sections. Low and high competing candidates occur in the recording. A single-pitch detector cannot identify which source is the singer merely by accepting more frames. Vocal-only evaluation needs isolated vocals or labeled vocal F0; a mixed-song transcription pipeline benefits from a separate vocal-isolation stage.

## Controlled fast-note response

The test signal contains harmonic-rich tones, slight noise and vibrato, short amplitude envelopes, and a sequence with stepwise changes and octave leaps. Twenty notes are generated; the initial two are excluded to allow the live capture window to fill. A note counts as detected when the tracker produces its known pitch within 50 cents during that note's actual time interval.

| Note duration | Previous notes detected | Revised notes detected |
| --- | ---: | ---: |
| 60 ms | 12 / 18 | 16 / 18 |
| 80 ms | 12 / 18 | 18 / 18 |
| 100 ms | 18 / 18 | 18 / 18 |

For 60 ms notes that were detected, median onset response improved from 45 to 25 ms. For 100 ms notes, maximum onset response improved from 85 to 65 ms. These numbers exclude hardware, capture buffering, and screen refresh. They do not characterize real-vocal or polyphonic accuracy.

The readout now updates at up to 50 fps, independently of the 20 fps graph. Clear current notes bypass older neural recovery waits, and pre-onset neural results cannot override a new note. The recent-window path keeps two-frame confirmation rather than displaying single-frame octave glitches.

## Verification limits

Synthetic regressions cover fast changes, quiet and breathier sustains, silence, clipping, noise, range rejection, actual model inference, and tensor cleanup. Simulated browser tests cover upload processing, seeking by the media clock, cancellation, late responses, tab sharing, and switching back to live input.

The browser access host was unavailable, so the new UI has not been tested interactively in Chrome. Flask is not installed in this execution environment; its asset allowlist changes passed syntax checks but could not be exercised with a Flask test client. A static server remains supported.

See [README.md](README.md#reproduce-the-song-benchmark) for repeatable FFmpeg and Node commands. The live benchmark also accepts saved `--core` and `--worker` sources for before/after comparisons.
