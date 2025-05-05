// --- Configuration ---
const NOTES = [
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5"
];

// Sargam Mapping (Assuming C is Sa)
const SARGAM_BASE = {
    "C": "S", "C#": "r", "D": "R", "D#": "g", "E": "G", "F": "m",
    "F#": "M", "G": "P", "G#": "d", "A": "D", "A#": "n", "B": "N"
};

// Function to get Sargam notation (used for display and reverse map creation)
function getSargamNotation(note) {
    if (!note || note.length < 2) return { indian: '', western: note };
    const noteName = note.slice(0, -1);
    const octave = parseInt(note.slice(-1));
    const sargamBase = SARGAM_BASE[noteName] || '?';
    let indianNote = sargamBase;
    if (octave === 3) indianNote += '0';
    else if (octave === 5) indianNote += '1';
    // Middle octave (4) has no suffix in this version
    return { indian: indianNote, western: note };
}

// --- NEW: Reverse Mapping (Sargam Input -> Western Note) ---
let WESTERN_NOTE_MAP = {}; // Will be populated after NOTES is defined

function createWesternNoteMap() {
    WESTERN_NOTE_MAP = {}; // Reset if called again
    NOTES.forEach(westernNote => {
        const { indian } = getSargamNotation(westernNote);
        if (indian && !WESTERN_NOTE_MAP[indian]) { // Avoid overwriting if duplicates somehow exist
             WESTERN_NOTE_MAP[indian] = westernNote;
        }
        // Add mapping for case-insensitivity (optional but helpful)
        const lowerIndian = indian.toLowerCase();
        if (lowerIndian && !WESTERN_NOTE_MAP[lowerIndian]) {
            WESTERN_NOTE_MAP[lowerIndian] = westernNote;
        }

        // Add base notes without octave markers if they are middle octave (octave 4)
        if (westernNote.endsWith('4')) {
             const baseSargam = indian; // Already calculated without marker for octave 4
             if (baseSargam && !WESTERN_NOTE_MAP[baseSargam]) {
                 WESTERN_NOTE_MAP[baseSargam] = westernNote;
             }
             const lowerBase = baseSargam.toLowerCase();
              if (lowerBase && !WESTERN_NOTE_MAP[lowerBase]) {
                 WESTERN_NOTE_MAP[lowerBase] = westernNote;
             }
        }
    });
     // console.log("Western Note Map:", WESTERN_NOTE_MAP); // For debugging
}
createWesternNoteMap(); // Create the map immediately

const A4_FREQUENCY = 440;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Audio Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
const activeNotes = {}; // For manual key presses

function initAudioContext() {
    // ... (initAudioContext function remains the same as before) ...
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
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
             console.log("AudioContext resumed.");
        });
    }
    return true; // Indicate success or already initialized
}


// --- Frequency Calculation ---
function getFrequency(note) {
    // ... (getFrequency function remains the same as before) ...
    if (!note || note.length < 2) return 0;
    const noteName = note.slice(0, -1);
    const octave = parseInt(note.slice(-1));
    const noteIndex = NOTE_NAMES.indexOf(noteName);
    if (noteIndex === -1) return 0;
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / 12);
}


// --- Note Playback Control (Manual Keys) ---
const ATTACK_TIME = 0.02;
const RELEASE_TIME = 0.15;

function startNote(note) {
    // ... (startNote function remains the same as before) ...
     if (!initAudioContext() || !audioCtx) return;
    if (activeNotes[note]) return;
    const frequency = getFrequency(note);
    if (frequency <= 0) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => startNoteInternal(note, frequency));
    } else {
        startNoteInternal(note, frequency);
    }
}
function startNoteInternal(note, frequency) {
    // ... (startNoteInternal remains the same as before) ...
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + ATTACK_TIME);
    oscillator.start(audioCtx.currentTime);
    activeNotes[note] = { oscillator, gainNode };
}

function stopNote(note) {
    // ... (stopNote function remains the same as before) ...
    if (!audioCtx) return;
    const noteData = activeNotes[note];
    if (noteData) {
        const { oscillator, gainNode } = noteData;
        const now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + RELEASE_TIME);
        oscillator.stop(now + RELEASE_TIME + 0.05);
        delete activeNotes[note];
    }
}

// --- NEW: Sequence Playback ---
const SEQUENCE_NOTE_DURATION = 0.4; // seconds
const SEQUENCE_PAUSE_DURATION = 0.2; // seconds (duration of a comma)
const SEQUENCE_ATTACK = 0.02;
const SEQUENCE_RELEASE = 0.1; // Shorter release for distinct sequence notes

// Function to play a single note within the sequence at a specific time
function playSequenceNote(frequency, startTime) {
    if (!audioCtx || frequency <= 0) return;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // ADSR Envelope for sequence notes
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.8, startTime + SEQUENCE_ATTACK); // Attack
    // Hold sustain for most of the note duration before releasing
    const sustainEndTime = startTime + SEQUENCE_NOTE_DURATION - SEQUENCE_RELEASE;
    if (sustainEndTime > startTime + SEQUENCE_ATTACK) {
         gainNode.gain.setValueAtTime(0.8, sustainEndTime); // Maintain level until release starts
    }
    gainNode.gain.linearRampToValueAtTime(0, startTime + SEQUENCE_NOTE_DURATION); // Release

    oscillator.start(startTime);
    oscillator.stop(startTime + SEQUENCE_NOTE_DURATION + 0.05); // Stop shortly after note ends
}

// Main function to parse and play the sequence
function playSequence() {
    if (!initAudioContext() || !audioCtx) {
        alert("Audio Context not ready. Please click on the page or a key first.");
        return;
    }

    const sequenceInput = document.getElementById('sargamInput');
    const playButton = document.getElementById('playSequenceBtn');
    const sequenceText = sequenceInput.value.trim();

    if (!sequenceText) return; // Nothing to play

    // Prepare the sequence array, treating commas as separate elements
    const sequenceArray = sequenceText
        .replace(/,/g, ' , ') // Ensure commas are separated by spaces
        .split(/\s+/)        // Split by one or more spaces
        .filter(item => item !== ''); // Remove empty strings

    let currentTime = audioCtx.currentTime + 0.1; // Start playback shortly after click
    let totalDuration = 0.1; // Keep track of total time for button re-enabling

    playButton.disabled = true; // Disable button during playback

    sequenceArray.forEach(item => {
        if (item === ',') {
            // It's a pause
            currentTime += SEQUENCE_PAUSE_DURATION;
            totalDuration += SEQUENCE_PAUSE_DURATION;
        } else {
            // It's potentially a note
            const westernNote = WESTERN_NOTE_MAP[item] || WESTERN_NOTE_MAP[item.toLowerCase()]; // Check case-insensitively
            if (westernNote) {
                const frequency = getFrequency(westernNote);
                if (frequency > 0) {
                    playSequenceNote(frequency, currentTime);
                    currentTime += SEQUENCE_NOTE_DURATION;
                    totalDuration += SEQUENCE_NOTE_DURATION;
                } else {
                    console.warn(`Could not get frequency for note: ${westernNote} (mapped from ${item})`);
                    // Skip time for unplayable notes? Or add default duration? Let's add duration.
                     currentTime += SEQUENCE_NOTE_DURATION;
                     totalDuration += SEQUENCE_NOTE_DURATION;
                }
            } else {
                console.warn(`Unknown Sargam note or symbol: ${item}`);
                // Skip time for unknown symbols? Or add default duration? Let's add duration.
                 currentTime += SEQUENCE_NOTE_DURATION;
                 totalDuration += SEQUENCE_NOTE_DURATION;
            }
        }
    });

    // Re-enable the button after the sequence is scheduled to finish
    setTimeout(() => {
        playButton.disabled = false;
    }, totalDuration * 1000); // Convert total duration (seconds) to milliseconds
}


// --- Piano Key Generation and Event Handling ---
const pianoContainer = document.getElementById('piano');
// ...(Piano key generation loop remains the same as the previous version)...
if (pianoContainer) {
    NOTES.forEach(note => {
        const keyElement = document.createElement('div');
        const isBlackKey = note.includes('#');
        const notations = getSargamNotation(note);

        keyElement.classList.add('key');
        keyElement.classList.add(isBlackKey ? 'black' : 'white');
        keyElement.dataset.note = note;

        const indianLabel = document.createElement('span');
        indianLabel.classList.add('indian-note');
        indianLabel.textContent = notations.indian;
        keyElement.appendChild(indianLabel);

        const westernLabel = document.createElement('span');
        westernLabel.classList.add('western-note');
        westernLabel.textContent = notations.western;
        keyElement.appendChild(westernLabel);

        // Mouse/Touch listeners for manual play (remain the same)
        keyElement.addEventListener('mousedown', (e) => { /* ... startNote ... */ e.preventDefault(); startNote(note); keyElement.classList.add('active'); });
        keyElement.addEventListener('mouseup', (e) => { /* ... stopNote ... */ e.preventDefault(); stopNote(note); keyElement.classList.remove('active'); });
        keyElement.addEventListener('mouseleave', () => { /* ... stopNote ... */ if (activeNotes[note]) { stopNote(note); keyElement.classList.remove('active'); } });
        keyElement.addEventListener('touchstart', (e) => { /* ... startNote ... */ e.preventDefault(); startNote(note); keyElement.classList.add('active'); }, { passive: false });
        keyElement.addEventListener('touchend', (e) => { /* ... stopNote ... */ e.preventDefault(); stopNote(note); keyElement.classList.remove('active'); });
        keyElement.addEventListener('touchcancel', (e) => { /* ... stopNote ... */ e.preventDefault(); if (activeNotes[note]) { stopNote(note); keyElement.classList.remove('active'); } });

        pianoContainer.appendChild(keyElement);
    });
} else {
    console.error("Piano container element not found!");
}


// --- Initialize Audio Context & Add Sequence Button Listener ---
document.body.addEventListener('pointerdown', initAudioContext, { once: true }); // Initialize on first interaction

const playButton = document.getElementById('playSequenceBtn');
if (playButton) {
    playButton.addEventListener('click', playSequence);
} else {
    console.error("Play sequence button not found!");
}

const sargamInputElement = document.getElementById('sargamInput');
if (sargamInputElement) {
     // Optional: Allow pressing Enter in the input box to trigger play
     sargamInputElement.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission if it were in a form
            playSequence();
        }
    });
}