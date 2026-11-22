(() => {
  'use strict';
  const P = MicProximity;
  const $ = id => document.getElementById(id);
  const text = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
  const tracker = new P.Tracker();
  const profiles = { away: null, near: null };
  const history = [];
  const canvas = $('timeline'), ctx = canvas.getContext('2d');
  let width = 0, height = 0, session = null, generation = 0;
  let model = null, capture = null, deviceKey = null, lastFrame = null;

  function controls() {
    $('start').disabled = Boolean(session);
    $('stop').disabled = !session;
    $('device').disabled = Boolean(session);
    for (const side of ['away', 'near']) {
      $('capture-' + side).disabled = !session?.ready || Boolean(capture);
      $(side + '-card').dataset.complete = String(Boolean(profiles[side]));
      $(side + '-card').dataset.capturing = String(capture?.side === side);
      text(side + '-badge', capture?.side === side ? 'Listening…' : profiles[side] ? 'Captured ✓' : 'Not captured');
    }
    $('capture-progress').hidden = !capture;
  }

  function resetCalibration(message) {
    capture = null; model = null; profiles.away = null; profiles.near = null;
    tracker.reset(); history.length = 0; controls(); draw();
    text('calibration-message', message || 'Capture away, then near, while humming the same note at the same effort.');
    if (session?.ready) render(lastFrame, { kind: 'uncalibrated', score: null, clarity: 0 });
  }

  function updateMode() {
    const hand = $('mode').value === 'hand';
    text('mode-help', hand ? 'Keep your head and humming steady. Only your hand should move between the captures.' : 'Keep your note and humming effort steady. Move your head between the two captures.');
    text('away-title', hand ? 'Hands clear of the mic' : 'Your usual position');
    text('away-help', hand ? 'Stay in one position, hum a comfortable note, and keep your hands away from the microphone.' : 'Sit at your normal distance from the mic and hum one comfortable note.');
    text('near-title', hand ? 'Hand beside the mic' : 'A little closer');
    text('near-help', hand ? 'Keep humming in the same position. Bring a hand close beside the mic without touching it.' : 'Lean closer to the mic, keep the same humming effort, and hold your note.');
    resetCalibration();
  }

  function beginCapture(side) {
    if (!session?.ready || capture) return;
    model = null; tracker.reset(); history.length = 0;
    capture = { side, startedAt: performance.now(), frames: [] };
    $('capture-progress').value = 0; controls();
    text('calibration-message', `Capturing ${side}. Keep humming steadily and hold this position for two seconds.`);
  }

  function collect(frame, now) {
    if (!capture) return;
    if (frame.valid) capture.frames.push(frame);
    const elapsed = now - capture.startedAt;
    $('capture-progress').value = Math.min(1, elapsed / 2000, capture.frames.length / 20);
    if (elapsed >= 2000 && capture.frames.length >= 20) {
      const side = capture.side;
      profiles[side] = P.profile(capture.frames);
      capture = null; controls();
      if (!profiles.away || !profiles.near) {
        text('calibration-message', `${side === 'away' ? 'Away' : 'Near'} captured. Now capture the other position with the same hum.`);
      } else {
        try {
          model = P.fit(profiles.away, profiles.near, $('mode').value);
          tracker.reset(); history.length = 0;
          text('calibration-message', 'Calibrated. Keep humming and move between your two positions. The indicator follows the sound match.');
          text('status', 'Listening · calibrated');
        } catch (error) {
          model = null;
          text('calibration-message', error.message);
          text('status', 'Samples need a clearer difference');
        }
      }
    } else if (elapsed > 8000) {
      capture = null; controls();
      text('calibration-message', 'Not enough clear sound. Hum one note steadily, avoid clipping, and capture again.');
    }
  }

  const states = {
    idle: ['WAITING FOR SOUND', 'Let’s listen.', 'Start the microphone, then capture your away and near positions.'],
    uncalibrated: ['READY TO LEARN', 'Hearing you.', 'Capture two positions to teach the indicator what near and away sound like.'],
    near: ['NEAR SIGNATURE MATCHED', 'Near.', 'Your sound resembles the position you captured as near.'],
    away: ['AWAY SIGNATURE MATCHED', 'Away.', 'Your sound resembles the position you captured as away.'],
    between: ['NO CLEAR ENDPOINT', 'In between.', 'Move slowly between your positions while keeping the same hum.'],
    unknown: ['SOUND HAS CHANGED', 'Uncertain.', 'This sound doesn’t resemble either sample. Return to your calibration hum or capture again.'],
    quiet: ['NO USABLE SOUND', 'Keep humming.', 'Silence cannot tell us whether someone is near or away.'],
    noisy: ['NEEDS A STEADY SOUND', 'Try a clear hum.', 'Noise or a changing sound makes the comparison unreliable.'],
    clipped: ['INPUT TOO STRONG', 'Mic is clipping.', 'Lower the microphone input level or move back slightly, then recalibrate.'],
    invalid: ['NO AUDIO FRAME', 'Waiting…', 'Waiting for a clear microphone signal.'],
    paused: ['PROCESSING PAUSED', 'See you soon.', 'Listening pauses while this tab is hidden.'],
    calibrating: ['LEARNING THIS POSITION', 'Hold your hum.', 'Keep your position, note, and humming effort steady.']
  };

  function render(frame, result) {
    const kind = capture ? 'calibrating' : result.kind;
    const copy = states[kind] || states.unknown;
    $('sensor').dataset.kind = kind;
    text('state-tag', copy[0]); text('state', copy[1]); text('hint', copy[2]);
    const hasScore = !capture && Number.isFinite(result.score);
    $('position-marker').hidden = !hasScore;
    if (hasScore) $('position-marker').style.left = `${(result.score * 100).toFixed(1)}%`;
    text('match-note', hasScore ? result.kind === 'near' || result.kind === 'away'
      ? 'Matching your calibrated sound · not a physical distance' : 'Between samples · keep the sound steady'
      : 'A relative sound match, not a distance in centimetres.');
    text('level', frame && Number.isFinite(frame.levelDb) ? frame.levelDb.toFixed(1) : '—');
    text('bass', frame?.valid ? String(Math.round(frame.bass * 100)) : '—');
    text('brightness', frame?.valid ? String(Math.round(frame.centroid)) : '—');
    $('level-bar').style.width = frame ? `${Math.max(0, Math.min(100, (frame.levelDb + 80) / 80 * 100))}%` : '0%';
  }

  function schedule(s, delay = 100) {
    if (session !== s || !s.ready || document.hidden || s.timer !== null) return;
    s.timer = setTimeout(() => { s.timer = null; tick(s); }, delay);
  }

  function tick(s) {
    if (session !== s || document.hidden || !s.ready) return;
    try {
      s.analyser.getFloatTimeDomainData(s.waveform);
      s.analyser.getFloatFrequencyData(s.spectrum);
      const now = performance.now();
      const frame = P.extract(s.waveform, s.spectrum, s.context.sampleRate);
      lastFrame = frame;
      collect(frame, now);
      const result = tracker.update(P.classify(frame, model), now);
      render(frame, result);
      history.push({ t: now, score: capture ? null : result.score });
      while (history.length && now - history[0].t > 15000) history.shift();
      draw(); schedule(s);
    } catch (error) { stop('Audio analysis failed: ' + error.message); }
  }

  async function listDevices() {
    try {
      if (!navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const selected = $('device').value;
      const options = [new Option('System default', '')];
      devices.filter(device => device.kind === 'audioinput' && device.deviceId !== 'default').forEach((device, i) => {
        options.push(new Option(device.label || `Microphone ${i + 1}`, device.deviceId));
      });
      $('device').replaceChildren(...options); $('device').value = selected;
    } catch (_) { /* Device enumeration is optional. */ }
  }

  async function start() {
    if (session) return;
    const s = { id: ++generation, timer: null, ready: false };
    session = s; controls(); text('status', 'Requesting microphone…');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open this page on HTTPS or localhost to use the microphone.');
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support microphone analysis.');
      s.context = new AudioContextClass({ latencyHint: 'interactive' });
      await s.context.resume();
      if (session !== s) return;
      const device = $('device').value;
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: 1, ...(device ? { deviceId: { exact: device } } : {})
      } });
      if (session !== s) { stream.getTracks().forEach(track => track.stop()); return; }
      s.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No microphone audio track was captured.');
      const settings = track.getSettings?.() || {};
      const key = settings.deviceId || device || track.label || 'default';
      if (deviceKey !== null && deviceKey !== key) resetCalibration('Microphone changed. Capture two new samples for this microphone.');
      deviceKey = key;
      s.analyser = s.context.createAnalyser(); s.analyser.fftSize = 4096;
      s.analyser.smoothingTimeConstant = 0;
      s.waveform = new Float32Array(s.analyser.fftSize);
      s.spectrum = new Float32Array(s.analyser.frequencyBinCount);
      s.source = s.context.createMediaStreamSource(stream);
      s.mute = s.context.createGain(); s.mute.gain.value = 0;
      s.source.connect(s.analyser); s.analyser.connect(s.mute); s.mute.connect(s.context.destination);
      if (s.context.state === 'suspended' && !document.hidden) await s.context.resume();
      if (session !== s) return;
      track.addEventListener('ended', () => { if (session === s) stop('Microphone disconnected. Reconnect it and start again.'); });
      s.ready = true; tracker.reset(); controls();
      text('status', model ? 'Listening · calibrated' : 'Mic on · capture two positions');
      listDevices();
      if (document.hidden) { await s.context.suspend(); text('status', 'Paused while tab is hidden'); }
      else schedule(s, 0);
    } catch (error) {
      if (session !== s) return;
      const message = error.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser and start again.'
        : error.name === 'NotFoundError' ? 'No microphone was found. Connect one and start again.' : error.message;
      stop(message);
    }
  }

  function stop(message = 'Stopped · microphone released') {
    const s = session; session = null; generation++;
    if (s) {
      clearTimeout(s.timer);
      for (const node of [s.source, s.analyser, s.mute]) { try { node?.disconnect(); } catch (_) {} }
      s.stream?.getTracks().forEach(track => track.stop());
      if (s.context && s.context.state !== 'closed') s.context.close().catch(() => {});
    }
    capture = null; lastFrame = null; tracker.reset(); controls();
    text('status', message); render(null, { kind: 'idle', score: null, clarity: 0 });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const left = 40, right = width - 8, top = 12, bottom = height - 19;
    ctx.font = '9px system-ui'; ctx.textBaseline = 'middle';
    for (const [value, label] of [[0, 'AWAY'], [0.5, 'MID'], [1, 'NEAR']]) {
      const y = bottom - value * (bottom - top);
      ctx.fillStyle = '#7c8789'; ctx.fillText(label, 0, y);
      ctx.strokeStyle = '#2b3235'; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (!history.length) return;
    const end = history[history.length - 1].t;
    ctx.strokeStyle = '#b0f0b6'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    let connected = false, previousTime = -Infinity;
    for (const point of history) {
      if (!Number.isFinite(point.score)) { connected = false; continue; }
      const x = left + (point.t - end + 15000) / 15000 * (right - left);
      const y = bottom - point.score * (bottom - top);
      if (!connected || point.t - previousTime > 300) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      connected = true; previousTime = point.t;
    }
    ctx.stroke();
  }

  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }

  $('start').addEventListener('click', start);
  $('stop').addEventListener('click', () => stop());
  $('capture-away').addEventListener('click', () => beginCapture('away'));
  $('capture-near').addEventListener('click', () => beginCapture('near'));
  $('reset').addEventListener('click', () => resetCalibration());
  $('mode').addEventListener('change', updateMode);
  $('device').addEventListener('change', () => resetCalibration('Microphone selection changed. Capture two new samples after starting.'));
  document.addEventListener('visibilitychange', () => {
    const s = session;
    if (!s?.ready) return;
    clearTimeout(s.timer); s.timer = null; tracker.reset();
    history.push({ t: performance.now(), score: null });
    if (capture) { capture = null; controls(); text('calibration-message', 'Capture paused when the tab was hidden. Capture that position again.'); }
    if (document.hidden) {
      s.context.suspend().catch(() => {}); text('status', 'Paused while tab is hidden');
      render(null, { kind: 'paused', score: null });
    } else {
      s.context.resume().then(() => {
        if (session !== s) return;
        text('status', model ? 'Listening · calibrated' : 'Mic on · capture two positions'); schedule(s, 0);
      }).catch(error => { if (session === s) stop(error.message); });
    }
  });
  window.addEventListener('pagehide', () => stop());
  window.addEventListener('resize', resize);
  updateMode(); resize();
})();
