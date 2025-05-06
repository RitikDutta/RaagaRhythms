// --- Configuration ---
const NOTES = [
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5"
];
const SARGAM_BASE = {
    "C": "S", "C#": "r", "D": "R", "D#": "g", "E": "G", "F": "m",
    "F#": "M", "G": "P", "G#": "d", "A": "D", "A#": "n", "B": "N"
};
function getSargamNotation(note) { /* ... no change ... */
    if (!note || note.length < 2) return { indian: '', western: note };
    const noteName = note.slice(0, -1); const octave = parseInt(note.slice(-1));
    const sargamBase = SARGAM_BASE[noteName] || '?'; let indianNote = sargamBase;
    if (octave === 3) indianNote += '0'; else if (octave === 5) indianNote += '1';
    return { indian: indianNote, western: note };
}
let WESTERN_NOTE_MAP = {};
function createWesternNoteMap() { /* ... no change ... */
    WESTERN_NOTE_MAP = {};
    NOTES.forEach(westernNote => {
        const { indian: sargamWithOctave } = getSargamNotation(westernNote); let baseSargam = null;
        if(westernNote.endsWith('4')) { const noteName = westernNote.slice(0, -1); baseSargam = SARGAM_BASE[noteName] || null; }
        if (sargamWithOctave && !WESTERN_NOTE_MAP[sargamWithOctave]) { WESTERN_NOTE_MAP[sargamWithOctave] = westernNote; }
        const lowerSargamWithOctave = sargamWithOctave.toLowerCase(); if (lowerSargamWithOctave && !WESTERN_NOTE_MAP[lowerSargamWithOctave]) { WESTERN_NOTE_MAP[lowerSargamWithOctave] = westernNote; }
        if (baseSargam) { if (!WESTERN_NOTE_MAP[baseSargam]) { WESTERN_NOTE_MAP[baseSargam] = westernNote; } const lowerBaseSargam = baseSargam.toLowerCase(); if (lowerBaseSargam && !WESTERN_NOTE_MAP[lowerBaseSargam]) { WESTERN_NOTE_MAP[lowerBaseSargam] = westernNote; } }
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
            const westernNote = WESTERN_NOTE_MAP[sargamNote] || WESTERN_NOTE_MAP[sargamNote.toLowerCase()];
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
            const startWestern = WESTERN_NOTE_MAP[startSargam] || WESTERN_NOTE_MAP[startSargam.toLowerCase()];
            const endWestern = WESTERN_NOTE_MAP[endSargam] || WESTERN_NOTE_MAP[endSargam.toLowerCase()];
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
    infoParagraphs[1].innerHTML = `(Notes: S R G m P D N, Komal: r g d n, Tivra: M. Octaves: 0 lower, 1 higher. e.g., S0, P, m1. Repeats: SSS. Meend: S-G. Quick: _R. Gamak: G~, RR~R)`;
}