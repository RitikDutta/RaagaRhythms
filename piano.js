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
        const lowerSargamWithOctave = sargamWithOctave.toLowerCase();
        if (lowerSargamWithOctave && !WESTERN_NOTE_MAP[lowerSargamWithOctave]) { WESTERN_NOTE_MAP[lowerSargamWithOctave] = westernNote; }
        if (baseSargam) {
             if (!WESTERN_NOTE_MAP[baseSargam]) { WESTERN_NOTE_MAP[baseSargam] = westernNote; }
             const lowerBaseSargam = baseSargam.toLowerCase();
             if (lowerBaseSargam && !WESTERN_NOTE_MAP[lowerBaseSargam]) { WESTERN_NOTE_MAP[lowerBaseSargam] = westernNote; }
        }
    });
}
createWesternNoteMap();

const A4_FREQUENCY = 440;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Audio Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
const activeNotes = {};
function initAudioContext() { /* ... no change ... */
    if (!audioCtx) {
        try { audioCtx = new AudioContext(); console.log("AudioContext initialized."); }
        catch (e) { alert('Web Audio API not supported...'); console.error(e); return false; }
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
    const noteIndex = NOTE_NAMES.indexOf(noteName);
    if (noteIndex === -1) { console.warn(`Note name not found: ${noteName}`); return 0; }
    const semitonesFromA4_standard = (octave - 4) * 12 + (noteIndex - 9);
    const adjustedSemitonesFromA4 = semitonesFromA4_standard + globalPitchShiftSemitones;
    return A4_FREQUENCY * Math.pow(2, adjustedSemitonesFromA4 / 12);
}

// --- Note Playback Control (Manual Piano Keys) ---
const ATTACK_TIME = 0.02;
const RELEASE_TIME = 0.15;
function startNote(note) { /* ... no change ... */
    if (!initAudioContext() || !audioCtx) return; if (activeNotes[note]) return;
    const frequency = getFrequency(note); if (frequency <= 0) return;
    if (audioCtx.state === 'suspended') { audioCtx.resume().then(() => startNoteInternal(note, frequency)); }
    else { startNoteInternal(note, frequency); }
}
function startNoteInternal(note, frequency) { /* ... no change ... */
    const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + ATTACK_TIME);
    oscillator.start(audioCtx.currentTime); activeNotes[note] = { oscillator, gainNode };
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
const SEQUENCE_NOTE_DURATION = 0.4; // BASE duration for single note/hyphen
const SEQUENCE_PAUSE_DURATION = 0.2; // BASE duration for pause
const QUICK_TRANSITION_OVERLAP = 0.06; // NEW: Amount (in seconds) to overlap notes for quick transition
const SEQUENCE_ATTACK = 0.02;
const SEQUENCE_RELEASE = 0.1;

// Speed Control Setup
const speedSlider = document.getElementById('speedSlider');
const speedValueDisplay = document.getElementById('speedValue');
let currentSpeedFactor = speedSlider ? parseFloat(speedSlider.value) : 1.0;

// Playback function for single, fixed-pitch notes (Handles varying duration)
function playSequenceNote(frequency, startTime, duration) { /* ... no change ... */
    if (!audioCtx || frequency <= 0 || duration <= 0) return;
    const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    const actualAttack = Math.min(SEQUENCE_ATTACK, duration * 0.3); const actualRelease = Math.min(SEQUENCE_RELEASE, duration * 0.4);
    const sustainDuration = duration - actualAttack - actualRelease;
    gainNode.gain.setValueAtTime(0, startTime); gainNode.gain.linearRampToValueAtTime(0.8, startTime + actualAttack);
    if (sustainDuration > 0.001) {
         const sustainEndTime = startTime + actualAttack + sustainDuration;
         if(sustainEndTime > audioCtx.currentTime) { gainNode.gain.setValueAtTime(0.8, sustainEndTime); }
         const releaseStartTime = Math.max(startTime + actualAttack, sustainEndTime);
         gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + actualRelease);
    } else { const releaseStartTime = startTime + actualAttack; gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + actualRelease); }
    oscillator.start(startTime); oscillator.stop(startTime + duration + 0.05);
}

// Playback function for Meend (Glide)
function playMeendNote(startFreq, endFreq, startTime, duration) { /* ... no change ... */
    if (!audioCtx || startFreq <= 0 || endFreq <= 0 || duration <= 0) return;
    const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(startFreq, startTime); oscillator.frequency.linearRampToValueAtTime(endFreq, startTime + duration);
    const attack = Math.min(SEQUENCE_ATTACK, duration * 0.1); const release = Math.min(SEQUENCE_RELEASE, duration * 0.1);
    const sustainDuration = duration - attack - release; const sustainEndTime = startTime + attack + sustainDuration;
    gainNode.gain.setValueAtTime(0, startTime); gainNode.gain.linearRampToValueAtTime(0.7, startTime + attack);
    if (sustainDuration > 0.001) {
        if(sustainEndTime > audioCtx.currentTime) { gainNode.gain.setValueAtTime(0.7, sustainEndTime); }
        const releaseStartTime = Math.max(startTime + attack, sustainEndTime);
        gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + release);
    } else { const releaseStartTime = startTime + attack; gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + release); }
    oscillator.start(startTime); oscillator.stop(startTime + duration + 0.05);
}

// Main function to parse and play sequence
function playSequence() {
    if (!initAudioContext() || !audioCtx) { alert("Audio Context not ready..."); return; }
    const speedFactor = currentSpeedFactor;
    const sequenceInput = document.getElementById('sargamInput');
    const playButton = document.getElementById('playSequenceBtn');
    const sequenceText = sequenceInput.value; if (!sequenceText.trim()) return;

    // --- MODIFIED Parsing Logic for Quick Transition '_' ---
    const tokens = [];
    const notePattern = "[SrRgGmMPdDnN][01]?";
    // Regex captures:
    // 1. Meend: (Note1)(-+)(Note2) -> Groups 1, 2, 3
    // 2. Comma: (,) -> Group 4
    // 3. Repetition: ((Note)(SameNote+)) -> Groups 5(Full), 6(Unit)
    // 4. Quick Transition Note: (_)\s*(Note) -> Groups 8(Underscore), 9(Note)
    // 5. Regular Note: (?!_)(Note) -> Group 10 (only if not preceded by _)
    // 6. Underscore alone -> Group 11 (ignore)
    // 7. Whitespace: (\s+) -> Group 12
    const regex = new RegExp(
        `(${notePattern})(-+)(${notePattern})` + // 1. Meend
        `|(\\,)` +                                // 4. Comma
        `|((${notePattern})(\\6+))` +             // 5. Repetition
        `|(_)\\s*(${notePattern})` +              // 8. Quick Transition Note -> Groups 8(_), 9(Note)
        `|(?!_)(${notePattern})` +                // 10. Regular Note
        `|(_)` +                                  // 11. Underscore alone
        `|(\\s+)`,                                // 12. Whitespace
        'gi'
    );

    let match;
    let lastIndexProcessed = 0;
    while ((match = regex.exec(sequenceText)) !== null) {
         // console.log("Match:", match); // Debug

        if (match[1] && match[2] && match[3]) { // Meend
            tokens.push({ type: 'meend', startNote: match[1], endNote: match[3], count: match[2].length });
        } else if (match[4]) { // Comma
             let commaCount = 0; let currentCheckIndex = match.index;
             while(sequenceText[currentCheckIndex] === ',') { commaCount++; currentCheckIndex++; }
             if (match.index >= lastIndexProcessed) {
                 tokens.push({ type: 'pause', value: ',', count: commaCount });
                 regex.lastIndex = match.index + commaCount;
             }
        } else if (match[5] && match[6]) { // Repetition
            const s = match[6]; const c = s ? match[5].length / s.length : 1;
            // Repetitions imply normal connection, not quick transition start
            tokens.push({ type: 'note', value: s, count: c, quickTransition: false });
        } else if (match[8] && match[9]) { // Quick Transition Note (_Note)
             tokens.push({ type: 'note', value: match[9], count: 1, quickTransition: true }); // Mark quick transition
        } else if (match[10]) { // Regular Note
            tokens.push({ type: 'note', value: match[10], count: 1, quickTransition: false });
        }
        // Ignore underscore alone (match[11]) and whitespace (match[12])

        lastIndexProcessed = regex.lastIndex;
    }
    // console.log("Tokens:", tokens);

    // --- MODIFIED Playback Scheduling for Quick Transition ---
    // 'scheduleTime' now represents the time the *next* event should *normally* start
    let scheduleTime = audioCtx.currentTime + 0.1;
    let totalDuration = 0.1; // Tracks total time for UI disable/enable
    playButton.disabled = true;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        let actualStartTime = scheduleTime; // Default start time

        // Check if this note needs a quick transition (overlap with previous)
        if (token.type === 'note' && token.quickTransition && i > 0) {
             // Calculate overlap, ensure it doesn't make startTime negative or before initial start
             const overlap = QUICK_TRANSITION_OVERLAP / speedFactor; // Apply speed factor to overlap time too
             actualStartTime = Math.max(audioCtx.currentTime + 0.01, scheduleTime - overlap);
             // Adjust total duration calculation slightly due to overlap - approximation
             totalDuration -= Math.min(overlap, SEQUENCE_NOTE_DURATION / speedFactor);
        } else if (token.type === 'meend' && token.quickTransition && i > 0) { // Allow quick transition into meend? (Optional)
             const overlap = QUICK_TRANSITION_OVERLAP / speedFactor;
             actualStartTime = Math.max(audioCtx.currentTime + 0.01, scheduleTime - overlap);
             totalDuration -= Math.min(overlap, SEQUENCE_NOTE_DURATION / speedFactor);
        }


        if (token.type === 'pause') {
            const actualPauseDuration = (SEQUENCE_PAUSE_DURATION * token.count) / speedFactor;
            // No sound played, just advance the schedule time
            scheduleTime = actualStartTime + actualPauseDuration; // Use actualStartTime which is same as scheduleTime here
            totalDuration += actualPauseDuration;
        }
        else if (token.type === 'note') {
            const sargamNote = token.value; const noteCount = token.count;
            const westernNote = WESTERN_NOTE_MAP[sargamNote] || WESTERN_NOTE_MAP[sargamNote.toLowerCase()];

            if (westernNote) {
                const frequency = getFrequency(westernNote);
                if (frequency > 0) {
                    // Note duration is standard, regardless of quick transition flag
                    const actualNoteDuration = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor;
                    playSequenceNote(frequency, actualStartTime, actualNoteDuration);
                    // Next event normally starts after this one finishes
                    scheduleTime = actualStartTime + actualNoteDuration;
                    totalDuration += actualNoteDuration;
                } else { /* warning & skip time */ const skip = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor; scheduleTime = actualStartTime + skip; totalDuration += skip; }
            } else { /* warning & skip time */ const skip = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor; scheduleTime = actualStartTime + skip; totalDuration += skip; }
        }
        else if (token.type === 'meend') {
            const startSargam = token.startNote; const endSargam = token.endNote; const meendMultiplier = token.count;
            const startWestern = WESTERN_NOTE_MAP[startSargam] || WESTERN_NOTE_MAP[startSargam.toLowerCase()];
            const endWestern = WESTERN_NOTE_MAP[endSargam] || WESTERN_NOTE_MAP[endSargam.toLowerCase()];

            if (startWestern && endWestern) {
                const startFreq = getFrequency(startWestern); const endFreq = getFrequency(endWestern);
                if (startFreq > 0 && endFreq > 0) {
                    // Meend duration is standard per hyphen
                    const actualMeendDuration = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor;
                    playMeendNote(startFreq, endFreq, actualStartTime, actualMeendDuration);
                    // Next event normally starts after this one finishes
                    scheduleTime = actualStartTime + actualMeendDuration;
                    totalDuration += actualMeendDuration;
                } else { /* warning & skip time */ const skip = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor; scheduleTime = actualStartTime + skip; totalDuration += skip; }
            } else { /* warning & skip time */ const skip = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor; scheduleTime = actualStartTime + skip; totalDuration += skip; }
        }
    } // End of token loop


    const timeoutDuration = Math.max(50, totalDuration * 1000);
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
        globalPitchShiftSemitones = parseInt(pitchSelect.value);
        console.log("Global Pitch Shift set to:", globalPitchShiftSemitones, "semitones (Relative to C)");
        Object.keys(activeNotes).forEach(noteName => stopNote(noteName));
    });
} else { console.warn("Pitch select element not found!"); }

// --- Update Info Text for Sequence Player ---
const infoParagraphs = document.querySelectorAll('.sequence-player .info');
if (infoParagraphs.length > 1) {
    // Update the second info paragraph with all notations including the new Quick Transition
    infoParagraphs[1].innerHTML = `(Notes: S R G m P D N, Komal: r g d n, Tivra: M. Octaves: 0 lower, 1 higher. e.g., S0, P, m1. Repeats: SSS. Meend: S-G, P--S1. Quick Transition: _R)`;
}