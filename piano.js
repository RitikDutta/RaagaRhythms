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
    let mouseIsDownOnPiano = false;
    let draggedNote = null;
    let draggedKeyElement = null;

    const clearDraggedNote = () => {
        if (!draggedNote) return;
        stopNote(draggedNote);
        if (draggedKeyElement) { draggedKeyElement.classList.remove('active'); }
        draggedNote = null;
        draggedKeyElement = null;
    };

    const switchDraggedNote = (note, keyElement) => {
        if (draggedNote === note) return;
        clearDraggedNote();
        startNote(note);
        keyElement.classList.add('active');
        draggedNote = note;
        draggedKeyElement = keyElement;
    };

    const handleGlobalMouseUp = () => {
        if (!mouseIsDownOnPiano) return;
        mouseIsDownOnPiano = false;
        clearDraggedNote();
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', handleGlobalMouseUp);

    let whiteKeyIndex = 0;
    NOTES.forEach(note => {
        const keyElement = document.createElement('div'); const isBlackKey = note.includes('#'); const notations = getSargamNotation(note);
        keyElement.classList.add('key'); keyElement.classList.add(isBlackKey ? 'black' : 'white'); keyElement.dataset.note = note;
        if (isBlackKey) {
            keyElement.style.left = `calc(var(--piano-padding) + (var(--white-key-step) * ${whiteKeyIndex}))`;
        }
        const indianLabel = document.createElement('span'); indianLabel.classList.add('indian-note'); indianLabel.textContent = notations.indian; keyElement.appendChild(indianLabel);
        const westernLabel = document.createElement('span'); westernLabel.classList.add('western-note'); westernLabel.textContent = notations.western; keyElement.appendChild(westernLabel);
        const handleMousePress = (e) => {
            e.preventDefault();
            mouseIsDownOnPiano = true;
            switchDraggedNote(note, keyElement);
        };
        const handleMouseEnter = (e) => {
            if (!mouseIsDownOnPiano || (e.buttons & 1) !== 1) return;
            e.preventDefault();
            switchDraggedNote(note, keyElement);
        };
        const handleTouchPress = (e) => {
            e.preventDefault();
            startNote(note);
            keyElement.classList.add('active');
        };
        const handleTouchRelease = (e) => {
            e.preventDefault();
            if (activeNotes[note]) { stopNote(note); }
            keyElement.classList.remove('active');
        };
        keyElement.addEventListener('mousedown', handleMousePress);
        keyElement.addEventListener('mouseenter', handleMouseEnter);
        keyElement.addEventListener('touchstart', handleTouchPress, { passive: false });
        keyElement.addEventListener('touchend', handleTouchRelease, { passive: false });
        keyElement.addEventListener('touchcancel', handleTouchRelease, { passive: false });
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

function initCustomSelect(nativeSelectId) {
    const nativeSelect = document.getElementById(nativeSelectId);
    if (!nativeSelect) return;
    const wrapper = nativeSelect.closest('.control-block');
    if (!wrapper) return;
    const customSelect = wrapper.querySelector('.custom-select');
    if (!customSelect) return;
    const trigger = customSelect.querySelector('.custom-select-trigger');
    const valueSpan = customSelect.querySelector('.custom-select-value');
    const menu = customSelect.querySelector('.custom-select-menu');
    if (!trigger || !valueSpan || !menu) return;

    const buildOptions = () => {
        menu.innerHTML = '';
        Array.from(nativeSelect.options).forEach((opt) => {
            const item = document.createElement('li');
            item.className = 'custom-select-option';
            item.setAttribute('role', 'option');
            item.dataset.value = opt.value;
            item.textContent = opt.textContent;
            item.tabIndex = -1;
            item.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
            if (opt.selected) { valueSpan.textContent = opt.textContent; }
            menu.appendChild(item);
        });
    };

    const options = () => Array.from(menu.querySelectorAll('.custom-select-option'));

    const setSelectedByValue = (value, triggerChange = true) => {
        const items = options();
        const target = items.find((item) => item.dataset.value === value);
        if (!target) return;
        items.forEach((item) => item.setAttribute('aria-selected', item === target ? 'true' : 'false'));
        valueSpan.textContent = target.textContent;
        nativeSelect.value = value;
        if (triggerChange) { nativeSelect.dispatchEvent(new Event('change', { bubbles: true })); }
    };

    const closeMenu = () => {
        customSelect.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
        customSelect.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        const current = menu.querySelector('[aria-selected="true"]');
        if (current) { current.focus(); }
    };

    buildOptions();
    setSelectedByValue(nativeSelect.value, false);

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        if (customSelect.classList.contains('is-open')) { closeMenu(); }
        else { openMenu(); }
    });

    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!customSelect.classList.contains('is-open')) { openMenu(); }
            const opts = options();
            if (!opts.length) return;
            const currentIndex = opts.findIndex((item) => item.getAttribute('aria-selected') === 'true');
            const nextIndex = e.key === 'ArrowDown'
                ? Math.min((currentIndex >= 0 ? currentIndex + 1 : 0), opts.length - 1)
                : Math.max((currentIndex >= 0 ? currentIndex - 1 : 0), 0);
            opts[nextIndex].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (customSelect.classList.contains('is-open')) { closeMenu(); }
            else { openMenu(); }
        }
    });

    menu.addEventListener('click', (e) => {
        const target = e.target.closest('.custom-select-option');
        if (!target) return;
        setSelectedByValue(target.dataset.value);
        closeMenu();
        trigger.focus();
    });

    menu.addEventListener('keydown', (e) => {
        const opts = options();
        if (!opts.length) return;
        const currentIndex = opts.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            opts[Math.min(currentIndex + 1, opts.length - 1)].focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            opts[Math.max(currentIndex - 1, 0)].focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            opts[0].focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            opts[opts.length - 1].focus();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeMenu();
            trigger.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const focused = opts[currentIndex];
            if (focused) {
                setSelectedByValue(focused.dataset.value);
                closeMenu();
                trigger.focus();
            }
        }
    });

    nativeSelect.addEventListener('change', () => {
        setSelectedByValue(nativeSelect.value, false);
    });

    document.addEventListener('click', (e) => {
        if (!customSelect.contains(e.target)) { closeMenu(); }
    });
}

// Pitch Select Listener
if (pitchSelect) { /* ... no change ... */
    pitchSelect.addEventListener('change', () => {
        globalPitchShiftSemitones = parseInt(pitchSelect.value); console.log("Global Pitch Shift set to:", globalPitchShiftSemitones);
        Object.keys(activeNotes).forEach(noteName => stopNote(noteName));
        if (updatePitchGraph && updatePitchGraph.reset) {
            updatePitchGraph.reset();
        }
    });
} else { console.warn("Pitch select element not found!"); }

initCustomSelect('pitchSelect');

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

// --- Voice Pitch Analyzer (CREPE) ---
const pitchStartBtn = document.getElementById('pitchStartBtn');
const pitchTabBtn = document.getElementById('pitchTabBtn');
const pitchStopBtn = document.getElementById('pitchStopBtn');
const pitchStatus = document.getElementById('pitchStatus');
const pitchNoteEl = document.getElementById('pitch-note');
const pitchHzEl = document.getElementById('pitch-hz');
const pitchCentsEl = document.getElementById('pitch-cents');
const voicingConfidenceEl = document.getElementById('voicing-confidence');
const confidenceFillEl = document.getElementById('confidence-fill');
const pitchGraphCanvas = document.getElementById('pitch-graph');
const activationCanvas = document.getElementById('activation');

const analyzerSettings = {
    confidenceThreshold: 0.5,
    viewWindowCols: 240,
    viewPaddingSemitones: 2,
    viewSmooth: 0.18,
    minViewRangeSemitones: 8,
    maxViewRangeSemitones: 18,
    smoothWindow: 1,
    emaAlpha: 0.35,
    maxJumpSemitones: 10
};

const analyzerSettingInputs = Array.from(document.querySelectorAll('[data-analyzer-setting]'));
const analyzerValueNodes = Array.from(document.querySelectorAll('[data-analyzer-value]'));

function formatAnalyzerValue(value, decimals) {
    if (!isFinite(value)) return '--';
    if (Number.isFinite(decimals)) {
        return Number(value).toFixed(decimals);
    }
    return Number.isInteger(value) ? value.toString() : value.toString();
}

function updateAnalyzerValueDisplays(key, value) {
    analyzerValueNodes.forEach((node) => {
        if (node.dataset.analyzerValue !== key) return;
        const decimals = node.dataset.analyzerDecimals ? parseInt(node.dataset.analyzerDecimals, 10) : null;
        node.textContent = formatAnalyzerValue(value, decimals);
    });
}

function updateAnalyzerSettingUI(key, value) {
    analyzerSettingInputs.forEach((input) => {
        if (input.dataset.analyzerSetting !== key) return;
        const decimals = input.dataset.analyzerDecimals ? parseInt(input.dataset.analyzerDecimals, 10) : null;
        input.value = formatAnalyzerValue(value, decimals);
    });
    updateAnalyzerValueDisplays(key, value);
}

function parseAnalyzerInputValue(input) {
    const raw = parseFloat(input.value);
    if (!isFinite(raw)) return null;
    let value = raw;
    const min = input.min !== '' ? parseFloat(input.min) : null;
    const max = input.max !== '' ? parseFloat(input.max) : null;
    if (isFinite(min)) value = Math.max(min, value);
    if (isFinite(max)) value = Math.min(max, value);
    if (input.dataset.analyzerType === 'int') {
        value = Math.round(value);
    }
    const decimals = input.dataset.analyzerDecimals ? parseInt(input.dataset.analyzerDecimals, 10) : null;
    if (Number.isFinite(decimals)) {
        const factor = Math.pow(10, decimals);
        value = Math.round(value * factor) / factor;
    }
    return value;
}

function applyAnalyzerSetting(key, nextValue) {
    let value = nextValue;
    if (key === 'minViewRangeSemitones' && value > analyzerSettings.maxViewRangeSemitones) {
        value = analyzerSettings.maxViewRangeSemitones;
    }
    if (key === 'maxViewRangeSemitones' && value < analyzerSettings.minViewRangeSemitones) {
        value = analyzerSettings.minViewRangeSemitones;
    }
    analyzerSettings[key] = value;
    updateAnalyzerSettingUI(key, value);
    if (updatePitchGraph && updatePitchGraph.reset) {
        updatePitchGraph.reset();
    }
}

function initAnalyzerSettings() {
    analyzerSettingInputs.forEach((input) => {
        const key = input.dataset.analyzerSetting;
        if (!key) return;
        const parsed = parseAnalyzerInputValue(input);
        if (parsed !== null) {
            analyzerSettings[key] = parsed;
        }
        input.addEventListener('input', () => {
            const value = parseAnalyzerInputValue(input);
            if (value === null) return;
            applyAnalyzerSetting(key, value);
        });
        input.addEventListener('change', () => {
            const value = parseAnalyzerInputValue(input);
            if (value === null) return;
            applyAnalyzerSetting(key, value);
        });
    });
    Object.keys(analyzerSettings).forEach((key) => {
        updateAnalyzerSettingUI(key, analyzerSettings[key]);
    });
}

const CREPE_MODEL_URL = 'crepe/model/model.json';
let crepeAudioContext = null;
let crepeStream = null;
let crepeMicSource = null;
let crepeScriptNode = null;
let crepeGainNode = null;
let crepeModel = null;
let crepeLoadingPromise = null;
let crepeRunning = false;
let crepeInputMode = null;
let crepeActiveAudioTrack = null;
let centMapping = null;

function setPitchStatus(message) {
    if (pitchStatus) {
        pitchStatus.textContent = message;
    }
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function log2(value) {
    return Math.log(value) / Math.log(2);
}

function hzToMidi(hz) {
    return 69 + 12 * log2(hz / 440);
}

function getAnalyzerRootShiftSemitones() {
    return Number.isFinite(globalPitchShiftSemitones) ? globalPitchShiftSemitones : 0;
}

const CREPE_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function formatAnalyzerSargam(noteName, octave) {
    const western = `${noteName}${octave}`;
    const { indian } = getSargamNotation(western);
    return indian || western;
}

function hzToNote(hz) {
    const midi = hzToMidi(hz) - getAnalyzerRootShiftSemitones();
    const rounded = Math.round(midi);
    const name = CREPE_NOTE_NAMES[((rounded % 12) + 12) % 12];
    const octave = Math.floor(rounded / 12) - 1;
    const label = formatAnalyzerSargam(name, octave);
    const cents = Math.round((midi - rounded) * 100);
    return {
        label,
        cents,
        midi
    };
}

function updatePitchDisplay(hz, confidence) {
    if (confidenceFillEl) {
        confidenceFillEl.style.width = `${clamp(confidence * 100, 0, 100).toFixed(1)}%`;
    }
    if (voicingConfidenceEl) {
        voicingConfidenceEl.textContent = confidence.toFixed(3);
    }
    if (!pitchNoteEl || !pitchHzEl || !pitchCentsEl) {
        return;
    }
    if (!isFinite(hz) || hz <= 0 || confidence <= analyzerSettings.confidenceThreshold) {
        pitchNoteEl.textContent = '--';
        pitchHzEl.textContent = '-- Hz';
        pitchCentsEl.textContent = 'No voice';
        return;
    }
    const note = hzToNote(hz);
    const centsText = `${note.cents > 0 ? '+' : ''}${note.cents} cents`;
    pitchNoteEl.textContent = note.label;
    pitchHzEl.textContent = `${hz.toFixed(2)} Hz`;
    pitchCentsEl.textContent = centsText;
}

const updateActivation = (() => {
    if (!activationCanvas) {
        const noop = () => {};
        noop.reset = () => {};
        return noop;
    }

    const inferno = [
        [  0,  0,  3,255], [  0,  0,  4,255], [  0,  0,  6,255], [  1,  0,  7,255], [  1,  1,  9,255], [  1,  1, 11,255], [  2,  1, 14,255], [  2,  2, 16,255],
        [  3,  2, 18,255], [  4,  3, 20,255], [  4,  3, 22,255], [  5,  4, 24,255], [  6,  4, 27,255], [  7,  5, 29,255], [  8,  6, 31,255], [  9,  6, 33,255],
        [ 10,  7, 35,255], [ 11,  7, 38,255], [ 13,  8, 40,255], [ 14,  8, 42,255], [ 15,  9, 45,255], [ 16,  9, 47,255], [ 18, 10, 50,255], [ 19, 10, 52,255],
        [ 20, 11, 54,255], [ 22, 11, 57,255], [ 23, 11, 59,255], [ 25, 11, 62,255], [ 26, 11, 64,255], [ 28, 12, 67,255], [ 29, 12, 69,255], [ 31, 12, 71,255],
        [ 32, 12, 74,255], [ 34, 11, 76,255], [ 36, 11, 78,255], [ 38, 11, 80,255], [ 39, 11, 82,255], [ 41, 11, 84,255], [ 43, 10, 86,255], [ 45, 10, 88,255],
        [ 46, 10, 90,255], [ 48, 10, 92,255], [ 50,  9, 93,255], [ 52,  9, 95,255], [ 53,  9, 96,255], [ 55,  9, 97,255], [ 57,  9, 98,255], [ 59,  9,100,255],
        [ 60,  9,101,255], [ 62,  9,102,255], [ 64,  9,102,255], [ 65,  9,103,255], [ 67, 10,104,255], [ 69, 10,105,255], [ 70, 10,105,255], [ 72, 11,106,255],
        [ 74, 11,106,255], [ 75, 12,107,255], [ 77, 12,107,255], [ 79, 13,108,255], [ 80, 13,108,255], [ 82, 14,108,255], [ 83, 14,109,255], [ 85, 15,109,255],
        [ 87, 15,109,255], [ 88, 16,109,255], [ 90, 17,109,255], [ 91, 17,110,255], [ 93, 18,110,255], [ 95, 18,110,255], [ 96, 19,110,255], [ 98, 20,110,255],
        [ 99, 20,110,255], [101, 21,110,255], [102, 21,110,255], [104, 22,110,255], [106, 23,110,255], [107, 23,110,255], [109, 24,110,255], [110, 24,110,255],
        [112, 25,110,255], [114, 25,109,255], [115, 26,109,255], [117, 27,109,255], [118, 27,109,255], [120, 28,109,255], [122, 28,109,255], [123, 29,108,255],
        [125, 29,108,255], [126, 30,108,255], [128, 31,107,255], [129, 31,107,255], [131, 32,107,255], [133, 32,106,255], [134, 33,106,255], [136, 33,106,255],
        [137, 34,105,255], [139, 34,105,255], [141, 35,105,255], [142, 36,104,255], [144, 36,104,255], [145, 37,103,255], [147, 37,103,255], [149, 38,102,255],
        [150, 38,102,255], [152, 39,101,255], [153, 40,100,255], [155, 40,100,255], [156, 41, 99,255], [158, 41, 99,255], [160, 42, 98,255], [161, 43, 97,255],
        [163, 43, 97,255], [164, 44, 96,255], [166, 44, 95,255], [167, 45, 95,255], [169, 46, 94,255], [171, 46, 93,255], [172, 47, 92,255], [174, 48, 91,255],
        [175, 49, 91,255], [177, 49, 90,255], [178, 50, 89,255], [180, 51, 88,255], [181, 51, 87,255], [183, 52, 86,255], [184, 53, 86,255], [186, 54, 85,255],
        [187, 55, 84,255], [189, 55, 83,255], [190, 56, 82,255], [191, 57, 81,255], [193, 58, 80,255], [194, 59, 79,255], [196, 60, 78,255], [197, 61, 77,255],
        [199, 62, 76,255], [200, 62, 75,255], [201, 63, 74,255], [203, 64, 73,255], [204, 65, 72,255], [205, 66, 71,255], [207, 68, 70,255], [208, 69, 68,255],
        [209, 70, 67,255], [210, 71, 66,255], [212, 72, 65,255], [213, 73, 64,255], [214, 74, 63,255], [215, 75, 62,255], [217, 77, 61,255], [218, 78, 59,255],
        [219, 79, 58,255], [220, 80, 57,255], [221, 82, 56,255], [222, 83, 55,255], [223, 84, 54,255], [224, 86, 52,255], [226, 87, 51,255], [227, 88, 50,255],
        [228, 90, 49,255], [229, 91, 48,255], [230, 92, 46,255], [230, 94, 45,255], [231, 95, 44,255], [232, 97, 43,255], [233, 98, 42,255], [234,100, 40,255],
        [235,101, 39,255], [236,103, 38,255], [237,104, 37,255], [237,106, 35,255], [238,108, 34,255], [239,109, 33,255], [240,111, 31,255], [240,112, 30,255],
        [241,114, 29,255], [242,116, 28,255], [242,117, 26,255], [243,119, 25,255], [243,121, 24,255], [244,122, 22,255], [245,124, 21,255], [245,126, 20,255],
        [246,128, 18,255], [246,129, 17,255], [247,131, 16,255], [247,133, 14,255], [248,135, 13,255], [248,136, 12,255], [248,138, 11,255], [249,140,  9,255],
        [249,142,  8,255], [249,144,  8,255], [250,145,  7,255], [250,147,  6,255], [250,149,  6,255], [250,151,  6,255], [251,153,  6,255], [251,155,  6,255],
        [251,157,  6,255], [251,158,  7,255], [251,160,  7,255], [251,162,  8,255], [251,164, 10,255], [251,166, 11,255], [251,168, 13,255], [251,170, 14,255],
        [251,172, 16,255], [251,174, 18,255], [251,176, 20,255], [251,177, 22,255], [251,179, 24,255], [251,181, 26,255], [251,183, 28,255], [251,185, 30,255],
        [250,187, 33,255], [250,189, 35,255], [250,191, 37,255], [250,193, 40,255], [249,195, 42,255], [249,197, 44,255], [249,199, 47,255], [248,201, 49,255],
        [248,203, 52,255], [248,205, 55,255], [247,207, 58,255], [247,209, 60,255], [246,211, 63,255], [246,213, 66,255], [245,215, 69,255], [245,217, 72,255],
        [244,219, 75,255], [244,220, 79,255], [243,222, 82,255], [243,224, 86,255], [243,226, 89,255], [242,228, 93,255], [242,230, 96,255], [241,232,100,255],
        [241,233,104,255], [241,235,108,255], [241,237,112,255], [241,238,116,255], [241,240,121,255], [241,242,125,255], [242,243,129,255], [242,244,133,255],
        [243,246,137,255], [244,247,141,255], [245,248,145,255], [246,250,149,255], [247,251,153,255], [249,252,157,255], [250,253,160,255], [252,254,164,255],
        [252,254,164,255]
    ];

    for (let i = 0; i < inferno.length; i++) {
        const array = new Uint8ClampedArray(4);
        array.set(inferno[i]);
        inferno[i] = array;
    }

    const ctx = activationCanvas.getContext('2d');
    const buffer = ctx.createImageData(activationCanvas.width, activationCanvas.height);
    let column = 0;

    const render = (activation) => {
        for (let i = 0; i < 360; i++) {
            let value = Math.floor(activation[i] * 256.0);
            if (isNaN(value) || value < 0) value = 0;
            if (value > 256) value = 1;
            buffer.data.set(inferno[value], ((activationCanvas.height - 1 - i) * activationCanvas.width + column) * 4);
        }
        column = (column + 1) % activationCanvas.width;
        ctx.putImageData(buffer, activationCanvas.width - column, 0);
        ctx.putImageData(buffer, -column, 0);
    };

    render.reset = () => {
        buffer.data.fill(0);
        ctx.putImageData(buffer, 0, 0);
        column = 0;
    };

    render.reset();
    return render;
})();

const updatePitchGraph = (() => {
    if (!pitchGraphCanvas) {
        const noop = () => {};
        noop.reset = () => {};
        return noop;
    }

    const midiToSargamLabel = (midi) => {
        const rounded = Math.round(midi);
        const name = CREPE_NOTE_NAMES[((rounded % 12) + 12) % 12];
        const octave = Math.floor(rounded / 12) - 1;
        return formatAnalyzerSargam(name, octave);
    };

    const ctx = pitchGraphCanvas.getContext('2d');
    const width = pitchGraphCanvas.width;
    const height = pitchGraphCanvas.height;
    const history = new Array(width).fill(null);
    let writeIndex = 0;

    const getViewWindowCols = () => {
        const cols = Math.floor(analyzerSettings.viewWindowCols);
        return Math.min(width, Math.max(1, cols));
    };

    const SARGAM_TO_SEMITONE = {
        S: 0, r: 1, R: 2, g: 3, G: 4, M: 5,
        m: 6, P: 7, d: 8, D: 9, n: 10, N: 11
    };

    function sargamToMidi(sargam) {
        if (!sargam || sargam.length < 1) return NaN;
        const base = sargam[0];
        const suffix = sargam.slice(1);
        const semitone = SARGAM_TO_SEMITONE[base];
        if (semitone == null) return NaN;
        let offset = 0;
        if (suffix.length) {
            if (/^0+$/.test(suffix)) offset = -suffix.length;
            else if (/^\d+$/.test(suffix)) offset = parseInt(suffix, 10);
        }
        const octave = 3 + offset;
        return (octave + 1) * 12 + semitone;
    }

    const RANGE_MIN_MIDI = sargamToMidi('D00');
    const RANGE_MAX_MIDI = sargamToMidi('R2');
    const ABS_MIN_MIDI = RANGE_MIN_MIDI;
    const ABS_MAX_MIDI = RANGE_MAX_MIDI;
    const midMidi = (RANGE_MIN_MIDI + RANGE_MAX_MIDI) / 2;
    let viewMinMidi = midMidi - analyzerSettings.maxViewRangeSemitones / 2;
    let viewMaxMidi = midMidi + analyzerSettings.maxViewRangeSemitones / 2;
    let emaMidi = null;
    let lastValidMidi = null;
    const recentMidi = [];

    function median(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return (sorted.length % 2) ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function updateViewRange() {
        const windowPoints = Math.min(history.length, getViewWindowCols());
        const recent = [];
        for (let i = 0; i < windowPoints; i++) {
            const idx = (writeIndex - 1 - i + width) % width;
            const midi = history[idx];
            if (midi === null || isNaN(midi)) continue;
            recent.push(midi);
        }
        if (recent.length < 2) return;

        let vmin = Math.min(...recent);
        let vmax = Math.max(...recent);
        if (!isFinite(vmin) || !isFinite(vmax)) return;

        const span = Math.max(0.5, vmax - vmin);
        const padded = span + analyzerSettings.viewPaddingSemitones * 2;
        const range = clamp(padded, analyzerSettings.minViewRangeSemitones, analyzerSettings.maxViewRangeSemitones);

        let center = (vmin + vmax) / 2;
        const lastIndex = (writeIndex - 1 + width) % width;
        const lastMidi = history[lastIndex];
        if (lastMidi !== null && !isNaN(lastMidi)) {
            const edge = Math.min(2, range * 0.2);
            const minEdge = center - range / 2 + edge;
            const maxEdge = center + range / 2 - edge;
            if (lastMidi < minEdge) center = lastMidi + (range / 2 - edge);
            if (lastMidi > maxEdge) center = lastMidi - (range / 2 - edge);
        }

        let targetMin = center - range / 2;
        let targetMax = center + range / 2;
        if (targetMin < ABS_MIN_MIDI) {
            targetMin = ABS_MIN_MIDI;
            targetMax = ABS_MIN_MIDI + range;
        }
        if (targetMax > ABS_MAX_MIDI) {
            targetMax = ABS_MAX_MIDI;
            targetMin = ABS_MAX_MIDI - range;
        }

        viewMinMidi += (targetMin - viewMinMidi) * analyzerSettings.viewSmooth;
        viewMaxMidi += (targetMax - viewMaxMidi) * analyzerSettings.viewSmooth;

        if (viewMaxMidi - viewMinMidi < 1) {
            const mid = (viewMinMidi + viewMaxMidi) / 2;
            viewMinMidi = mid - 0.5;
            viewMaxMidi = mid + 0.5;
        }
    }

    function midiToY(midi) {
        const span = Math.max(1, viewMaxMidi - viewMinMidi);
        const clamped = clamp(midi, viewMinMidi, viewMaxMidi);
        const t = (clamped - viewMinMidi) / span;
        return height - t * height;
    }

    function buildGridLabels() {
        const range = viewMaxMidi - viewMinMidi;
        const step = range > 12 ? 2 : 1;
        const start = Math.ceil(viewMinMidi / step) * step;
        const labels = [];
        for (let midi = start; midi <= viewMaxMidi + 0.001; midi += step) {
            labels.push({ midi, label: midiToSargamLabel(midi) });
        }
        return labels;
    }

    function getPlotBounds(labels) {
        ctx.save();
        ctx.font = '12px "JetBrains Mono", monospace';
        let maxWidth = 0;
        labels.forEach((row) => {
            const w = ctx.measureText(row.label).width;
            if (w > maxWidth) maxWidth = w;
        });
        ctx.restore();
        const pad = clamp(Math.ceil(maxWidth) + 12, 32, Math.floor(width * 0.25));
        const left = pad;
        const right = width - pad;
        return { left, right, width: Math.max(1, right - left) };
    }

    function findClosestLabel(labels, targetMidi) {
        if (targetMidi === null || targetMidi === undefined || isNaN(targetMidi)) return null;
        let closest = null;
        let minDelta = Infinity;
        labels.forEach((row) => {
            const delta = Math.abs(row.midi - targetMidi);
            if (delta < minDelta) {
                minDelta = delta;
                closest = row.midi;
            }
        });
        return closest;
    }

    function drawGrid(labels, plot, highlightMidi) {
        const highlight = findClosestLabel(labels, highlightMidi);
        ctx.save();
        ctx.strokeStyle = 'rgba(35, 55, 80, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(35, 55, 80, 0.5)';

        for (let x = plot.left; x <= plot.right; x += 120) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        labels.forEach((row) => {
            const y = midiToY(row.midi);
            ctx.beginPath();
            ctx.moveTo(plot.left, y);
            ctx.lineTo(plot.right, y);
            ctx.stroke();
            ctx.fillText(row.label, 8, y - 6);
            const rightLabel = row.label;
            const textWidth = ctx.measureText(rightLabel).width;
            const rightX = width - textWidth - 8;
            if (highlight !== null && row.midi === highlight) {
                ctx.save();
                ctx.fillStyle = 'rgba(46, 168, 161, 0.15)';
                const boxY = Math.max(2, y - 14);
                ctx.fillRect(rightX - 4, boxY, textWidth + 8, 16);
                ctx.fillStyle = 'rgba(46, 168, 161, 0.95)';
                ctx.font = '600 12px "JetBrains Mono", monospace';
                ctx.fillText(rightLabel, rightX, y - 6);
                ctx.restore();
            } else {
                ctx.fillText(rightLabel, rightX, y - 6);
            }
        });
        ctx.restore();
    }

    function buildPath(plot) {
        ctx.beginPath();
        let started = false;
        for (let x = 0; x < width; x++) {
            const index = (writeIndex + x) % width;
            const midi = history[index];
            if (midi === null || isNaN(midi)) {
                started = false;
                continue;
            }
            const y = midiToY(midi);
            const t = width > 1 ? (x / (width - 1)) : 0;
            const px = plot.left + t * plot.width;
            if (!started) {
                ctx.moveTo(px, y);
                started = true;
            } else {
                ctx.lineTo(px, y);
            }
        }
    }

    const render = (hz, confidence) => {
        let midi = null;
        if (isFinite(hz) && hz > 0 && confidence > analyzerSettings.confidenceThreshold) {
            let candidate = hzToMidi(hz) - getAnalyzerRootShiftSemitones();
            if (candidate >= RANGE_MIN_MIDI && candidate <= RANGE_MAX_MIDI) {
                if (lastValidMidi !== null && Math.abs(candidate - lastValidMidi) > analyzerSettings.maxJumpSemitones) {
                    candidate = null;
                }
                if (candidate !== null) {
                    recentMidi.push(candidate);
                    const smoothWindow = Math.max(1, Math.round(analyzerSettings.smoothWindow));
                    while (recentMidi.length > smoothWindow) recentMidi.shift();
                    const med = median(recentMidi);
                    const alpha = clamp(analyzerSettings.emaAlpha, 0, 1);
                    emaMidi = (emaMidi == null) ? med : (alpha * med + (1 - alpha) * emaMidi);
                    midi = emaMidi;
                    lastValidMidi = emaMidi;
                }
            }
        }
        history[writeIndex] = midi;
        writeIndex = (writeIndex + 1) % width;
        updateViewRange();

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(0, 0, width, height);
        const gridLabels = buildGridLabels();
        const plot = getPlotBounds(gridLabels);
        const lastIndex = (writeIndex - 1 + width) % width;
        const lastMidi = history[lastIndex];
        drawGrid(gridLabels, plot, lastMidi);

        ctx.save();
        ctx.shadowColor = 'rgba(46, 168, 161, 0.35)';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = 'rgba(46, 168, 161, 0.35)';
        ctx.lineWidth = 6;
        buildPath(plot);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(46, 168, 161, 0.95)';
        ctx.lineWidth = 2;
        buildPath(plot);
        ctx.stroke();
        ctx.restore();

        if (lastMidi !== null && !isNaN(lastMidi)) {
            const y = midiToY(lastMidi);
            const x = plot.right;
            ctx.fillStyle = '#2ea8a1';
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    render.reset = () => {
        history.fill(null);
        writeIndex = 0;
        viewMinMidi = midMidi - analyzerSettings.maxViewRangeSemitones / 2;
        viewMaxMidi = midMidi + analyzerSettings.maxViewRangeSemitones / 2;
        emaMidi = null;
        lastValidMidi = null;
        recentMidi.length = 0;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(0, 0, width, height);
        const gridLabels = buildGridLabels();
        const plot = getPlotBounds(gridLabels);
        drawGrid(gridLabels, plot, null);
    };

    render.reset();
    return render;
})();

initAnalyzerSettings();

function ensureCrepeAudioContext() {
    if (!crepeAudioContext) {
        crepeAudioContext = new AudioContext();
    }
    document.querySelectorAll('[data-srate]').forEach((node) => {
        node.textContent = crepeAudioContext.sampleRate;
    });
}

function resetCrepeSampleRateDisplay() {
    document.querySelectorAll('[data-srate]').forEach((node) => {
        node.textContent = '--';
    });
}

function setAnalyzerButtons({ micDisabled, tabDisabled, stopDisabled }) {
    if (pitchStartBtn) pitchStartBtn.disabled = !!micDisabled;
    if (pitchTabBtn) pitchTabBtn.disabled = !!tabDisabled;
    if (pitchStopBtn) pitchStopBtn.disabled = !!stopDisabled;
}

async function closeCrepeAudioContext() {
    if (!crepeAudioContext) return;
    try {
        if (crepeAudioContext.state !== 'closed') {
            await crepeAudioContext.close();
        }
    } catch (error) {
        console.warn('CREPE AudioContext close error:', error);
    } finally {
        crepeAudioContext = null;
        resetCrepeSampleRateDisplay();
    }
}

function resample(audioBuffer, onComplete) {
    const interpolate = (audioBuffer.sampleRate % 16000 !== 0);
    const multiplier = audioBuffer.sampleRate / 16000;
    const original = audioBuffer.getChannelData(0);
    const subsamples = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
        if (!interpolate) {
            subsamples[i] = original[i * multiplier];
        } else {
            const left = Math.floor(i * multiplier);
            const right = left + 1;
            const p = i * multiplier - left;
            subsamples[i] = (1 - p) * original[left] + p * original[right];
        }
    }
    onComplete(subsamples);
}

function ensureCentMapping() {
    if (!centMapping) {
        centMapping = tf.add(tf.linspace(0, 7180, 360), tf.tensor(1997.3794084376191));
    }
}

function processAudioBuffer(event) {
    if (!crepeRunning || !crepeModel) return;
    ensureCentMapping();
    resample(event.inputBuffer, (resampled) => {
        tf.tidy(() => {
            const frame = tf.tensor(resampled.slice(0, 1024));
            const zeromean = tf.sub(frame, tf.mean(frame));
            const framestd = tf.tensor(tf.norm(zeromean).dataSync() / Math.sqrt(1024));
            const normalized = tf.div(zeromean, framestd);
            const input = normalized.reshape([1, 1024]);
            const activation = crepeModel.predict([input]).reshape([360]);

            const confidence = activation.max().dataSync()[0];
            const center = activation.argMax().dataSync()[0];

            const start = Math.max(0, center - 4);
            const end = Math.min(360, center + 5);
            const weights = activation.slice([start], [end - start]);
            const cents = centMapping.slice([start], [end - start]);

            const products = tf.mul(weights, cents);
            const productSum = products.dataSync().reduce((a, b) => a + b, 0);
            const weightSum = weights.dataSync().reduce((a, b) => a + b, 0);
            const predictedCent = weightSum ? productSum / weightSum : NaN;
            const predictedHz = 10 * Math.pow(2, predictedCent / 1200.0);

            updatePitchDisplay(predictedHz, confidence);
            updatePitchGraph(predictedHz, confidence);
            updateActivation(activation.dataSync());
        });
    });
}

function processAudioSource(sourceNode) {
    if (!crepeAudioContext) {
        throw new Error('AudioContext is not initialized.');
    }
    const minBufferSize = crepeAudioContext.sampleRate / 16000 * 1024;
    let bufferSize = 4;
    for (; bufferSize < minBufferSize; bufferSize *= 2) {}

    crepeScriptNode = crepeAudioContext.createScriptProcessor(bufferSize, 1, 1);
    crepeScriptNode.onaudioprocess = processAudioBuffer;

    crepeGainNode = crepeAudioContext.createGain();
    crepeGainNode.gain.setValueAtTime(0, crepeAudioContext.currentTime);

    sourceNode.connect(crepeScriptNode);
    crepeScriptNode.connect(crepeGainNode);
    crepeGainNode.connect(crepeAudioContext.destination);
}

function getUserMedia(constraints) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        return navigator.mediaDevices.getUserMedia(constraints);
    }
    const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (!legacy) {
        return Promise.reject(new Error('getUserMedia not supported'));
    }
    return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
}

async function loadCrepeModel() {
    if (crepeModel) return crepeModel;
    if (crepeLoadingPromise) return crepeLoadingPromise;
    if (!window.tf || !tf.loadModel) {
        throw new Error('TensorFlow.js not loaded');
    }
    crepeLoadingPromise = tf.loadModel(CREPE_MODEL_URL)
        .then((model) => {
            crepeModel = model;
            return model;
        })
        .catch((error) => {
            crepeLoadingPromise = null;
            throw error;
        });
    return crepeLoadingPromise;
}

async function prepareCrepeStart() {
    setAnalyzerButtons({ micDisabled: true, tabDisabled: true, stopDisabled: true });
    setPitchStatus('Loading CREPE model...');
    ensureCrepeAudioContext();
    if (crepeAudioContext.state === 'suspended') {
        await crepeAudioContext.resume();
    }
    await loadCrepeModel();
    resetCrepeUI();
}

function onCrepeInputEnded() {
    if (!crepeRunning) return;
    const message = crepeInputMode === 'tab' ? 'Tab sharing ended.' : 'Microphone stream ended.';
    stopCrepeAnalyzer(message);
}

function setCrepeInputTrack(track) {
    if (crepeActiveAudioTrack) {
        crepeActiveAudioTrack.removeEventListener('ended', onCrepeInputEnded);
    }
    crepeActiveAudioTrack = track || null;
    if (crepeActiveAudioTrack) {
        crepeActiveAudioTrack.addEventListener('ended', onCrepeInputEnded);
    }
}

function attachCrepeStream(stream, mode, noAudioMessage) {
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(noAudioMessage);
    }
    if (!crepeAudioContext) {
        throw new Error('AudioContext is not initialized.');
    }
    crepeStream = stream;
    crepeInputMode = mode;
    crepeMicSource = crepeAudioContext.createMediaStreamSource(stream);
    processAudioSource(crepeMicSource);
    setCrepeInputTrack(audioTracks[0]);
    crepeRunning = true;
}

async function startCrepeAnalyzer() {
    if (!pitchStartBtn || !pitchStopBtn) return;
    if (!window.isSecureContext) {
        setPitchStatus('Mic requires HTTPS or localhost.');
        return;
    }
    if (crepeRunning) return;

    try {
        await prepareCrepeStart();
        setPitchStatus('Requesting microphone...');
        const stream = await getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1
            }
        });
        attachCrepeStream(stream, 'mic', 'No microphone audio captured.');
        setPitchStatus('Mic on.');
        setAnalyzerButtons({ micDisabled: true, tabDisabled: true, stopDisabled: false });
    } catch (error) {
        console.error('CREPE mic start error:', error);
        await cleanupCrepeNodes({ closeAudioContext: true });
        resetCrepeUI();
        const message = error && error.message ? `Mic error: ${error.message}` : 'Mic permission denied or unavailable.';
        setPitchStatus(message);
        setAnalyzerButtons({ micDisabled: false, tabDisabled: false, stopDisabled: true });
    }
}

async function startCrepeTabAnalyzer() {
    if (!pitchTabBtn || !pitchStopBtn) return;
    if (!window.isSecureContext) {
        setPitchStatus('Tab capture requires HTTPS or localhost.');
        return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setPitchStatus('Tab capture is not supported in this browser.');
        return;
    }
    if (crepeRunning) return;

    try {
        await prepareCrepeStart();
        setPitchStatus('Select "This Tab" and enable "Share audio", then click Share.');
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        attachCrepeStream(stream, 'tab', 'No audio captured—please enable Share audio.');
        setPitchStatus('Tab audio on.');
        setAnalyzerButtons({ micDisabled: true, tabDisabled: true, stopDisabled: false });
    } catch (error) {
        console.error('CREPE tab start error:', error);
        await cleanupCrepeNodes({ closeAudioContext: true });
        resetCrepeUI();
        let message = 'Tab audio capture failed.';
        if (error && error.name === 'NotAllowedError') {
            message = 'Tab sharing was cancelled or blocked.';
        } else if (error && error.message) {
            message = error.message;
        }
        setPitchStatus(message);
        setAnalyzerButtons({ micDisabled: false, tabDisabled: false, stopDisabled: true });
    }
}

async function cleanupCrepeNodes({ closeAudioContext = false } = {}) {
    setCrepeInputTrack(null);
    if (crepeScriptNode) {
        crepeScriptNode.disconnect();
        crepeScriptNode.onaudioprocess = null;
        crepeScriptNode = null;
    }
    if (crepeMicSource) {
        crepeMicSource.disconnect();
        crepeMicSource = null;
    }
    if (crepeGainNode) {
        crepeGainNode.disconnect();
        crepeGainNode = null;
    }
    if (crepeStream) {
        crepeStream.getTracks().forEach((track) => track.stop());
        crepeStream = null;
    }
    crepeInputMode = null;
    crepeRunning = false;
    if (closeAudioContext) {
        await closeCrepeAudioContext();
    }
}

function resetCrepeUI() {
    updatePitchDisplay(NaN, 0);
    if (voicingConfidenceEl) {
        voicingConfidenceEl.textContent = '0.000';
    }
    if (confidenceFillEl) {
        confidenceFillEl.style.width = '0%';
    }
    if (updatePitchGraph.reset) {
        updatePitchGraph.reset();
    }
    if (updateActivation.reset) {
        updateActivation.reset();
    }
}

async function stopCrepeAnalyzer(message = null) {
    const statusMessage = message || (crepeInputMode === 'tab' ? 'Tab audio off.' : 'Mic off.');
    await cleanupCrepeNodes({ closeAudioContext: true });
    resetCrepeUI();
    setPitchStatus(statusMessage);
    setAnalyzerButtons({ micDisabled: false, tabDisabled: false, stopDisabled: true });
}

if (pitchStartBtn && pitchStopBtn) {
    pitchStartBtn.addEventListener('click', startCrepeAnalyzer);
    if (pitchTabBtn) {
        pitchTabBtn.addEventListener('click', startCrepeTabAnalyzer);
    }
    pitchStopBtn.addEventListener('click', () => {
        stopCrepeAnalyzer();
    });
    resetCrepeUI();
    resetCrepeSampleRateDisplay();
    setAnalyzerButtons({ micDisabled: false, tabDisabled: false, stopDisabled: true });
    setPitchStatus('Idle.');
    if (!window.tf) {
        setPitchStatus('TensorFlow.js failed to load.');
        setAnalyzerButtons({ micDisabled: true, tabDisabled: true, stopDisabled: true });
    }
}
