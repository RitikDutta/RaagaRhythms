# Mic Proximity Lab

Open `testing-mic-proximity.html` on localhost or HTTPS. It is served by the
existing Flask app, or any static server started at the repository root.

1. Start the microphone and select **Voice nearer / farther** or **Hand near
   the mic**.
2. Hum one comfortable note at a consistent effort. Capture **away** for two
   seconds, then capture **near**. In hand mode, keep your mouth position fixed
   and only move your hand beside the microphone.
3. Keep humming and move between the two positions. Near and Away mean a match
   to those acoustic samples. Similar samples require recalibration; silence,
   clipping, noise, and unfamiliar sounds do not produce a distance estimate.

The passive experiment measures RMS level, normalized energy in five frequency
bands, and spectral centroid. Robust calibration medians and per-feature spread
produce a direction between the two acoustic fingerprints. Classification
rejects sounds far outside that direction, uses an ambiguous middle region, and
requires a stable match before naming an endpoint. Hand mode downweights level
so changes in spectral balance matter more than loudness alone.

It is not a physical range sensor, body detector, or centimetre measurement.
Changes in humming effort and pitch, source orientation, room response, and
other sounds can mimic position changes. No conclusion about a silent person's
presence can be drawn. Actual performance needs testing with the user's
microphone; synthetic tests establish algorithm behavior, not distance accuracy.

Audio is processed locally at 10 Hz using Web Audio's FFT, without TensorFlow,
recording, uploads, or generated tones. Hidden tabs pause processing; Stop
releases the microphone. Calibration stays in memory for the current page and
is cleared if the experiment or input device changes.

The hand/reflection hypothesis is informed by DPA's microphone measurements:
https://www.dpamicrophones.com/mic-university/audio-production/proper-hand-placement-on-a-vocal-mic/
It is a plausible explanation of the observation, not a measurement of the
user's particular microphone.

Run the synthetic core and simulated UI/lifecycle tests:

```sh
node tests/mic-proximity.test.cjs
```
