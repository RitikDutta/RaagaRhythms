// --- Configuration ---
const NOTES = [
    "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2",
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
];
const SARGAM_BASE = {
    "C": "S", "C#": "r", "D": "R", "D#": "g", "E": "G", "F": "M",
    "F#": "m", "G": "P", "G#": "d", "A": "D", "A#": "n", "B": "N"
};
function getSargamNotation(note) { /* ... no change ... */
    if (!note || note.length < 2) return { indian: '', western: note };
    const noteName = note.slice(0, -1); const octave = parseInt(note.slice(-1));
    const sargamBase = SARGAM_BASE[noteName] || '?'; let indianNote = sargamBase;
    const octaveOffset = octave - 3;
    if (octaveOffset > 0) { indianNote += String(octaveOffset); }
    else if (octaveOffset < 0) { indianNote += '0'.repeat(Math.abs(octaveOffset)); }
    return { indian: indianNote, western: note };
}
let WESTERN_NOTE_MAP = {};
function createWesternNoteMap() { /* ... no change ... */
    WESTERN_NOTE_MAP = {};
    NOTES.forEach(westernNote => {
        const { indian: sargamWithOctave } = getSargamNotation(westernNote); let baseSargam = null;
        if(westernNote.endsWith('3')) { const noteName = westernNote.slice(0, -1); baseSargam = SARGAM_BASE[noteName] || null; }
        if (sargamWithOctave && !WESTERN_NOTE_MAP[sargamWithOctave]) { WESTERN_NOTE_MAP[sargamWithOctave] = westernNote; }
        if (baseSargam && !WESTERN_NOTE_MAP[baseSargam]) { WESTERN_NOTE_MAP[baseSargam] = westernNote; }
    });
}
createWesternNoteMap();

const A4_FREQUENCY = 440;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Audio Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
const activeNotes = {};
let convolver = null; let dryGain = null; let wetGain = null; let reverbAmount = 0.1;
const VIBRATO_RATE = 5; const VIBRATO_DEPTH = 0.005;

function initAudioContext() { /* ... no change ... */
    if (!audioCtx) {
        try {
            audioCtx = new AudioContext(); console.log("AudioContext initialized.");
            convolver = audioCtx.createConvolver(); dryGain = audioCtx.createGain(); wetGain = audioCtx.createGain();
            dryGain.connect(audioCtx.destination); convolver.connect(wetGain); wetGain.connect(audioCtx.destination);
            dryGain.gain.setValueAtTime(1.0 - reverbAmount, audioCtx.currentTime); wetGain.gain.setValueAtTime(reverbAmount, audioCtx.currentTime);
            const sampleRate = audioCtx.sampleRate; const duration = 1.5; const decay = 3.0; const length = sampleRate * duration;
            const impulse = audioCtx.createBuffer(2, length, sampleRate); const left = impulse.getChannelData(0); const right = impulse.getChannelData(1);
            for (let i = 0; i < length; i++) { const noise = Math.random() * 2 - 1; const envelope = Math.pow(1 - i / length, decay); left[i] = noise * envelope; right[i] = noise * envelope; }
            convolver.buffer = impulse; console.log("Synthetic Impulse Response generated.");
        } catch (e) { alert('Web Audio API init failed.'); console.error("AudioContext/Reverb Error:", e); return false; }
    }
    if (audioCtx.state === 'suspended') { audioCtx.resume().then(() => { console.log("AudioContext resumed."); }); }
    return true;
}

// --- Global Pitch Shift Control ---
const pitchSelect = document.getElementById('pitchSelect');
let globalPitchShiftSemitones = pitchSelect ? parseInt(pitchSelect.value) : 0;

// --- Frequency Calculation ---
function getFrequency(note) { /* ... no change ... */
    if (!note || note.length < 2) return 0;
    const noteName = note.slice(0, -1); const octave = parseInt(note.slice(-1));
    const noteIndex = NOTE_NAMES.indexOf(noteName); if (noteIndex === -1) { console.warn(`Note name not found: ${noteName}`); return 0; }
    const semitonesFromA4_standard = (octave - 4) * 12 + (noteIndex - 9);
    const adjustedSemitonesFromA4 = semitonesFromA4_standard + globalPitchShiftSemitones;
    return A4_FREQUENCY * Math.pow(2, adjustedSemitonesFromA4 / 12);
}

// --- Note Playback Control (Manual Piano Keys) ---
const ATTACK_TIME = 0.02; const RELEASE_TIME = 0.15;
function startNoteInternal(note, frequency) { /* ... connects gain to dryGain & convolver - no change ... */
     if (!audioCtx || !dryGain || !convolver) return;
    const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode); gainNode.connect(dryGain); gainNode.connect(convolver); // Connect to reverb mix
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + ATTACK_TIME);
    oscillator.start(audioCtx.currentTime); activeNotes[note] = { oscillator, gainNode };
 }
function startNote(note) { /* ... no change ... */
    if (!initAudioContext() || !audioCtx) return; if (activeNotes[note]) return;
    const frequency = getFrequency(note); if (frequency <= 0) return;
    if (audioCtx.state === 'suspended') { audioCtx.resume().then(() => startNoteInternal(note, frequency)); }
    else { startNoteInternal(note, frequency); }
}
function stopNote(note) { /* ... no change ... */
    if (!audioCtx) return; const noteData = activeNotes[note];
    if (noteData) {
        const { oscillator, gainNode } = noteData; const now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now); gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + RELEASE_TIME);
        oscillator.stop(now + RELEASE_TIME + 0.05); delete activeNotes[note];
    }
}

// --- Sequence Playback ---
const SEQUENCE_NOTE_DURATION = 0.4; const SEQUENCE_PAUSE_DURATION = 0.2;
const QUICK_TRANSITION_OVERLAP = 0.06; const SEQUENCE_ATTACK = 0.02; const SEQUENCE_RELEASE = 0.1;

const speedSlider = document.getElementById('speedSlider'); const speedValueDisplay = document.getElementById('speedValue');
let currentSpeedFactor = speedSlider ? parseFloat(speedSlider.value) : 1.0;
const reverbSlider = document.getElementById('reverbSlider'); const reverbValueDisplay = document.getElementById('reverbValue');

// Playback function for sequence notes (handles Gamak)
function playSequenceNote(frequency, startTime, duration, addGamak = false) { /* ... connects to reverb mix, adds LFO if needed - no change ... */
    if (!audioCtx || frequency <= 0 || duration <= 0 || !dryGain || !convolver) return;
    try { // Add try-catch for safety
        const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); let lfo = null; let lfoGain = null;
        oscillator.connect(gainNode); gainNode.connect(dryGain); gainNode.connect(convolver); // Connect to reverb
        oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, startTime);
        if (addGamak) {
            lfo = audioCtx.createOscillator(); lfoGain = audioCtx.createGain(); lfo.frequency.setValueAtTime(VIBRATO_RATE, startTime);
            const depthInHz = frequency * VIBRATO_DEPTH; lfoGain.gain.setValueAtTime(depthInHz, startTime);
            lfo.connect(lfoGain); lfoGain.connect(oscillator.frequency); lfo.start(startTime);
        }
        const actualAttack = Math.min(SEQUENCE_ATTACK, duration * 0.3); const actualRelease = Math.min(SEQUENCE_RELEASE, duration * 0.4);
        const sustainDuration = duration - actualAttack - actualRelease; gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.8, startTime + actualAttack);
        if (sustainDuration > 0.001) {
             const sustainEndTime = startTime + actualAttack + sustainDuration; if(sustainEndTime > audioCtx.currentTime) { gainNode.gain.setValueAtTime(0.8, sustainEndTime); }
             const releaseStartTime = Math.max(startTime + actualAttack, sustainEndTime); gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + actualRelease);
        } else { const releaseStartTime = startTime + actualAttack; gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + actualRelease); }
        oscillator.start(startTime); const stopTime = startTime + duration + 0.05; oscillator.stop(stopTime);
        if (lfo) { lfo.stop(stopTime); }
    } catch (error) { console.error("Error playing sequence note:", error); }
}

// Playback function for Meend (Glide)
function playMeendNote(startFreq, endFreq, startTime, duration) { /* ... connects to reverb mix - no change ... */
    if (!audioCtx || startFreq <= 0 || endFreq <= 0 || duration <= 0 || !dryGain || !convolver) return;
    try { // Add try-catch
        const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode); gainNode.connect(dryGain); gainNode.connect(convolver); // Connect to reverb
        oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(startFreq, startTime); oscillator.frequency.linearRampToValueAtTime(endFreq, startTime + duration);
        const attack = Math.min(SEQUENCE_ATTACK, duration * 0.1); const release = Math.min(SEQUENCE_RELEASE, duration * 0.1);
        const sustainDuration = duration - attack - release; const sustainEndTime = startTime + attack + sustainDuration;
        gainNode.gain.setValueAtTime(0, startTime); gainNode.gain.linearRampToValueAtTime(0.7, startTime + attack);
        if (sustainDuration > 0.001) {
            if(sustainEndTime > audioCtx.currentTime) { gainNode.gain.setValueAtTime(0.7, sustainEndTime); }
            const releaseStartTime = Math.max(startTime + attack, sustainEndTime); gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + release);
        } else { const releaseStartTime = startTime + attack; gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + release); }
        oscillator.start(startTime); oscillator.stop(startTime + duration + 0.05);
    } catch (error) { console.error("Error playing meend note:", error); }
}

// Main function to parse and play sequence
function playSequence() {
    if (!initAudioContext() || !audioCtx) { alert("Audio Context not ready..."); return; }
    const speedFactor = currentSpeedFactor;
    const sequenceInput = document.getElementById('sargamInput');
    const playButton = document.getElementById('playSequenceBtn');
    const sequenceText = sequenceInput.value;
    console.log("Input Sequence:", sequenceText); // DEBUG
    if (!sequenceText.trim()) return;

    // --- REFINED Parsing Logic ---
    const tokens = [];
    const notePattern = "[SrRgGmMPdDnN][01]?"; // Base note pattern

    // Regex Breakdown:
    // 1. Meend: Note1 --- Note2
    // 2. Comma: ,
    // 3. Repetition: Note~? repeated (like SSS or RR~R) - More careful matching
    // 4. Quick Transition Note: _ Note ~?
    // 5. Regular Note: Note ~? (Must not be part of above patterns)
    // 6. Whitespace or ignored symbols (_ alone)
    const regex = new RegExp(
        // 1: Meend (Group 1:Start, Group 2:Hyphens, Group 3:End)
        `(${notePattern})(-+)(${notePattern})` +
        // 4: Comma (Group 4)
        `|(\\,)` +
        // 5: Quick Transition Note (Group 5:_, Group 6:Note, Group 7:~?)
        `|(_)\\s*(${notePattern})(~?)` +
        // 8: Regular Note including potential repetitions (Group 8:Note, Group 9:~?, Group 10: Repeats of G8)
        // This will match S, S~, SSS, SS~S etc. Need post-processing
        `|((${notePattern})(~?)(\\8*))` +
        // 12: Whitespace or other ignored characters
        `|(\\s+|_)`, // Match whitespace OR an underscore not followed by a note
        'gi'
    );

    let match;
    let lastIndex = 0; // Track position for error checking
    console.log("--- Starting Tokenization ---"); // DEBUG
    while ((match = regex.exec(sequenceText)) !== null) {
        // Check for unprocessed text between matches (indicates parsing error)
        if (match.index > lastIndex) {
             console.warn(`Skipped unrecognized characters: "${sequenceText.substring(lastIndex, match.index)}"`);
        }
        // console.log("Regex Match:", match); // DEBUG

        if (match[1] && match[2] && match[3]) { // Meend
            console.log(`  Matched Meend: ${match[1]}${match[2]}${match[3]}`); // DEBUG
            tokens.push({ type: 'meend', startNote: match[1], endNote: match[3], count: match[2].length });
        } else if (match[4]) { // Comma
             // Check for consecutive commas
            let commaCount = 0; let currentCheckIndex = match.index;
             while(sequenceText[currentCheckIndex] === ',') { commaCount++; currentCheckIndex++; }
             console.log(`  Matched Pause: Count=${commaCount}`); // DEBUG
             tokens.push({ type: 'pause', value: ',', count: commaCount });
             regex.lastIndex = match.index + commaCount; // Adjust index

        } else if (match[5] && match[6]) { // Quick Transition Note
            const note = match[6]; const hasGamak = !!match[7];
             console.log(`  Matched Quick Note: ${note}, Gamak=${hasGamak}`); // DEBUG
            tokens.push({ type: 'note', value: note, count: 1, quickTransition: true, hasGamak: hasGamak });
        } else if (match[8]) { // Regular Note or Repetition (Group 8=Note, Group 9=~?, Group 10=Repeats)
             const fullMatch = match[0]; // Get the full matched string (e.g., "DDD", "SS~S")
             const note = match[8];
             const hasGamak = !!match[9];
             // Calculate count based on note occurrences in the full match, ignoring '~'
             const count = note ? (fullMatch.match(new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length : 1; // Count occurrences of base note
             console.log(`  Matched Note/Rep: ${fullMatch} (Note=${note}, Count=${count}, Gamak=${hasGamak})`); // DEBUG
             tokens.push({ type: 'note', value: note, count: count, quickTransition: false, hasGamak: hasGamak });
        }
        // Ignore whitespace or standalone underscores

        lastIndex = regex.lastIndex; // Update position
    }
    if (lastIndex < sequenceText.trim().length) { // Check if any trailing characters were missed
         console.warn(`Unprocessed trailing characters: "${sequenceText.substring(lastIndex)}"`);
    }
    console.log("--- Tokenization Complete ---"); // DEBUG
    console.log("Final Tokens:", JSON.stringify(tokens, null, 2)); // DEBUG

    // --- Playback Scheduling ---
    let scheduleTime = audioCtx.currentTime + 0.1; let totalDuration = 0.1;
    playButton.disabled = true;
    console.log("--- Starting Scheduling ---"); // DEBUG

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        let actualStartTime = scheduleTime; let currentEventDuration = 0;
        // console.log(`  Scheduling Token ${i}:`, token); // DEBUG

        if ((token.type === 'note' || token.type === 'meend') && token.quickTransition && i > 0) {
             const overlap = QUICK_TRANSITION_OVERLAP / speedFactor;
             actualStartTime = Math.max(audioCtx.currentTime + 0.01, scheduleTime - overlap);
             // console.log(`    Quick Transition Applied: Overlap=${overlap.toFixed(3)}, StartTime=${actualStartTime.toFixed(3)}`); // DEBUG
             // Adjust totalDuration approx
             totalDuration -= Math.min(overlap, SEQUENCE_NOTE_DURATION / speedFactor);
        }

        if (token.type === 'pause') {
            currentEventDuration = (SEQUENCE_PAUSE_DURATION * token.count) / speedFactor;
            // console.log(`    Pause: Duration=${currentEventDuration.toFixed(3)}`); // DEBUG
        } else if (token.type === 'note') {
            const sargamNote = token.value; const noteCount = token.count; const hasGamak = token.hasGamak;
            const westernNote = WESTERN_NOTE_MAP[sargamNote];
            if (westernNote) {
                const frequency = getFrequency(westernNote);
                if (frequency > 0) {
                    currentEventDuration = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor;
                     // console.log(`    Note '${sargamNote}': Freq=${frequency.toFixed(2)}, Start=${actualStartTime.toFixed(3)}, Dur=${currentEventDuration.toFixed(3)}, Gamak=${hasGamak}`); // DEBUG
                    playSequenceNote(frequency, actualStartTime, currentEventDuration, hasGamak);
                } else { currentEventDuration = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor; /* skip */ console.log(`    Note '${sargamNote}': Invalid Freq, skipping.`); }
            } else { currentEventDuration = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor; /* skip */ console.warn(`    Note '${sargamNote}': Unknown, skipping.`); }
        } else if (token.type === 'meend') {
            const startSargam = token.startNote; const endSargam = token.endNote; const meendMultiplier = token.count;
            const startWestern = WESTERN_NOTE_MAP[startSargam];
            const endWestern = WESTERN_NOTE_MAP[endSargam];
            if (startWestern && endWestern) {
                const startFreq = getFrequency(startWestern); const endFreq = getFrequency(endWestern);
                if (startFreq > 0 && endFreq > 0) {
                    currentEventDuration = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor;
                    // console.log(`    Meend '${startSargam}-${endSargam}': Freqs=${startFreq.toFixed(2)}-${endFreq.toFixed(2)}, Start=${actualStartTime.toFixed(3)}, Dur=${currentEventDuration.toFixed(3)}`); // DEBUG
                    playMeendNote(startFreq, endFreq, actualStartTime, currentEventDuration);
                } else { currentEventDuration = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor; /* skip */ console.log(`    Meend '${startSargam}-${endSargam}': Invalid Freq, skipping.`);}
            } else { currentEventDuration = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor; /* skip */ console.warn(`    Meend '${startSargam}-${endSargam}': Unknown notes, skipping.`);}
        }

        scheduleTime = actualStartTime + currentEventDuration; // Update schedule time for the *next* event
        totalDuration += currentEventDuration; // Add the duration of the *current* event
        // console.log(`    Next Schedule Time: ${scheduleTime.toFixed(3)}`); // DEBUG

    } // End token loop
    console.log("--- Scheduling Complete ---"); // DEBUG


    const timeoutDuration = Math.max(50, (scheduleTime - audioCtx.currentTime + 0.1) * 1000); // Use final scheduleTime + buffer
    console.log(`    UI Timeout: ${timeoutDuration.toFixed(0)} ms`); // DEBUG
    setTimeout(() => { playButton.disabled = false; }, timeoutDuration);
}


// --- Piano Key Generation and Event Handling ---
const pianoContainer = document.getElementById('piano');
if (pianoContainer) { /* ... no change ... */
    let whiteKeyIndex = 0;
    NOTES.forEach(note => {
        const keyElement = document.createElement('div'); const isBlackKey = note.includes('#'); const notations = getSargamNotation(note);
        keyElement.classList.add('key'); keyElement.classList.add(isBlackKey ? 'black' : 'white'); keyElement.dataset.note = note;
        if (isBlackKey) {
            keyElement.style.left = `calc(var(--piano-padding) + (var(--white-key-step) * ${whiteKeyIndex}))`;
        }
        const indianLabel = document.createElement('span'); indianLabel.classList.add('indian-note'); indianLabel.textContent = notations.indian; keyElement.appendChild(indianLabel);
        const westernLabel = document.createElement('span'); westernLabel.classList.add('western-note'); westernLabel.textContent = notations.western; keyElement.appendChild(westernLabel);
        const handlePress = (e) => { e.preventDefault(); startNote(note); keyElement.classList.add('active'); };
        const handleRelease = (e) => { if (e && (e.target === keyElement || keyElement.contains(e.target)) && activeNotes[note]) { e.preventDefault(); stopNote(note); keyElement.classList.remove('active'); } };
        const handleLeave = (e) => { if (activeNotes[note]) { stopNote(note); keyElement.classList.remove('active'); } }
        keyElement.addEventListener('mousedown', handlePress); keyElement.addEventListener('mouseup', handleRelease); keyElement.addEventListener('mouseleave', handleLeave);
        keyElement.addEventListener('touchstart', handlePress, { passive: false }); keyElement.addEventListener('touchend', handleRelease, { passive: false }); keyElement.addEventListener('touchcancel', handleRelease, { passive: false });
        pianoContainer.appendChild(keyElement);
        if (!isBlackKey) { whiteKeyIndex++; }
    });
} else { console.error("Piano container element not found!"); }

// --- Initialize Audio Context & Add Other Listeners ---
document.body.addEventListener('pointerdown', initAudioContext, { once: true });

const playButton = document.getElementById('playSequenceBtn');
if (playButton) { playButton.addEventListener('click', playSequence); }
else { console.error("Play sequence button not found!"); }

const sargamInputElement = document.getElementById('sargamInput');
if (sargamInputElement) { sargamInputElement.addEventListener('keypress', function (e) { if (e.key === 'Enter') { e.preventDefault(); playSequence(); } }); }

// Speed Slider Listener
if (speedSlider && speedValueDisplay) { /* ... no change ... */
    speedValueDisplay.textContent = parseFloat(speedSlider.value).toFixed(2) + 'x';
    speedSlider.addEventListener('input', () => { currentSpeedFactor = parseFloat(speedSlider.value); speedValueDisplay.textContent = currentSpeedFactor.toFixed(2) + 'x'; });
} else { console.warn("Speed slider or value display element not found!"); }

// Pitch Select Listener
if (pitchSelect) { /* ... no change ... */
    pitchSelect.addEventListener('change', () => {
        globalPitchShiftSemitones = parseInt(pitchSelect.value); console.log("Global Pitch Shift set to:", globalPitchShiftSemitones);
        Object.keys(activeNotes).forEach(noteName => stopNote(noteName));
    });
} else { console.warn("Pitch select element not found!"); }

// Reverb Slider Listener
if (reverbSlider && reverbValueDisplay) { /* ... no change ... */
     reverbValueDisplay.textContent = reverbAmount.toFixed(2);
     reverbSlider.addEventListener('input', () => {
        reverbAmount = parseFloat(reverbSlider.value); reverbValueDisplay.textContent = reverbAmount.toFixed(2);
        if (audioCtx && dryGain && wetGain) { const now = audioCtx.currentTime; dryGain.gain.linearRampToValueAtTime(1.0 - reverbAmount, now + 0.02); wetGain.gain.linearRampToValueAtTime(reverbAmount, now + 0.02); }
    });
} else { console.warn("Reverb slider or value display element not found!"); }

// --- Update Info Text for Sequence Player ---
const infoParagraphs = document.querySelectorAll('.sequence-player .info');
if (infoParagraphs.length > 1) { /* ... no change ... */
    infoParagraphs[1].innerHTML = `(Notes: S R G M P D N, Komal: r g d n, Tivra: m. Octaves: 0 lower, 1 higher. e.g., S0, P, m1. Repeats: SSS. Meend: S-G. Quick: _R. Gamak: G~, RR~R)`;
}

// --- Voice Pitch Analyzer ---
const pitchStartBtn = document.getElementById('pitchStartBtn');
const pitchStopBtn = document.getElementById('pitchStopBtn');
const pitchCanvas = document.getElementById('pitchCanvas');
const pitchNoteDisplay = document.getElementById('pitchNote');
const pitchFreqDisplay = document.getElementById('pitchFreq');
const pitchStatus = document.getElementById('pitchStatus');
const pitchSensitivitySlider = document.getElementById('pitchSensitivity');
const pitchSensitivityValue = document.getElementById('pitchSensitivityValue');

let micStream = null;
let micSource = null;
let analyserNode = null;
let pitchBuffer = null;
let pitchAnimationId = null;
let pitchHistory = [];
let pitchCanvasCtx = null;
let pitchCanvasWidth = 0;
let pitchCanvasHeight = 0;
let smoothedPitchFreq = null;
let recentDetections = [];
let noSignalFrames = 0;
let currentPitchFreq = null;
let lastGlowFreq = null;
let graphPitchFreq = null;
let graphNoSignalFrames = 0;
let graphFrameCounter = 0;
let pitchBaseMinHz = null;
let pitchBaseMaxHz = null;
let pitchScaleNotes = [];
let pitchRangeDirty = true;

const PITCH_VIEW_DEFAULT_MIN_HZ = 80;
const PITCH_VIEW_DEFAULT_MAX_HZ = 1000;
const PITCH_VIEW_ABS_MIN_HZ = 50;
const PITCH_VIEW_ABS_MAX_HZ = 2000;
const PITCH_FREQ_SMOOTHING = 0.2;
const PITCH_HISTORY_LENGTH = 180;
const PITCH_MIN_FREQ = 70;
const PITCH_MAX_FREQ = 1200;
const PITCH_YIN_THRESHOLD = 0.12;
const PITCH_STABILITY_WINDOW = 3;
const PITCH_HOLD_FRAMES = 3;
const PITCH_GRAPH_SMOOTHING = 0.38;
const PITCH_GRAPH_HOLD_FRAMES = 1;
const PITCH_GRAPH_FRAME_SKIP = 2;
const PITCH_AXIS_LEFT_MARGIN = 52;
const PITCH_AXIS_RIGHT_MARGIN = 52;
const PITCH_GLOW_MAX_CENTS = 50;
const PITCH_LEFT_GLOW_CENTS = 30;
const PITCH_PAN_MARGIN = 0.18;
const PITCH_PAN_SMOOTHING = 0.08;
const PITCH_SCALE_NOTE_MIN_OFFSET = -12;
const PITCH_SCALE_NOTE_MAX_OFFSET = 23;
const PITCH_VIEW_NOTE_COUNT = 10;
const PITCH_VIEW_NOTE_MIN_OFFSET = -Math.floor((PITCH_VIEW_NOTE_COUNT - 1) / 2);
const PITCH_VIEW_NOTE_MAX_OFFSET = PITCH_VIEW_NOTE_MIN_OFFSET + PITCH_VIEW_NOTE_COUNT - 1;

const BASE_PITCH_MIN_RMS = 0.015;
const BASE_PITCH_CONFIDENCE_MIN = 0.72;
const BASE_PITCH_GRAPH_CONFIDENCE_MIN = 0.6;

let pitchMinRms = BASE_PITCH_MIN_RMS;
let pitchConfidenceMin = BASE_PITCH_CONFIDENCE_MIN;
let pitchGraphConfidenceMin = BASE_PITCH_GRAPH_CONFIDENCE_MIN;

function resizePitchCanvas() {
    if (!pitchCanvas) return;
    const rect = pitchCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    pitchCanvasWidth = Math.max(1, Math.floor(rect.width));
    pitchCanvasHeight = Math.max(1, Math.floor(rect.height));
    pitchCanvas.width = Math.max(1, Math.floor(pitchCanvasWidth * dpr));
    pitchCanvas.height = Math.max(1, Math.floor(pitchCanvasHeight * dpr));
    if (!pitchCanvasCtx) { pitchCanvasCtx = pitchCanvas.getContext('2d'); }
    if (pitchCanvasCtx) { pitchCanvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    drawPitchGraph();
}

let pitchViewMinHz = PITCH_VIEW_DEFAULT_MIN_HZ;
let pitchViewMaxHz = PITCH_VIEW_DEFAULT_MAX_HZ;
let pitchPlot = { left: 48, right: 0, top: 8, bottom: 0 };

function updatePitchPlotBounds() {
    pitchPlot.left = PITCH_AXIS_LEFT_MARGIN;
    pitchPlot.right = Math.max(pitchPlot.left + 10, pitchCanvasWidth - PITCH_AXIS_RIGHT_MARGIN);
    pitchPlot.top = 8;
    pitchPlot.bottom = Math.max(pitchPlot.top + 10, pitchCanvasHeight - 8);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function lerp(current, target, amount) {
    return current + (target - current) * amount;
}

function applyPitchSensitivity(value) {
    const sensitivity = clamp(value, 0.5, 1.5);
    pitchMinRms = clamp(BASE_PITCH_MIN_RMS / sensitivity, 0.005, 0.05);
    pitchConfidenceMin = clamp(BASE_PITCH_CONFIDENCE_MIN / sensitivity, 0.45, 0.95);
    pitchGraphConfidenceMin = clamp(BASE_PITCH_GRAPH_CONFIDENCE_MIN / sensitivity, 0.35, 0.9);
}

function freqToY(freq) {
    const clamped = clamp(freq, pitchViewMinHz, pitchViewMaxHz);
    const minLog = Math.log10(pitchViewMinHz);
    const maxLog = Math.log10(pitchViewMaxHz);
    const value = (Math.log10(clamped) - minLog) / (maxLog - minLog);
    return pitchPlot.bottom - (value * (pitchPlot.bottom - pitchPlot.top));
}

function getFrequencyForNote(noteName, octave) {
    const noteIndex = NOTE_NAMES.indexOf(noteName);
    if (noteIndex === -1) return 0;
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / 12);
}

function formatSargamLabel(noteName, octave) {
    const base = SARGAM_BASE[noteName] || '';
    if (!base) return '';
    const diff = octave - 3;
    if (diff === 0) return base;
    if (diff > 0) return `${base}${diff}`;
    return `${base}${'0'.repeat(Math.abs(diff))}`;
}

function getCenterBaseOctave(centerValue) {
    if (centerValue === 'S0') return 2;
    if (centerValue === 'S1') return 4;
    return 3;
}

function getNoteFromOffset(baseOctave, offset) {
    const semitoneIndex = (offset % 12 + 12) % 12;
    const octave = baseOctave + Math.floor(offset / 12);
    const noteName = NOTE_NAMES[semitoneIndex];
    const western = `${noteName}${octave}`;
    const freq = getFrequency(western);
    if (freq <= 0) return null;
    const indian = formatSargamLabel(noteName, octave);
    return { western, freq, indian };
}

function buildPitchScaleNotes(centerValue) {
    const baseOctave = getCenterBaseOctave(centerValue);
    const notes = [];
    const startIndex = PITCH_SCALE_NOTE_MIN_OFFSET;
    const endIndex = PITCH_SCALE_NOTE_MAX_OFFSET;

    for (let i = startIndex; i <= endIndex; i++) {
        const note = getNoteFromOffset(baseOctave, i);
        if (!note) continue;
        notes.push(note);
    }
    return notes;
}

function setBasePitchViewRange(centerValue) {
    const baseOctave = getCenterBaseOctave(centerValue);
    const minNote = getNoteFromOffset(baseOctave, PITCH_VIEW_NOTE_MIN_OFFSET);
    const maxNote = getNoteFromOffset(baseOctave, PITCH_VIEW_NOTE_MAX_OFFSET);
    if (!minNote || !maxNote) {
        pitchViewMinHz = PITCH_VIEW_DEFAULT_MIN_HZ;
        pitchViewMaxHz = PITCH_VIEW_DEFAULT_MAX_HZ;
        pitchBaseMinHz = pitchViewMinHz;
        pitchBaseMaxHz = pitchViewMaxHz;
        return;
    }

    const padding = 0.02;
    pitchBaseMinHz = clamp(minNote.freq * (1 - padding), PITCH_VIEW_ABS_MIN_HZ, PITCH_VIEW_ABS_MAX_HZ);
    pitchBaseMaxHz = clamp(maxNote.freq * (1 + padding), PITCH_VIEW_ABS_MIN_HZ, PITCH_VIEW_ABS_MAX_HZ);
    pitchViewMinHz = pitchBaseMinHz;
    pitchViewMaxHz = pitchBaseMaxHz;
}

function updatePitchViewPan(currentFreq) {
    if (!currentFreq || !pitchViewMinHz || !pitchViewMaxHz) return;
    const minLog = Math.log(pitchViewMinHz);
    const maxLog = Math.log(pitchViewMaxHz);
    const spanLog = maxLog - minLog;
    if (spanLog <= 0) return;

    const freqLog = Math.log(currentFreq);
    const margin = spanLog * PITCH_PAN_MARGIN;
    const lowerBound = minLog + margin;
    const upperBound = maxLog - margin;

    if (freqLog > upperBound) {
        const targetMaxLog = freqLog + margin;
        const targetMinLog = targetMaxLog - spanLog;
        pitchViewMinHz = clamp(Math.exp(lerp(minLog, targetMinLog, PITCH_PAN_SMOOTHING)), PITCH_VIEW_ABS_MIN_HZ, PITCH_VIEW_ABS_MAX_HZ);
        pitchViewMaxHz = clamp(Math.exp(lerp(maxLog, targetMaxLog, PITCH_PAN_SMOOTHING)), PITCH_VIEW_ABS_MIN_HZ, PITCH_VIEW_ABS_MAX_HZ);
    } else if (freqLog < lowerBound) {
        const targetMinLog = freqLog - margin;
        const targetMaxLog = targetMinLog + spanLog;
        pitchViewMinHz = clamp(Math.exp(lerp(minLog, targetMinLog, PITCH_PAN_SMOOTHING)), PITCH_VIEW_ABS_MIN_HZ, PITCH_VIEW_ABS_MAX_HZ);
        pitchViewMaxHz = clamp(Math.exp(lerp(maxLog, targetMaxLog, PITCH_PAN_SMOOTHING)), PITCH_VIEW_ABS_MIN_HZ, PITCH_VIEW_ABS_MAX_HZ);
    }
}

function drawPitchAxisLabels() {
    if (!pitchCanvasCtx) return;
    const ctx = pitchCanvasCtx;
    let lastLabelY = null;
    const labelX = pitchCanvasWidth - 8;
    const leftLabelX = pitchPlot.left - 6;
    const highlightFreq = currentPitchFreq || lastGlowFreq;
    const highlight = getClosestScaleNote(highlightFreq);
    const leftHighlight = getLeftEdgeScaleNote();

    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';

    pitchScaleNotes.forEach(note => {
        if (!note || !note.freq) return;
        const y = freqToY(note.freq);
        if (y < pitchPlot.top - 6 || y > pitchPlot.bottom + 6) return;
        if (lastLabelY !== null && Math.abs(lastLabelY - y) < 8) return;
        const label = note.indian || note.sargam || '';
        if (!label) return;
        const isHighlight = highlight && highlight.note === note && highlight.cents <= PITCH_GLOW_MAX_CENTS;
        const isTouched = leftHighlight && leftHighlight.note === note;

        ctx.save();
        ctx.textAlign = 'right';
        if (isHighlight) {
            ctx.fillStyle = '#1f9d55';
            ctx.shadowColor = 'rgba(76, 174, 76, 0.9)';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 12px monospace';
        } else {
            ctx.fillStyle = label === label.toLowerCase() ? '#777' : '#555';
        }
        ctx.fillText(label, labelX, y);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'right';
        if (isTouched) {
            ctx.fillStyle = '#1f9d55';
            ctx.shadowColor = 'rgba(76, 174, 76, 0.9)';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 12px monospace';
        } else {
            ctx.fillStyle = label === label.toLowerCase() ? '#777' : '#555';
        }
        ctx.fillText(label, leftLabelX, y);
        ctx.restore();
        lastLabelY = y;
    });
}

function drawPitchGraph() {
    if (!pitchCanvasCtx) return;
    const ctx = pitchCanvasCtx;
    ctx.clearRect(0, 0, pitchCanvasWidth, pitchCanvasHeight);

    if (pitchRangeDirty) {
        const centerValue = 'S';
        pitchScaleNotes = buildPitchScaleNotes(centerValue);
        setBasePitchViewRange(centerValue);
        pitchRangeDirty = false;
    }

    updatePitchPlotBounds();

    updatePitchViewPan(currentPitchFreq);

    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = pitchPlot.top + ((pitchPlot.bottom - pitchPlot.top) / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pitchPlot.left, y);
        ctx.lineTo(pitchPlot.right, y);
        ctx.stroke();
    }

    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(pitchPlot.right, pitchPlot.top);
    ctx.lineTo(pitchPlot.right, pitchPlot.bottom);
    ctx.stroke();

    drawPitchAxisLabels();

    if (!pitchHistory.length) return;
    const plotWidth = pitchPlot.right - pitchPlot.left;
    const step = pitchHistory.length > 1 ? plotWidth / (pitchHistory.length - 1) : plotWidth;
    ctx.strokeStyle = '#4cae4c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    pitchHistory.forEach((freq, index) => {
        if (!freq) { started = false; return; }
        const x = pitchPlot.left + index * step;
        const y = freqToY(freq);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
}

function detectPitchYIN(buffer, sampleRate) {
    const size = buffer.length;
    let rms = 0;
    for (let i = 0; i < size; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / size);
    if (rms < pitchMinRms) return { freq: -1, confidence: 0 };

    const minTau = Math.floor(sampleRate / PITCH_MAX_FREQ);
    const maxTau = Math.floor(sampleRate / PITCH_MIN_FREQ);
    if (maxTau <= minTau || maxTau >= size) return { freq: -1, confidence: 0 };

    const yinBuffer = new Float32Array(maxTau + 1);
    for (let tau = minTau; tau <= maxTau; tau++) {
        let sum = 0;
        for (let i = 0; i < size - tau; i++) {
            const diff = buffer[i] - buffer[i + tau];
            sum += diff * diff;
        }
        yinBuffer[tau] = sum;
    }

    let runningSum = 0;
    yinBuffer[0] = 1;
    for (let tau = 1; tau <= maxTau; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] = runningSum ? (yinBuffer[tau] * tau) / runningSum : 1;
    }

    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau++) {
        if (yinBuffer[tau] < PITCH_YIN_THRESHOLD) {
            while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) { tau++; }
            tauEstimate = tau;
            break;
        }
    }

    if (tauEstimate === -1) {
        let minVal = Infinity;
        let minIndex = -1;
        for (let tau = minTau; tau <= maxTau; tau++) {
            if (yinBuffer[tau] < minVal) { minVal = yinBuffer[tau]; minIndex = tau; }
        }
        tauEstimate = minIndex;
    }

    if (tauEstimate <= 0) return { freq: -1, confidence: 0 };

    let betterTau = tauEstimate;
    if (tauEstimate > 1 && tauEstimate < maxTau) {
        const s0 = yinBuffer[tauEstimate - 1];
        const s1 = yinBuffer[tauEstimate];
        const s2 = yinBuffer[tauEstimate + 1];
        const denom = (2 * s1 - s2 - s0);
        if (denom) { betterTau = tauEstimate + (s2 - s0) / (2 * denom); }
    }

    const freq = sampleRate / betterTau;
    const confidence = 1 - yinBuffer[tauEstimate];
    return { freq, confidence };
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getClosestScaleNote(freq) {
    if (!freq || !pitchScaleNotes.length) return null;
    let closest = null;
    let minCents = Infinity;
    pitchScaleNotes.forEach(note => {
        if (!note || !note.freq) return;
        const cents = Math.abs(1200 * Math.log2(freq / note.freq));
        if (cents < minCents) {
            minCents = cents;
            closest = note;
        }
    });
    return closest ? { note: closest, cents: minCents } : null;
}

function getLeftEdgeScaleNote() {
    if (!pitchHistory.length || !pitchScaleNotes.length) return null;
    let leftFreq = null;
    for (let i = 0; i < pitchHistory.length; i++) {
        if (pitchHistory[i]) {
            leftFreq = pitchHistory[i];
            break;
        }
    }
    if (!leftFreq) return null;
    const closest = getClosestScaleNote(leftFreq);
    if (!closest || closest.cents > PITCH_LEFT_GLOW_CENTS) return null;
    return closest;
}

function getNoteFromFrequency(freq) {
    const midi = Math.round(69 + 12 * Math.log2(freq / A4_FREQUENCY));
    const noteName = NOTE_NAMES[(midi % 12 + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    const western = `${noteName}${octave}`;
    const { indian } = getSargamNotation(western);
    const label = indian ? `${indian} (${western})` : western;
    return { western, indian, label };
}

function updatePitchUI(freq) {
    if (!pitchNoteDisplay || !pitchFreqDisplay || !pitchStatus) return;
    if (freq > 0) {
        const noteInfo = getNoteFromFrequency(freq);
        pitchNoteDisplay.textContent = noteInfo.label;
        pitchFreqDisplay.textContent = `${freq.toFixed(1)} Hz`;
        pitchStatus.textContent = 'Mic on.';
    } else {
        pitchNoteDisplay.textContent = '—';
        pitchFreqDisplay.textContent = '0 Hz';
        pitchStatus.textContent = 'Mic on. No pitch detected.';
    }
}

function updatePitchAnalyzer() {
    if (!analyserNode || !pitchBuffer) return;
    analyserNode.getFloatTimeDomainData(pitchBuffer);
    const result = detectPitchYIN(pitchBuffer, audioCtx.sampleRate);
    const freq = result.freq;
    const detectedFreq = (freq > 0 && result.confidence >= pitchConfidenceMin) ? freq : null;
    const graphDetected = (freq > 0 && result.confidence >= pitchGraphConfidenceMin) ? freq : null;

    if (detectedFreq && detectedFreq >= PITCH_MIN_FREQ && detectedFreq <= PITCH_MAX_FREQ) {
        recentDetections.push(detectedFreq);
        if (recentDetections.length > PITCH_STABILITY_WINDOW) { recentDetections.shift(); }
    } else if (recentDetections.length) {
        recentDetections.shift();
    }

    const stableFreq = median(recentDetections);

    if (stableFreq) {
        noSignalFrames = 0;
        smoothedPitchFreq = smoothedPitchFreq ? lerp(smoothedPitchFreq, stableFreq, PITCH_FREQ_SMOOTHING) : stableFreq;
    } else {
        noSignalFrames += 1;
        if (noSignalFrames > PITCH_HOLD_FRAMES) {
            smoothedPitchFreq = null;
        }
    }

    if (graphDetected && graphDetected >= PITCH_MIN_FREQ && graphDetected <= PITCH_MAX_FREQ) {
        graphNoSignalFrames = 0;
        graphPitchFreq = graphPitchFreq ? lerp(graphPitchFreq, graphDetected, PITCH_GRAPH_SMOOTHING) : graphDetected;
    } else {
        graphNoSignalFrames += 1;
        if (graphNoSignalFrames > PITCH_GRAPH_HOLD_FRAMES) {
            graphPitchFreq = null;
        }
    }

    const displayFreq = smoothedPitchFreq || null;
    currentPitchFreq = displayFreq;
    if (displayFreq) { lastGlowFreq = displayFreq; }
    updatePitchUI(displayFreq || -1);
    graphFrameCounter += 1;
    if (graphFrameCounter % PITCH_GRAPH_FRAME_SKIP !== 0) {
        pitchAnimationId = requestAnimationFrame(updatePitchAnalyzer);
        return;
    }

    pitchHistory.push(graphPitchFreq);
    if (pitchHistory.length > PITCH_HISTORY_LENGTH) { pitchHistory.shift(); }
    drawPitchGraph();
    pitchAnimationId = requestAnimationFrame(updatePitchAnalyzer);
}

async function startPitchAnalyzer() {
    if (!pitchStartBtn || !pitchStopBtn) return;
    if (!window.isSecureContext) {
        if (pitchStatus) { pitchStatus.textContent = 'Mic requires HTTPS or localhost.'; }
        return;
    }
    if (!initAudioContext() || !audioCtx) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (pitchStatus) { pitchStatus.textContent = 'Mic not supported in this browser.'; }
        return;
    }
    try {
        if (micStream) { stopPitchAnalyzer(); }
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        if (audioCtx.state === 'suspended') { await audioCtx.resume(); }
        micSource = audioCtx.createMediaStreamSource(micStream);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 2048;
        analyserNode.smoothingTimeConstant = 0.0;
        micSource.connect(analyserNode);
        pitchBuffer = new Float32Array(analyserNode.fftSize);

        pitchHistory = [];
        smoothedPitchFreq = null;
        recentDetections = [];
        noSignalFrames = 0;
        currentPitchFreq = null;
        lastGlowFreq = null;
        graphPitchFreq = null;
        graphNoSignalFrames = 0;
        graphFrameCounter = 0;
        pitchRangeDirty = true;
        resizePitchCanvas();
        updatePitchUI(-1);
        pitchStatus.textContent = 'Mic on.';
        pitchStartBtn.disabled = true;
        pitchStopBtn.disabled = false;
        updatePitchAnalyzer();
    } catch (error) {
        console.error('Mic access error:', error);
        if (pitchStatus) {
            const message = error && error.name ? `Mic error: ${error.name}.` : 'Mic permission denied or unavailable.';
            pitchStatus.textContent = message;
        }
    }
}

function stopPitchAnalyzer() {
    if (pitchAnimationId) { cancelAnimationFrame(pitchAnimationId); pitchAnimationId = null; }
    if (micStream) { micStream.getTracks().forEach(track => track.stop()); micStream = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (analyserNode) { analyserNode.disconnect(); analyserNode = null; }
    pitchBuffer = null;
    pitchHistory = [];
    smoothedPitchFreq = null;
    recentDetections = [];
    noSignalFrames = 0;
    currentPitchFreq = null;
    lastGlowFreq = null;
    graphPitchFreq = null;
    graphNoSignalFrames = 0;
    graphFrameCounter = 0;
    pitchRangeDirty = true;
    drawPitchGraph();
    updatePitchUI(-1);
    if (pitchStatus) { pitchStatus.textContent = 'Mic off.'; }
    if (pitchStartBtn) { pitchStartBtn.disabled = false; }
    if (pitchStopBtn) { pitchStopBtn.disabled = true; }
}

if (pitchStartBtn && pitchStopBtn) {
    pitchStartBtn.addEventListener('click', startPitchAnalyzer);
    pitchStopBtn.addEventListener('click', stopPitchAnalyzer);
    window.addEventListener('resize', () => {
        if (pitchCanvas && pitchCanvas.getBoundingClientRect().width > 0) { resizePitchCanvas(); }
    });
    if (pitchCanvas) { resizePitchCanvas(); }
}

if (pitchSensitivitySlider) {
    const initialValue = parseFloat(pitchSensitivitySlider.value) || 1;
    applyPitchSensitivity(initialValue);
    if (pitchSensitivityValue) {
        pitchSensitivityValue.textContent = `${initialValue.toFixed(2)}x`;
    }
    pitchSensitivitySlider.addEventListener('input', () => {
        const value = parseFloat(pitchSensitivitySlider.value) || 1;
        applyPitchSensitivity(value);
        if (pitchSensitivityValue) {
            pitchSensitivityValue.textContent = `${value.toFixed(2)}x`;
        }
    });
} else {
    applyPitchSensitivity(0.85);
}
