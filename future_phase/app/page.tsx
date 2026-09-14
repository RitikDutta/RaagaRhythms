"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PracticeMode = "pakad" | "aaroh" | "bandish" | "meend";
type InputMode = "idle" | "mic" | "tab" | "demo";

const ROOTS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const ROOT_FREQUENCIES = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392, 415.3, 440, 466.16, 493.88];
const SWARAS = ["Sa", "re", "Re", "ga", "Ga", "Ma", "Mā", "Pa", "dha", "Dha", "ni", "Ni"];

const PRACTICE_MODES: Record<PracticeMode, { label: string; hint: string; notes: number[] }> = {
  pakad: {
    label: "Pakad",
    hint: "Ni Re Ga · Re Sa · Pa Mā Ga Re Sa",
    notes: [11, 14, 16, 14, 12, 19, 18, 16, 14, 12],
  },
  aaroh: {
    label: "Aaroh–Avroh",
    hint: "Ni Re Ga Mā Pa Dha Ni Sa' · Sa' Ni Dha Pa Mā Ga Re Sa",
    notes: [11, 14, 16, 18, 19, 21, 23, 24, 23, 21, 19, 18, 16, 14, 12],
  },
  bandish: {
    label: "Bandish",
    hint: "Eri aali piya bina · sustained sthayi phrase",
    notes: [14, 16, 18, 19, 18, 16, 14, 11, 12, 14, 16, 14],
  },
  meend: {
    label: "Meend",
    hint: "Glide slowly from Ni to Re, settling on Ga",
    notes: [11, 11.8, 12.8, 14, 14.7, 16, 16, 15.2, 14],
  },
};

const RAAGAS = [
  { id: "yaman", name: "Yaman", time: "Evening", thaat: "Kalyan", mood: "Luminous devotion", vadi: "Ga", color: "teal", aroh: "Ni Re Ga Mā Pa Dha Ni Sa′", avroh: "Sa′ Ni Dha Pa Mā Ga Re Sa", pakad: "Ni Re Ga · Re Sa · Pa Mā Ga Re Sa", reference: "Chhupa Lo Yun Dil Mein", cue: "Notice how Teevra Ma opens into Pa before returning to Ga.", concept: "Meend" },
  { id: "bhairav", name: "Bhairav", time: "Morning", thaat: "Bhairav", mood: "Grave serenity", vadi: "Dha", color: "clay", aroh: "Sa re Ga Ma Pa dha Ni Sa′", avroh: "Sa′ Ni dha Pa Ma Ga re Sa", pakad: "Ga Ma re Sa · Sa dha dha Pa", reference: "Mohe Bhool Gaye Sanwariya", cue: "Listen for the gentle oscillation on komal Re and komal Dha.", concept: "Andolan" },
  { id: "bageshri", name: "Bageshri", time: "Night", thaat: "Kafi", mood: "Tender longing", vadi: "Ma", color: "indigo", aroh: "Sa ga Ma Dha ni Sa′", avroh: "Sa′ ni Dha Ma Pa Dha Ma ga Re Sa", pakad: "Dha ni Sa′ · Ma ga Re Sa", reference: "Radha Na Bole Na Bole Re", cue: "Feel the inward pull of komal Ga as the phrase settles on Ma.", concept: "Murki" },
  { id: "bhupali", name: "Bhupali", time: "Evening", thaat: "Kalyan", mood: "Quiet wonder", vadi: "Ga", color: "gold", aroh: "Sa Re Ga Pa Dha Sa′", avroh: "Sa′ Dha Pa Ga Re Sa", pakad: "Ga Re Sa · Dha Sa Re Ga", reference: "Jyoti Kalash Chhalke", cue: "Only five swaras—clarity comes from phrasing, not complexity.", concept: "Alap" },
  { id: "darbari", name: "Darbari Kanada", time: "Night", thaat: "Asavari", mood: "Majestic depth", vadi: "Re", color: "midnight", aroh: "Sa Re ga Ma Pa dha ni Sa′", avroh: "Sa′ dha ni Pa Ma ga Ma Re Sa", pakad: "Re ga~ga Ma · Pa · Ma ga~ga Re Sa", reference: "O Duniya Ke Rakhwale", cue: "The slow andolan on komal Ga gives Darbari its unmistakable weight.", concept: "Andolan" },
  { id: "desh", name: "Desh", time: "Night", thaat: "Khamaj", mood: "Romantic openness", vadi: "Re", color: "sky", aroh: "Sa Re Ma Pa Ni Sa′", avroh: "Sa′ ni Dha Pa Ma Ga Re Ga Sa", pakad: "Re Ma Pa · Ni Dha Pa · Dha Ma Ga Re", reference: "Vande Mataram", cue: "Hear the contrast between shuddha Ni upward and komal ni downward.", concept: "Kan swar" },
];

const CONCEPTS = [
  { name: "Meend", mark: "∿", definition: "A continuous glide that connects two swaras without breaking the breath.", exercise: "Slide Sa → Ga in one smooth arc" },
  { name: "Andolan", mark: "≈", definition: "A slow, deliberate oscillation around a swara that gives a raag its gravity.", exercise: "Hold komal Re and orbit gently" },
  { name: "Gamak", mark: "〰", definition: "A forceful, controlled oscillation produced with clear rhythmic energy.", exercise: "Pulse Ga–Ma with equal weight" },
  { name: "Kan swar", mark: "↝", definition: "A grace note touched briefly before arriving at the intended swara.", exercise: "Brush Re before settling on Ga" },
];

const RAAG_SIGNATURES: Record<string, { scale: number[]; pakad: number[] }> = {
  yaman: { scale: [11, 14, 16, 18, 19, 21, 23, 24], pakad: [11, 14, 16, 14, 12, 19, 18, 16, 14, 12] },
  bhairav: { scale: [12, 13, 16, 17, 19, 20, 23, 24], pakad: [16, 17, 13, 12, 12, 20, 20, 19] },
  bageshri: { scale: [12, 15, 17, 21, 22, 24], pakad: [21, 22, 24, 17, 15, 14, 12] },
  bhupali: { scale: [12, 14, 16, 19, 21, 24], pakad: [16, 14, 12, 21, 24, 14, 16] },
  darbari: { scale: [12, 14, 15, 17, 19, 20, 22, 24], pakad: [14, 15, 15.3, 17, 19, 17, 15.2, 14, 12] },
  desh: { scale: [12, 14, 17, 19, 23, 24], pakad: [14, 17, 19, 23, 21, 19, 17, 16, 14, 12] },
};

function targetNotesFor(raagId: string, mode: PracticeMode) {
  const signature = RAAG_SIGNATURES[raagId] ?? RAAG_SIGNATURES.yaman;
  if (mode === "aaroh") return [...signature.scale, ...signature.scale.slice(0, -1).reverse()];
  if (mode === "bandish") return [...signature.pakad.slice(0, 5), ...signature.scale.slice(2, 6), ...signature.pakad.slice(-5)];
  if (mode === "meend") {
    const anchors = signature.pakad.slice(0, 5);
    return anchors.flatMap((note, index) => index === anchors.length - 1 ? [note] : [note, note + (anchors[index + 1] - note) / 3, note + (anchors[index + 1] - note) * 2 / 3]);
  }
  return signature.pakad;
}

function frequencyToNote(frequency: number, saFrequency: number) {
  const semitones = 12 * Math.log2(frequency / saFrequency);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const normalized = ((rounded % 12) + 12) % 12;
  const octaveOffset = Math.floor(rounded / 12);
  return {
    swara: SWARAS[normalized],
    cents,
    semitones,
    octave: octaveOffset > 0 ? "tār" : octaveOffset < 0 ? "mandra" : "madhya",
  };
}

function autoCorrelate(buffer: Float32Array<ArrayBuffer>, sampleRate: number) {
  let rms = 0;
  for (let index = 0; index < buffer.length; index += 1) rms += buffer[index] * buffer[index];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.012) return -1;

  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.min(Math.floor(sampleRate / 65), Math.floor(buffer.length / 2));
  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let index = 0; index < buffer.length - lag; index += 1) {
      correlation += buffer[index] * buffer[index + lag];
    }
    correlation /= buffer.length - lag;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  return bestLag > 0 && bestCorrelation > 0.01 ? sampleRate / bestLag : -1;
}

function smoothPath(values: number[], width = 760, height = 240) {
  if (!values.length) return "";
  const min = 8;
  const max = 26;
  const points = values.map((value, index) => ({
    x: 30 + (index / Math.max(values.length - 1, 1)) * (width - 60),
    y: height - 24 - ((value - min) / (max - min)) * (height - 54),
  }));
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export default function Home() {
  const [mode, setMode] = useState<PracticeMode>("pakad");
  const [rootIndex, setRootIndex] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>("idle");
  const [frequency, setFrequency] = useState<number | null>(null);
  const [pitchHistory, setPitchHistory] = useState<number[]>([]);
  const [previewProgress, setPreviewProgress] = useState(24);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [timeFilter, setTimeFilter] = useState("All");
  const [selectedRaagId, setSelectedRaagId] = useState("yaman");
  const [plannerGoal, setPlannerGoal] = useState("Sur stability");
  const [journalSaved, setJournalSaved] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const saFrequency = ROOT_FREQUENCIES[rootIndex];
  const currentNote = frequency ? frequencyToNote(frequency, saFrequency) : null;
  const target = PRACTICE_MODES[mode];
  const selectedRaag = RAAGAS.find((raag) => raag.id === selectedRaagId) ?? RAAGAS[0];
  const targetNotes = useMemo(() => targetNotesFor(selectedRaag.id, mode), [selectedRaag.id, mode]);
  const targetPath = useMemo(() => smoothPath(targetNotes), [targetNotes]);
  const livePath = useMemo(() => smoothPath(pitchHistory.slice(-80)), [pitchHistory]);
  const accuracy = currentNote ? Math.max(0, 100 - Math.min(100, Math.abs(currentNote.cents) * 1.4)) : 0;
  const visibleRaagas = timeFilter === "All" ? RAAGAS : RAAGAS.filter((raag) => raag.time === timeFilter);
  const practiceHint = mode === "pakad" ? selectedRaag.pakad : mode === "aaroh" ? `${selectedRaag.aroh} · ${selectedRaag.avroh}` : mode === "bandish" ? `${selectedRaag.reference} · guided contour` : `${selectedRaag.concept} · connect each swara without a break`;

  const stopListening = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (demoTimerRef.current) clearInterval(demoTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setInputMode("idle");
    setFrequency(null);
  }, []);

  useEffect(() => stopListening, [stopListening]);

  const analyseStream = useCallback(async (stream: MediaStream, nextMode: "mic" | "tab") => {
    stopListening();
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    audioContextRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    streamRef.current = stream;
    setPitchHistory([]);
    setInputMode(nextMode);

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      const detected = autoCorrelate(samples, context.sampleRate);
      if (detected > 0) {
        setFrequency(detected);
        const relative = 12 + 12 * Math.log2(detected / saFrequency);
        setPitchHistory((history) => [...history.slice(-79), Math.max(8, Math.min(26, relative))]);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();
    stream.getTracks().forEach((track) => track.addEventListener("ended", stopListening));
  }, [saFrequency, stopListening]);

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await analyseStream(stream, "mic");
    } catch {
      setInputMode("idle");
    }
  }

  async function startTabAudio() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      await analyseStream(stream, "tab");
    } catch {
      setInputMode("idle");
    }
  }

  function startDemo() {
    stopListening();
    setInputMode("demo");
    setPitchHistory([]);
    let index = 0;
    demoTimerRef.current = setInterval(() => {
      const note = targetNotes[index % targetNotes.length];
      const drift = Math.sin(index * 1.7) * 0.12;
      const relative = note + drift;
      setFrequency(saFrequency * 2 ** ((relative - 12) / 12));
      setPitchHistory((history) => [...history.slice(-79), relative]);
      index += 1;
    }, 185);
  }

  function playPiano(semitone: number) {
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = saFrequency * 2 ** (semitone / 12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.85);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.9);
  }

  function togglePreview() {
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
    if (isPreviewPlaying) {
      setIsPreviewPlaying(false);
      return;
    }
    setIsPreviewPlaying(true);
    const melody = [0, 2, 4, 6, 7, 11, 9, 7, 6, 4, 2, 0];
    let index = 0;
    previewTimerRef.current = setInterval(() => {
      playPiano(melody[index % melody.length]);
      setPreviewProgress((progress) => (progress >= 98 ? 8 : progress + 4));
      index += 1;
    }, 620);
  }

  function openForPractice(id: string) {
    setSelectedRaagId(id);
    setMode("pakad");
    setPitchHistory([]);
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
  }

  function saveJournalEntry() {
    window.localStorage.setItem("raagarhythms-last-session", JSON.stringify({ raag: selectedRaag.name, goal: plannerGoal, savedAt: new Date().toISOString() }));
    setJournalSaved(true);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="RaagaRhythms home">RaagaRhythms</a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#explore">Explore</a>
          <a href="#learn">Learn</a>
          <a href="#studio">Riyaz Studio</a>
          <a href="#journal">Journal</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button" aria-label="Search">⌕</button>
          <button className="avatar" aria-label="Open profile">R</button>
        </div>
      </header>

      <section className="hero page-shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Indian classical music, made visible</p>
          <h1>Listen deeper.<br />Sing with intention.</h1>
          <p className="hero-text">Explore raagas, understand their soul, and elevate your voice through mindful, visual practice.</p>
          <div className="hero-actions">
            <a className="button primary" href="#explore">Explore Raagas</a>
            <a className="button secondary" href="#studio">Open Riyaz Studio</a>
          </div>
        </div>

        <article className="raag-hero-card" aria-label="Featured Raag Yaman">
          <div className="raag-card-glow" />
          <div className="moon" />
          <div className="dome dome-one" /><div className="dome dome-two" /><div className="dome dome-three" />
          <div className="raag-card-content">
            <p className="card-kicker">Now exploring</p>
            <h2>Yaman</h2>
            <p>An evening raag of devotion and luminous calm</p>
            <div className="player-row">
              <button className="play-button" onClick={togglePreview} aria-label={isPreviewPlaying ? "Pause Yaman preview" : "Play Yaman preview"}>{isPreviewPlaying ? "Ⅱ" : "▶"}</button>
              <div className="progress-wrap">
                <div className="progress-line"><span style={{ width: `${previewProgress}%` }} /></div>
                <div className="time-row"><span>{isPreviewPlaying ? "Playing a Yaman phrase" : "Tap to hear the swaras"}</span><span>08:32</span></div>
              </div>
            </div>
            <div className="raag-tags"><span>Kalyan Thaat</span><span>Evening</span><span>Teevra Ma</span></div>
          </div>
        </article>
      </section>

      <section className="studio-section page-shell" id="studio">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Living pitch studio</p>
            <h2>See the phrase. Then become it.</h2>
          </div>
          <p>Choose a musical idea, set your Sa, and sing. Your live pitch appears against the raag’s intended movement—not just the nearest Western note.</p>
        </div>

        <div className="studio-toolbar">
          <div className="mode-tabs" role="tablist" aria-label="Practice phrase">
            {(Object.keys(PRACTICE_MODES) as PracticeMode[]).map((key) => (
              <button key={key} className={mode === key ? "selected" : ""} onClick={() => { setMode(key); setPitchHistory([]); }} role="tab" aria-selected={mode === key}>
                <span>{key === "aaroh" ? "↗" : key === "pakad" ? "⌁" : key === "bandish" ? "▥" : "∿"}</span>{PRACTICE_MODES[key].label}
              </button>
            ))}
          </div>
          <div className="sa-control">
            <label htmlFor="sa-root">Your Sa</label>
            <select id="sa-root" value={rootIndex} onChange={(event) => { setRootIndex(Number(event.target.value)); setPitchHistory([]); }}>
              {ROOTS.map((root, index) => <option key={root} value={index}>{root} · {ROOT_FREQUENCIES[index].toFixed(1)} Hz</option>)}
            </select>
          </div>
        </div>

        <div className="pitch-stage">
          <div className="stage-topline">
            <div><span className="live-dot" data-live={inputMode !== "idle"} />{inputMode === "idle" ? "Ready to listen" : inputMode === "tab" ? "Listening to shared tab" : inputMode === "demo" ? "Guided phrase demo" : "Listening to your voice"}</div>
            <p><strong>{selectedRaag.name} · {target.label}</strong>{practiceHint}</p>
          </div>

          <div className="graph-wrap">
            <img className="sitar-asset" src="/sitar-graph-instrument.png" alt="Decorative tanpura forming the beginning of the pitch line" />
            <div className="graph-canvas">
              <div className="swara-grid" aria-hidden="true">
                {["Sa", "Re", "Ga", "Mā", "Pa", "Dha", "Ni", "Sa′"].map((swara) => <span key={swara}>{swara}</span>)}
              </div>
              <svg viewBox="0 0 760 240" preserveAspectRatio="none" role="img" aria-label={`Target ${target.label} and live vocal pitch graph`}>
                <defs>
                  <linearGradient id="targetGlow" x1="0" x2="1"><stop stopColor="#d16738" /><stop offset="1" stopColor="#245b57" /></linearGradient>
                </defs>
                <path className="target-shadow" d={targetPath} />
                <path className="target-path" d={targetPath} />
                {livePath && <path className="live-path" d={livePath} />}
              </svg>
            </div>
            <aside className="note-readout" aria-live="polite">
              <span className="wave-icon">∿</span>
              <div>
                <strong>{currentNote?.swara ?? "Sa"} <i>•</i> {frequency ? `${frequency.toFixed(1)} Hz` : ROOTS[rootIndex]}</strong>
                <span>{currentNote ? `${currentNote.cents > 0 ? "+" : ""}${currentNote.cents} cents · ${currentNote.octave}` : "waiting for pitch"}</span>
              </div>
            </aside>
          </div>

          <div className="studio-footer">
            <div className="input-actions">
              {inputMode === "idle" ? (
                <>
                  <button className="button primary compact" onClick={startMic}>Use microphone</button>
                  <button className="button secondary compact" onClick={startTabAudio}>Share tab audio</button>
                  <button className="text-button" onClick={startDemo}>Try a live demo →</button>
                </>
              ) : <button className="button stop compact" onClick={stopListening}>Stop listening</button>}
            </div>
            <div className="accuracy"><span>Pitch steadiness</span><strong>{Math.round(accuracy)}%</strong><div><i style={{ width: `${accuracy}%` }} /></div></div>
          </div>
        </div>

        <div className="keyboard-panel">
          <div className="keyboard-copy"><span>Find your Sa</span><p>Play notes, match comfortably, then set that pitch above.</p></div>
          <div className="piano" aria-label="Playable one octave keyboard">
            {[0, 2, 4, 5, 7, 9, 11, 12].map((note, index) => <button key={note} className="white-key" onClick={() => playPiano(note)} aria-label={`Play ${["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni", "Sa high"][index]}`}><span>{["S", "R", "G", "M", "P", "D", "N", "S′"][index]}</span></button>)}
            {[1, 3, 6, 8, 10].map((note, index) => <button key={note} className={`black-key black-${index + 1}`} onClick={() => playPiano(note)} aria-label={`Play chromatic note ${index + 1}`} />)}
          </div>
        </div>
      </section>

      <section className="explore-section" id="explore">
        <div className="page-shell">
          <div className="explore-heading">
            <div>
              <p className="eyebrow">Raag library</p>
              <h2>A universe of moods,<br />one swara at a time.</h2>
            </div>
            <div className="time-filter" aria-label="Filter raagas by time">
              {["All", "Morning", "Evening", "Night"].map((time) => <button key={time} className={timeFilter === time ? "selected" : ""} onClick={() => setTimeFilter(time)} aria-pressed={timeFilter === time}>{time}</button>)}
            </div>
          </div>

          <div className="raag-library-layout">
            <div className="raag-grid">
              {visibleRaagas.map((raag) => (
                <button key={raag.id} className={`raag-tile ${raag.color} ${selectedRaagId === raag.id ? "selected" : ""}`} onClick={() => setSelectedRaagId(raag.id)} aria-pressed={selectedRaagId === raag.id}>
                  <span className="tile-time">{raag.time}</span>
                  <strong>{raag.name}</strong>
                  <span className="tile-mood">{raag.mood}</span>
                  <span className="tile-footer"><i>{raag.thaat} Thaat</i><b>Vadi · {raag.vadi}</b></span>
                </button>
              ))}
            </div>

            <article className="raag-detail-panel" aria-live="polite">
              <div className="detail-title"><div><span>Selected raag</span><h3>{selectedRaag.name}</h3></div><b>{selectedRaag.time}</b></div>
              <p className="detail-mood">{selectedRaag.mood} · {selectedRaag.thaat} Thaat</p>
              <dl>
                <div><dt>Aaroh</dt><dd>{selectedRaag.aroh}</dd></div>
                <div><dt>Avroh</dt><dd>{selectedRaag.avroh}</dd></div>
                <div><dt>Pakad</dt><dd>{selectedRaag.pakad}</dd></div>
              </dl>
              <div className="listening-cue"><span>Listening cue · {selectedRaag.concept}</span><strong>{selectedRaag.reference}</strong><p>{selectedRaag.cue}</p></div>
              <button className="button light" onClick={() => openForPractice(selectedRaag.id)}>Practise this Pakad <span>↗</span></button>
            </article>
          </div>
        </div>
      </section>

      <section className="concept-section page-shell" id="learn">
        <div className="section-heading concept-heading">
          <div><p className="eyebrow">The grammar of expression</p><h2>Learn what lives<br />between the notes.</h2></div>
          <p>Swaras tell you where the melody is. Ornamentation tells you how it moves. Each concept includes a visual gesture and a focused vocal exercise.</p>
        </div>
        <div className="concept-grid">
          {CONCEPTS.map((concept, index) => <article className="concept-card" key={concept.name}>
            <div className="concept-top"><span>0{index + 1}</span><b>{concept.mark}</b></div>
            <h3>{concept.name}</h3><p>{concept.definition}</p>
            <div className="concept-exercise"><span>Try it</span>{concept.exercise}</div>
          </article>)}
        </div>
      </section>

      <section className="plan-section">
        <div className="page-shell plan-layout">
          <div className="plan-copy">
            <p className="eyebrow">Adaptive Riyaz path</p>
            <h2>A meaningful 20 minutes,<br />made for today.</h2>
            <p>Choose your focus and RaagaRhythms reshapes the session—from tuning your Sa to applying the phrase in a real musical context.</p>
            <div className="goal-picker" aria-label="Choose practice goal">
              {["Sur stability", "Raag fluency", "Voice agility"].map((goal) => <button key={goal} onClick={() => setPlannerGoal(goal)} className={plannerGoal === goal ? "selected" : ""} aria-pressed={plannerGoal === goal}>{goal}</button>)}
            </div>
          </div>
          <div className="practice-plan">
            <div className="plan-header"><span>Today · {plannerGoal}</span><strong>20 min</strong></div>
            <ol>
              <li className="done"><span>01</span><div><strong>Arrive at your Sa</strong><p>Tanpura + long-note centering</p></div><b>3 min</b></li>
              <li><span>02</span><div><strong>Steady the swaras</strong><p>Sa · Ga · Pa visual holds</p></div><b>5 min</b></li>
              <li><span>03</span><div><strong>{selectedRaag.name} phrase lab</strong><p>{selectedRaag.concept} through the Pakad</p></div><b>8 min</b></li>
              <li><span>04</span><div><strong>Listen back & reflect</strong><p>Compare target and recorded contour</p></div><b>4 min</b></li>
            </ol>
            <button className="button primary" onClick={() => openForPractice(selectedRaag.id)}>Begin today’s Riyaz</button>
          </div>
        </div>
      </section>

      <section className="journal-section page-shell" id="journal">
        <div className="journal-card">
          <div className="journal-copy"><p className="eyebrow">Your practice journal</p><h2>Progress you can hear<br />and see.</h2><p>Save a snapshot of today’s Raag, goal, steadiness, and pitch contour locally on this device.</p><button className="button secondary" onClick={saveJournalEntry}>{journalSaved ? "Session saved ✓" : "Save today’s session"}</button></div>
          <div className="journal-stats">
            <div><span>Current streak</span><strong>7 <i>days</i></strong><small>Personal best</small></div>
            <div><span>This week</span><strong>84 <i>min</i></strong><small>+18% from last week</small></div>
            <div><span>Steadiest swara</span><strong>Pa</strong><small>± 9 cents average</small></div>
          </div>
          <div className="week-chart" aria-label="Weekly practice chart"><span style={{height:"38%"}}>M</span><span style={{height:"63%"}}>T</span><span style={{height:"48%"}}>W</span><span style={{height:"82%"}}>T</span><span style={{height:"71%"}}>F</span><span style={{height:"91%"}}>S</span><span className="today" style={{height:"56%"}}>S</span></div>
        </div>
      </section>

      <footer>
        <div className="page-shell footer-inner"><div><a className="brand" href="#top">RaagaRhythms</a><p>Indian classical music, made visible.</p></div><div className="footer-links"><a href="#explore">Explore</a><a href="#learn">Learn</a><a href="#studio">Riyaz Studio</a><a href="#journal">Journal</a></div><span>Designed for curious ears.</span></div>
      </footer>
    </main>
  );
}
