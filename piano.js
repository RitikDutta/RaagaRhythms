// --- Configuration ---
// Define the notes for the piano (Extended Range C3 to B5)
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

// Function to get Sargam notation with octave marker
function getSargamNotation(note) {
    if (!note || note.length < 2) return { indian: '', western: note };

    const noteName = note.slice(0, -1); // e.g., "C#", "A"
    const octave = parseInt(note.slice(-1)); // e.g., 3, 4, 5

    const sargamBase = SARGAM_BASE[noteName] || '?';
    let octaveMarker = '';

    // Assign octave markers based on standard middle C (C4) being middle octave
    if (octave < 4) {
        octaveMarker = '0'; // Mandra Saptak (Lower)
    } else if (octave === 4) {
        octaveMarker = ''; // Madhya Saptak (Middle) - No marker usually, but can add '_' if preferred
    } else { // octave > 4
        octaveMarker = '1'; // Taar Saptak (Higher)
    }

    // Combine base Sargam note with octave marker (handle middle octave Sa specifically if needed)
    // Special case: Middle Sa often doesn't have marker, others in middle do for clarity sometimes.
    // Let's add marker always for consistency in this code. Modify if needed.
    // Example: If you want middle octave notes NOT to have marker remove `+ octaveMarker` when octave === 4
    let indianNote = sargamBase;
     if (octave === 3) indianNote += '̣'; // Dot below for Mandra
     if (octave === 5) indianNote += '̇'; // Dot above for Taar

     // Alternative simple text markers:
     // if (octave < 4) indianNote += '₀'; // Subscript 0
     // else if (octave > 4) indianNote += '₁'; // Subscript 1

     // Using user requested format:
     if (octave === 3) indianNote += '0';
     else if (octave === 5) indianNote += '1';
     // Middle octave (octave 4) gets no suffix

    return {
        indian: indianNote,
        western: note // Keep original western note name
    };
}


const A4_FREQUENCY = 440; // Hz - Standard tuning frequency for A4
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Audio Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new AudioContext();
            console.log("AudioContext initialized.");
        } catch (e) {
            alert('Web Audio API is not supported in this browser');
            console.error("Error creating AudioContext:", e);
        }
    }
     // Resume context if it's suspended (often needed after page load)
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// --- Frequency Calculation ---
function getFrequency(note) {
    // (Function remains the same as before)
    if (!note || note.length < 2) return 0;
    const noteName = note.slice(0, -1);
    const octave = parseInt(note.slice(-1));
    const noteIndex = NOTE_NAMES.indexOf(noteName);
    if (noteIndex === -1) return 0;
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / 12);
}

// --- Note Playback ---
function playNote(frequency) {
    // (Function remains the same as before)
    if (!audioCtx || frequency <= 0) {
        console.warn("Cannot play note: AudioContext not ready or invalid frequency.", frequency);
        // Attempt to initialize/resume context again on play attempt if needed
        initAudioContext();
        if (!audioCtx) return; // Still failed
    }

     // Ensure context is running before playing
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
             console.log("AudioContext resumed for playback.");
             playNoteInternal(frequency); // Play after resume
        });
    } else {
        playNoteInternal(frequency); // Play directly if running
    }
}

// Internal play function called by playNote
function playNoteInternal(frequency) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    const now = audioCtx.currentTime;
    const attackTime = 0.02;
    const decayTime = 0.1;
    const sustainLevel = 0.6;
    const releaseTime = 0.4;
    const totalDuration = attackTime + decayTime + releaseTime + 0.1; // A bit shorter overall

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + attackTime);
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);
    gainNode.gain.setTargetAtTime(0, now + attackTime + decayTime, releaseTime / 3); // Exponential release feels more natural

    oscillator.start(now);
    oscillator.stop(now + totalDuration);
}


// --- Piano Key Generation and Event Handling ---
const pianoContainer = document.getElementById('piano');

if (pianoContainer) {
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


        // Add event listeners for mouse interaction
        keyElement.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent potential text selection issues
            initAudioContext(); // Initialize/Resume on interaction
            if (audioCtx) {
                const freq = getFrequency(note);
                playNote(freq);
                keyElement.classList.add('active');
            }
        });

        keyElement.addEventListener('mouseup', () => {
            keyElement.classList.remove('active');
        });

        keyElement.addEventListener('mouseleave', () => {
            keyElement.classList.remove('active');
        });

         // Optional: Add touch events for mobile
        keyElement.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent mouse event emulation and scrolling
            initAudioContext();
             if (audioCtx) {
                const freq = getFrequency(note);
                playNote(freq);
                keyElement.classList.add('active');
            }
        }, { passive: false }); // Need passive: false to call preventDefault

        keyElement.addEventListener('touchend', () => {
            keyElement.classList.remove('active');
        });
         keyElement.addEventListener('touchcancel', () => {
            keyElement.classList.remove('active');
        });


        pianoContainer.appendChild(keyElement);
    });

    // Add a general listener to initialize audio on first interaction anywhere
    // This helps comply with browser autoplay policies
    document.body.addEventListener('click', initAudioContext, { once: true });
    document.body.addEventListener('mousedown', initAudioContext, { once: true });
    document.body.addEventListener('touchstart', initAudioContext, { once: true });


} else {
    console.error("Piano container element not found!");
}