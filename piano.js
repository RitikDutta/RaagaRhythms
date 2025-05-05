// --- Configuration ---
const NOTES = [
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5"
];

// Sargam Mapping (Assuming C is Sa)
// S=Sa, r=Komal Re, R=Shuddha Re, g=Komal Ga, G=Shuddha Ga, m=Shuddha Ma,
// M=Tivra Ma, P=Pa, d=Komal Dha, D=Shuddha Dha, n=Komal Ni, N=Shuddha Ni
const SARGAM_BASE = {
    "C": "S", "C#": "r", "D": "R", "D#": "g", "E": "G", "F": "m",
    "F#": "M", "G": "P", "G#": "d", "A": "D", "A#": "n", "B": "N"
};

// Function to get Sargam notation for display on keys
function getSargamNotation(note) {
    if (!note || note.length < 2) return { indian: '', western: note };
    const noteName = note.slice(0, -1); // e.g., "C#", "A"
    const octave = parseInt(note.slice(-1)); // e.g., 3, 4, 5

    const sargamBase = SARGAM_BASE[noteName] || '?';
    let indianNote = sargamBase;

    // Add octave marker based on user request (0 for lower, 1 for higher)
    if (octave === 3) indianNote += '0';
    else if (octave === 5) indianNote += '1';
    // Middle octave (4) has no suffix

    return {
        indian: indianNote,
        western: note // Keep original western note name
    };
}

// --- Reverse Mapping (Sargam Input -> Western Note) ---
let WESTERN_NOTE_MAP = {};

function createWesternNoteMap() {
    WESTERN_NOTE_MAP = {}; // Reset if called again
    NOTES.forEach(westernNote => {
        // Generate the sargam notation including the octave marker
        const { indian: sargamWithOctave } = getSargamNotation(westernNote);
        // Also generate the base sargam note for the middle octave (4)
        let baseSargam = null;
        if(westernNote.endsWith('4')) {
            const noteName = westernNote.slice(0, -1);
            baseSargam = SARGAM_BASE[noteName] || null;
        }

        // Store mapping for notation with octave marker (e.g., "S0", "r1")
        if (sargamWithOctave && !WESTERN_NOTE_MAP[sargamWithOctave]) {
             WESTERN_NOTE_MAP[sargamWithOctave] = westernNote;
        }
        // Add mapping for lowercase version
        const lowerSargamWithOctave = sargamWithOctave.toLowerCase();
        if (lowerSargamWithOctave && !WESTERN_NOTE_MAP[lowerSargamWithOctave]) {
            WESTERN_NOTE_MAP[lowerSargamWithOctave] = westernNote;
        }

        // Store mapping for middle octave base notes (without marker, e.g., "S", "g")
        if (baseSargam) {
             if (!WESTERN_NOTE_MAP[baseSargam]) {
                 WESTERN_NOTE_MAP[baseSargam] = westernNote;
             }
             // Add mapping for lowercase version
             const lowerBaseSargam = baseSargam.toLowerCase();
             if (lowerBaseSargam && !WESTERN_NOTE_MAP[lowerBaseSargam]) {
                  WESTERN_NOTE_MAP[lowerBaseSargam] = westernNote;
             }
        }
    });
    // console.log("Western Note Map:", WESTERN_NOTE_MAP); // For debugging
}
createWesternNoteMap(); // Create the map immediately

const A4_FREQUENCY = 440; // Hz - Standard tuning frequency for A4
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Audio Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
const activeNotes = {}; // Object to store { noteName: { oscillator, gainNode } } for manual playing

function initAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new AudioContext();
            console.log("AudioContext initialized.");
        } catch (e) {
            alert('Web Audio API is not supported in this browser');
            console.error("Error creating AudioContext:", e);
            return false; // Indicate failure
        }
    }
    // Resume context if it's suspended (often needed after page load or inactivity)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
             console.log("AudioContext resumed.");
        });
    }
    return true; // Indicate success or already initialized
}


// --- Frequency Calculation ---
function getFrequency(note) {
    if (!note || note.length < 2) return 0;
    const noteName = note.slice(0, -1);
    const octave = parseInt(note.slice(-1));
    const noteIndex = NOTE_NAMES.indexOf(noteName);
    if (noteIndex === -1) {
         console.warn(`Note name not found in NOTE_NAMES: ${noteName}`);
         return 0;
    }
    // Calculate number of semitones away from A4 (index 9 in octave 4)
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / 12);
}


// --- Note Playback Control (Manual Piano Keys) ---
const ATTACK_TIME = 0.02; // Time to reach full volume for manual play
const RELEASE_TIME = 0.15; // Time to fade out after release for manual play

function startNote(note) {
    if (!initAudioContext() || !audioCtx) return; // Ensure context is ready
    if (activeNotes[note]) return; // Already playing this note

    const frequency = getFrequency(note);
    if (frequency <= 0) return;

     // Ensure context is running before playing
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
             // console.log("AudioContext resumed for startNote.");
             startNoteInternal(note, frequency);
        });
    } else {
        startNoteInternal(note, frequency);
    }
}

function startNoteInternal(note, frequency) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'triangle'; // Or 'sine', 'square', 'sawtooth'
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    // Apply Attack
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime); // Start silent
    gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + ATTACK_TIME); // Ramp up quickly to sustain level

    oscillator.start(audioCtx.currentTime);

    // Store the nodes
    activeNotes[note] = { oscillator, gainNode };
    // console.log("Started:", note);
}


function stopNote(note) {
    if (!audioCtx) return; // No audio context, nothing to stop

    const noteData = activeNotes[note];
    if (noteData) {
        const { oscillator, gainNode } = noteData;
        const now = audioCtx.currentTime;

        // Apply Release (fade out)
        gainNode.gain.cancelScheduledValues(now); // Cancel any pending changes
        gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Hold current value before ramping down
        gainNode.gain.linearRampToValueAtTime(0, now + RELEASE_TIME); // Fade to silent

        // Schedule oscillator to stop *after* gain reaches 0
        oscillator.stop(now + RELEASE_TIME + 0.05); // Add small buffer

        // Remove from active notes
        delete activeNotes[note];
        // console.log("Stopped:", note);
    }
}


// --- Sequence Playback ---
const SEQUENCE_NOTE_DURATION = 0.4; // BASE duration for single note/hyphen
const SEQUENCE_PAUSE_DURATION = 0.2; // BASE duration for pause
const SEQUENCE_ATTACK = 0.02;
const SEQUENCE_RELEASE = 0.1;

// Get references to speed slider elements
const speedSlider = document.getElementById('speedSlider');
const speedValueDisplay = document.getElementById('speedValue');

// Global variable to store current speed factor
// Initialized from the slider's default value (or 1.0 if slider not found)
let currentSpeedFactor = speedSlider ? parseFloat(speedSlider.value) : 1.0;


// Playback function for single, fixed-pitch notes in a sequence
function playSequenceNote(frequency, startTime, duration) {
    if (!audioCtx || frequency <= 0 || duration <= 0) return;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // ADSR Envelope adjusted for the specific note duration
    // Ensure attack/release times are sensible relative to the potentially very short duration
    const actualAttack = Math.min(SEQUENCE_ATTACK, duration * 0.2); // Attack no more than 20%
    const actualRelease = Math.min(SEQUENCE_RELEASE, duration * 0.3); // Release no more than 30%
    const sustainDuration = duration - actualAttack - actualRelease;

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.8, startTime + actualAttack); // Attack peak

    // Schedule start of release (end of sustain)
    if (sustainDuration > 0.001) { // Check if there's any sustain time
         const sustainEndTime = startTime + actualAttack + sustainDuration;
         // Ensure we don't schedule setValueAtTime in the past if duration is very short
         if(sustainEndTime > audioCtx.currentTime) {
            gainNode.gain.setValueAtTime(0.8, sustainEndTime); // Hold sustain level
         }
         // Ensure release starts after sustain or immediately after attack if no sustain
         const releaseStartTime = Math.max(startTime + actualAttack, sustainEndTime);
         gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + actualRelease); // Release ramp
    } else {
        // If note is very short (attack+release >= duration), just ramp down from peak attack
        const releaseStartTime = startTime + actualAttack;
         gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + actualRelease); // Ramp down over the release time
    }

    oscillator.start(startTime);
    // Stop the oscillator slightly after the gain ramp finishes
    oscillator.stop(startTime + duration + 0.05);
}


// Playback function for Meend (Glide) in a sequence
function playMeendNote(startFreq, endFreq, startTime, duration) {
    if (!audioCtx || startFreq <= 0 || endFreq <= 0 || duration <= 0) return;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'triangle'; // Sine or triangle can work well

    // Set initial frequency and schedule the ramp (the core of Meend)
    oscillator.frequency.setValueAtTime(startFreq, startTime);
    oscillator.frequency.linearRampToValueAtTime(endFreq, startTime + duration);
    // oscillator.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration); // Alternative - sounds different

    // Gain envelope for the glide duration
    const attack = Math.min(SEQUENCE_ATTACK, duration * 0.1); // Shorter attack for glide start
    const release = Math.min(SEQUENCE_RELEASE, duration * 0.1); // Shorter release for glide end
    const sustainDuration = duration - attack - release;
    const sustainEndTime = startTime + attack + sustainDuration;


    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.7, startTime + attack); // Ramp up gain quickly

    if (sustainDuration > 0.001) {
        // Ensure we don't schedule setValueAtTime in the past
         if(sustainEndTime > audioCtx.currentTime) {
            gainNode.gain.setValueAtTime(0.7, sustainEndTime); // Hold gain during glide
         }
         const releaseStartTime = Math.max(startTime + attack, sustainEndTime);
         gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + release); // Ramp down gain at end
    } else {
        // Very short glide, just ramp down from attack peak
        const releaseStartTime = startTime + attack;
        gainNode.gain.linearRampToValueAtTime(0, releaseStartTime + release);
    }

    oscillator.start(startTime);
    // Stop the oscillator shortly after the gain ramp and frequency ramp finish
    oscillator.stop(startTime + duration + 0.05);
}


// Main function to parse and play the sequence from the input box
function playSequence() {
    if (!initAudioContext() || !audioCtx) {
        alert("Audio Context not ready. Please click on the page or a key first.");
        return;
    }

    // Read the CURRENT speed factor when Play is clicked
    const speedFactor = currentSpeedFactor; // Use the globally updated value

    const sequenceInput = document.getElementById('sargamInput');
    const playButton = document.getElementById('playSequenceBtn');
    const sequenceText = sequenceInput.value;

    if (!sequenceText.trim()) return; // Nothing to play

    // --- Enhanced Parsing Logic ---
    const tokens = [];
    // Regex to capture: Meend, Comma, Repetition, Single Note, Whitespace
    const notePattern = "[SrRgGmMPdDnN][01]?"; // Reusable pattern for a single note+octave
    const regex = new RegExp(
        `(${notePattern})(-+)(${notePattern})` + // 1. Meend (Group 1: Start, Group 2: Hyphens, Group 3: End)
        `|(\\,)` +                                // 4. Comma (Group 4)
        `|((${notePattern})(\\6+))` +             // 5. Repetition (Group 5: Full match, Group 6: Single unit)
        `|(${notePattern})` +                     // 8. Single Note (Group 8)
        `|(\\s+)`,                                // 9. Whitespace (Group 9)
        'gi' // Global, Case Insensitive
    );

    let match;
    while ((match = regex.exec(sequenceText)) !== null) {
        // console.log("Match:", match); // Debugging regex matches

        if (match[1] && match[2] && match[3]) { // Meend matched
            const startNote = match[1];
            const hyphenCount = match[2].length;
            const endNote = match[3];
            tokens.push({ type: 'meend', startNote, endNote, count: hyphenCount });
        } else if (match[4]) { // Comma matched
            // Count consecutive commas
            let commaCount = 1;
            let lastIndex = regex.lastIndex;
            while (sequenceText[lastIndex] === ',') {
                commaCount++;
                lastIndex++;
            }
            regex.lastIndex = lastIndex; // Move regex index past consecutive commas
            tokens.push({ type: 'pause', value: ',', count: commaCount });

        } else if (match[5] && match[6]) { // Repetition matched
            const fullMatch = match[5];
            const singleNote = match[6];
            const count = singleNote ? fullMatch.length / singleNote.length : 1;
            tokens.push({ type: 'note', value: singleNote, count: count });
         } else if (match[8]) { // Single Note matched
            tokens.push({ type: 'note', value: match[8], count: 1 });
        }
        // Ignore whitespace (match[9])
    }
    // console.log("Tokens:", tokens); // Debugging parsed tokens

    // --- Playback Scheduling ---
    let currentTime = audioCtx.currentTime + 0.1; // Start playback shortly after click
    let totalDuration = 0.1; // Keep track of total time for button re-enabling

    playButton.disabled = true; // Disable button during playback

    tokens.forEach(token => {
        if (token.type === 'pause') {
            // Apply speed factor to pause duration
            const actualPauseDuration = (SEQUENCE_PAUSE_DURATION * token.count) / speedFactor;
            currentTime += actualPauseDuration;
            totalDuration += actualPauseDuration;
        }
        else if (token.type === 'note') {
            const sargamNote = token.value;
            const noteCount = token.count;
            // Lookup western note (case-insensitive)
            const westernNote = WESTERN_NOTE_MAP[sargamNote] || WESTERN_NOTE_MAP[sargamNote.toLowerCase()];

            if (westernNote) {
                const frequency = getFrequency(westernNote);
                if (frequency > 0) {
                    // Apply speed factor to note duration
                    const actualNoteDuration = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor;
                    playSequenceNote(frequency, currentTime, actualNoteDuration);
                    currentTime += actualNoteDuration;
                    totalDuration += actualNoteDuration;
                } else {
                    console.warn(`Could not get frequency for note: ${westernNote} (mapped from ${sargamNote})`);
                    const skipDuration = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor; currentTime += skipDuration; totalDuration += skipDuration;
                }
            } else {
                console.warn(`Unknown Sargam note symbol: ${sargamNote}`);
                const skipDuration = (SEQUENCE_NOTE_DURATION * noteCount) / speedFactor; currentTime += skipDuration; totalDuration += skipDuration;
            }
        }
        else if (token.type === 'meend') {
            const startSargam = token.startNote;
            const endSargam = token.endNote;
            const meendMultiplier = token.count; // Duration based on hyphen count

            // Lookup western notes (case-insensitive)
            const startWestern = WESTERN_NOTE_MAP[startSargam] || WESTERN_NOTE_MAP[startSargam.toLowerCase()];
            const endWestern = WESTERN_NOTE_MAP[endSargam] || WESTERN_NOTE_MAP[endSargam.toLowerCase()];

            if (startWestern && endWestern) {
                const startFreq = getFrequency(startWestern);
                const endFreq = getFrequency(endWestern);

                if (startFreq > 0 && endFreq > 0) {
                    // Apply speed factor to meend duration
                    const actualMeendDuration = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor;
                    playMeendNote(startFreq, endFreq, currentTime, actualMeendDuration);
                    currentTime += actualMeendDuration;
                    totalDuration += actualMeendDuration;
                } else {
                     console.warn(`Could not get frequency for Meend notes: ${startSargam}(${startFreq}) or ${endSargam}(${endFreq})`);
                     const skipDuration = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor; currentTime += skipDuration; totalDuration += skipDuration;
                 }
            } else {
                 console.warn(`Unknown Sargam note in Meend: ${startSargam} or ${endSargam}`);
                 const skipDuration = (SEQUENCE_NOTE_DURATION * meendMultiplier) / speedFactor; currentTime += skipDuration; totalDuration += skipDuration;
            }
        }
    });

    // Re-enable the button after the sequence is scheduled to finish
    // Use a minimum timeout in case totalDuration is very small or zero
    const timeoutDuration = Math.max(50, totalDuration * 1000);
    setTimeout(() => {
        playButton.disabled = false;
    }, timeoutDuration);
}


// --- Piano Key Generation and Event Handling ---
const pianoContainer = document.getElementById('piano');

if (pianoContainer) {
    // Calculate white key index for black key positioning (used if CSS needs it)
    let whiteKeyIndex = 0;
    NOTES.forEach(note => {
        const keyElement = document.createElement('div');
        const isBlackKey = note.includes('#');
        const notations = getSargamNotation(note); // Get both notations

        keyElement.classList.add('key');
        keyElement.classList.add(isBlackKey ? 'black' : 'white');
        keyElement.dataset.note = note; // Store western note name

        // Create and append label spans
        const indianLabel = document.createElement('span');
        indianLabel.classList.add('indian-note');
        indianLabel.textContent = notations.indian;
        keyElement.appendChild(indianLabel);

        const westernLabel = document.createElement('span');
        westernLabel.classList.add('western-note');
        westernLabel.textContent = notations.western;
        keyElement.appendChild(westernLabel);

        // --- Event Listeners for Manual Play ---
        const handlePress = (e) => {
            e.preventDefault(); // Prevent default actions like text selection or scrolling
            startNote(note);
            keyElement.classList.add('active');
        };
        const handleRelease = (e) => {
             // Check if the event target is the key itself or a child span, and if the note is active
            if (e && (e.target === keyElement || keyElement.contains(e.target)) && activeNotes[note]) {
                 e.preventDefault();
                 stopNote(note);
                 keyElement.classList.remove('active');
            }
        };
        const handleLeave = (e) => {
            // Only stop if the note is active (meaning it was pressed down)
             if (activeNotes[note]) {
                 stopNote(note);
                 keyElement.classList.remove('active');
             }
        }

        // Mouse Events
        keyElement.addEventListener('mousedown', handlePress);
        keyElement.addEventListener('mouseup', handleRelease);
        keyElement.addEventListener('mouseleave', handleLeave); // Stop if mouse leaves while pressed

        // Touch Events
        // Use passive: false to allow preventDefault() inside the handler
        keyElement.addEventListener('touchstart', handlePress, { passive: false });
        keyElement.addEventListener('touchend', handleRelease, { passive: false });
        keyElement.addEventListener('touchcancel', handleRelease, { passive: false }); // Handle cancellation

        pianoContainer.appendChild(keyElement);

        // Increment white key index only for white keys (useful if CSS needs sequential numbering)
        if (!isBlackKey) {
            whiteKeyIndex++;
        }
    });
} else {
    console.error("Piano container element not found!");
}


// --- Initialize Audio Context & Add Other Listeners ---

// Attempt to initialize audio context on first user interaction anywhere
// Using 'pointerdown' captures mouse, touch, and pen events generally
document.body.addEventListener('pointerdown', initAudioContext, { once: true });

// Sequence Player Button Listener
const playButton = document.getElementById('playSequenceBtn');
if (playButton) {
    playButton.addEventListener('click', playSequence);
} else {
    console.error("Play sequence button not found!");
}

// Sequence Input Listener (allow Enter key)
const sargamInputElement = document.getElementById('sargamInput');
if (sargamInputElement) {
     sargamInputElement.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent potential form submission
            playSequence();
        }
    });
}

// Speed Slider Listener
if (speedSlider && speedValueDisplay) {
    // Update display initially
    speedValueDisplay.textContent = parseFloat(speedSlider.value).toFixed(2) + 'x';

    // Add listener for slider changes
    speedSlider.addEventListener('input', () => {
        currentSpeedFactor = parseFloat(speedSlider.value);
        speedValueDisplay.textContent = currentSpeedFactor.toFixed(2) + 'x';
        // console.log("Speed Factor Updated:", currentSpeedFactor); // For debugging
    });
} else {
    console.warn("Speed slider or value display element not found!"); // Warn instead of error
}

// --- Update Info Text for Sequence Player ---
const infoParagraphs = document.querySelectorAll('.sequence-player .info');
if (infoParagraphs.length > 1) {
    infoParagraphs[1].innerHTML = `(Notes: S R G m P D N, Komal: r g d n, Tivra: M. Octaves: 0 lower, 1 higher. e.g., S0, P, m1. Repeats: SSS. Meend/Glide: S-G, P--S1)`;
}