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

function getSargamNotation(note) {
    if (!note || note.length < 2) return { indian: '', western: note };
    const noteName = note.slice(0, -1);
    const octave = parseInt(note.slice(-1));
    const sargamBase = SARGAM_BASE[noteName] || '?';
    let indianNote = sargamBase;
    if (octave === 3) indianNote += '0';
    else if (octave === 5) indianNote += '1';
    return { indian: indianNote, western: note };
}

const A4_FREQUENCY = 440;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Audio Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
const activeNotes = {}; // Object to store { noteName: { oscillator, gainNode } }

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
    // Resume context if it's suspended
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
    if (noteIndex === -1) return 0;
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / 12);
}

// --- Note Playback Control ---

const ATTACK_TIME = 0.02; // Time to reach full volume
const RELEASE_TIME = 0.15; // Time to fade out after release

function startNote(note) {
    if (!initAudioContext() || !audioCtx) return; // Ensure context is ready
    if (activeNotes[note]) return; // Already playing this note

    const frequency = getFrequency(note);
    if (frequency <= 0) return;

     // Ensure context is running before playing
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
             console.log("AudioContext resumed for startNote.");
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
    gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + ATTACK_TIME); // Ramp up quickly to sustain level (0.7 is decent)

    oscillator.start(audioCtx.currentTime);

    // Store the nodes
    activeNotes[note] = { oscillator, gainNode };
    // console.log("Started:", note, activeNotes);
}


function stopNote(note) {
    if (!audioCtx) return; // No audio context, nothing to stop

    const noteData = activeNotes[note];
    if (noteData) {
        const { oscillator, gainNode } = noteData;
        const now = audioCtx.currentTime;

        // Apply Release (fade out)
        // Cancel any scheduled changes, start ramp down from current value
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Hold current value before ramping down
        gainNode.gain.linearRampToValueAtTime(0, now + RELEASE_TIME); // Fade to silent

        // Schedule oscillator to stop *after* gain reaches 0
        oscillator.stop(now + RELEASE_TIME + 0.05); // Add small buffer

        // Remove from active notes
        delete activeNotes[note];
        // console.log("Stopped:", note, activeNotes);
    }
}


// --- Piano Key Generation and Event Handling ---
const pianoContainer = document.getElementById('piano');

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

        // --- Event Listeners ---

        // Mouse Down
        keyElement.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startNote(note);
            keyElement.classList.add('active');
        });

        // Mouse Up
        keyElement.addEventListener('mouseup', (e) => {
            e.preventDefault();
            stopNote(note);
            keyElement.classList.remove('active');
        });

        // Mouse Leave (while pressed)
        keyElement.addEventListener('mouseleave', () => {
            // Only stop if it was actually playing (mouse was down)
            if (activeNotes[note]) {
                 stopNote(note);
                 keyElement.classList.remove('active');
            }
        });

        // Touch Start
        keyElement.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent mouse event emulation and scrolling/zooming
            startNote(note);
            keyElement.classList.add('active');
        }, { passive: false }); // Need passive: false to call preventDefault

        // Touch End
        keyElement.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopNote(note);
            keyElement.classList.remove('active');
        });

        // Touch Cancel (e.g., finger slides off screen)
         keyElement.addEventListener('touchcancel', (e) => {
            e.preventDefault();
             if (activeNotes[note]) {
                 stopNote(note);
                 keyElement.classList.remove('active');
            }
        });


        pianoContainer.appendChild(keyElement);
    });

    // Add a general listener to initialize audio context on first interaction
    // Using 'pointerdown' captures mouse, touch, and pen events more broadly
    document.body.addEventListener('pointerdown', initAudioContext, { once: true });


} else {
    console.error("Piano container element not found!");
}