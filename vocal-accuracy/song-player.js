const VocalSong = (() => {
  'use strict';
  function mount(api) {
    const $ = id => document.getElementById(id), player = $('songPlayer');
    let selected = null, result = null, worker = null, context = null, url = null;
    let generation = 0, animation = null, timeout = null, busy = false, active = false;
    const message = text => { $('songStatus').textContent = text; };
    const controls = loading => {
      busy = loading;
      $('songFile').disabled = loading; $('songExample').disabled = loading;
      $('analyzeSong').disabled = loading || !selected; $('cancelSong').disabled = !loading;
      $('songProgress').hidden = !loading;
    };
    function release() {
      clearTimeout(timeout); timeout = null;
      worker?.terminate(); worker = null;
      const old = context; context = null;
      if (old && old.state !== 'closed') old.close().catch(() => {});
    }
    function pause() {
      active = false;
      cancelAnimationFrame(animation); animation = null;
      player.pause();
    }
    function cancel(text = 'Analysis cancelled. You can choose another song or analyze again.') {
      generation++; release(); pause(); controls(false);
      if (text) message(text);
    }
    function choose(file) {
      cancel(''); result = null; selected = null;
      if (url) { URL.revokeObjectURL(url); url = null; }
      player.removeAttribute('src'); player.load(); player.hidden = true;
      if (!file) { message('Choose a song to analyze before playback.'); controls(false); return; }
      if (file.size > 50 * 1024 * 1024) { message('Choose an audio file smaller than 50 MB.'); controls(false); return; }
      selected = file; controls(false);
      message(`${file.name} selected. Choose Analyze song to prepare the notes.`);
    }
    function render() {
      if (!result || !active) return;
      const index = Math.min(result.frames.length - 1, Math.max(0, Math.round(player.currentTime * 1000 / result.hopMs)));
      api.onFrame(result.frames[index], result.frames, index, player.currentTime * 1000);
    }
    function tick() {
      render();
      if (!player.paused && !player.ended) animation = requestAnimationFrame(tick);
    }
    async function analyze() {
      if (!selected || busy) return;
      api.onStart(); pause(); result = null; player.hidden = true;
      api.onStatus('Analyzing song');
      const job = ++generation, file = selected;
      controls(true); $('songProgress').value = 0;
      message('Decoding audio on your device…');
      try {
        context = new (window.AudioContext || window.webkitAudioContext)();
        const decoder = context;
        const bytes = await file.arrayBuffer();
        if (job !== generation) return;
        const decoded = await decoder.decodeAudioData(bytes);
        if (job !== generation) return;
        await decoder.close();
        if (job !== generation) return;
        if (context === decoder) context = null;
        if (!decoded.length || decoded.duration > 600) throw new Error('Choose a non-empty song up to 10 minutes long.');
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OfflineContext) throw new Error('Audio-file analysis needs OfflineAudioContext. Try current desktop Chrome.');
        const renderer = new OfflineContext(1, Math.ceil(decoded.duration * 16000), 16000);
        const source = renderer.createBufferSource(); source.buffer = decoded;
        source.connect(renderer.destination); source.start();
        const resampled = await renderer.startRendering();
        if (job !== generation) return;
        const samples = resampled.getChannelData(0).slice();
        const options = { ...api.getSettings() };
        let phase = 'init';
        const startAnalysis = neural => {
          if (job !== generation || phase !== 'init') return;
          phase = 'analysis'; clearTimeout(timeout);
          message(neural ? 'Analyzing song · 0% · preparing notes for playback…' : 'Neural model unavailable · analyzing with YIN · 0%…');
          worker.postMessage({ type: 'analyze-song', samples, options }, [samples.buffer]);
        };
        const fail = text => {
          if (job !== generation) return;
          cancel(text); api.onStatus('File analysis failed');
        };
        const attach = () => {
          worker = new Worker(new URL('./vocal-accuracy/neural-worker.js', location.href));
          worker.onerror = () => fail('Song analysis worker failed. Try a shorter file or reload the page.');
          worker.onmessage = ({ data }) => {
            if (job !== generation) return;
            if (data.type === 'ready') startAnalysis(true);
            else if (data.type === 'error') {
              if (phase === 'init') startAnalysis(false);
              else fail(data.message || 'Could not analyze this audio file.');
            } else if (data.type === 'song-progress') {
              const percentage = Math.min(99, Math.floor(data.progress * 100));
              $('songProgress').value = percentage;
              message(`Analyzing song · ${percentage}% · keep this page open…`);
            } else if (data.type === 'song-complete') {
              result = data; release(); controls(false);
              if (url) URL.revokeObjectURL(url);
              url = URL.createObjectURL(file); player.src = url; player.hidden = false;
              message(`Ready · ${file.name} · ${data.duration.toFixed(1)} seconds · ${Math.round(data.coverage * 100)}% pitch coverage · ${data.neural ? 'YIN + CREPE' : 'YIN only'}. Press play.`);
              api.onStatus('File ready · press play');
            }
          };
        };
        attach();
        message('Preparing the local pitch model…');
        worker.postMessage({ type: 'init',
          runtimeURL: new URL('./vocal-accuracy/tfjs-4.22.0.min.js', location.href).href,
          modelURL: new URL('./crepe/model/model.json', location.href).href,
          wasmURL: new URL('./vocal-accuracy/tfjs-backend-wasm-4.22.0.min.js', location.href).href,
          wasmPath: new URL('./vocal-accuracy/', location.href).href });
        timeout = setTimeout(() => {
          if (job !== generation || phase !== 'init') return;
          worker.terminate(); attach(); startAnalysis(false);
        }, 20000);
      } catch (error) {
        if (job === generation) { cancel(error.message || 'Could not decode this audio file.'); api.onStatus('File analysis failed'); }
      }
    }
    $('songFile').addEventListener('change', () => choose($('songFile').files[0]));
    $('analyzeSong').addEventListener('click', analyze);
    $('cancelSong').addEventListener('click', () => { cancel(); api.onStatus('File analysis cancelled'); });
    $('songExample').addEventListener('click', async () => {
      if (busy) return;
      const job = ++generation;
      controls(true); message('Loading song_test.mp3…');
      try {
        const response = await fetch(new URL('./song_test.mp3', location.href));
        if (!response.ok) throw new Error('Could not load song_test.mp3. Choose it with the file picker instead.');
        const blob = await response.blob();
        if (job !== generation) return;
        choose(new File([blob], 'song_test.mp3', { type: blob.type || 'audio/mpeg' }));
        await analyze();
      } catch (error) { if (job === generation) cancel(error.message); }
    });
    player.addEventListener('play', () => {
      if (!result) { player.pause(); return; }
      api.onStart(); active = true;
      api.onStatus('Playing analyzed song');
      cancelAnimationFrame(animation); tick();
    });
    player.addEventListener('pause', () => {
      cancelAnimationFrame(animation); animation = null;
      if (active) { render(); api.onStatus(player.ended ? 'Song finished' : 'Song paused'); }
    });
    player.addEventListener('ended', () => { cancelAnimationFrame(animation); animation = null; if (active) api.onStatus('Song finished'); });
    player.addEventListener('seeked', render);
    player.addEventListener('timeupdate', () => { if (player.paused) render(); });
    player.addEventListener('error', () => { if (result) message('This browser could not play the selected file. Try MP3 or WAV.'); });
    controls(false);
    return {
      pause,
      refresh: render,
      deactivate() { if (busy) cancel(); else pause(); },
      invalidate() {
        if (busy || result) {
          cancel('Input range or threshold changed. Analyze the song again to apply it.');
          result = null; player.hidden = true; api.onStatus('File needs analysis');
        }
      },
      dispose() { cancel(''); if (url) URL.revokeObjectURL(url); }
    };
  }
  return { mount };
})();
