// --- Configuration ---
// Define the notes for the piano (adjust the range as needed)
const NOTES = [
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5"
];
const A4_FREQUENCY = 440; // Hz - Standard tuning frequency for A4
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Audio Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// Function to initialize AudioContext on first user interaction
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
}

// --- Frequency Calculation ---
function getFrequency(note) {
    if (!note || note.length < 2) return 0;

    const noteName = note.slice(0, -1); // e.g., "C#", "A"
    const octave = parseInt(note.slice(-1)); // e.g., 4, 5

    const noteIndex = NOTE_NAMES.indexOf(noteName);
    if (noteIndex === -1) return 0; // Note name not found

    // Calculate number of semitones away from A4
    // A4 is index 9 in octave 4
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);

    // Calculate frequency using the standard formula
    return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / 12);
}

// --- Note Playback ---
function playNote(frequency) {
    if (!audioCtx || frequency <= 0) {
        console.warn("Cannot play note: AudioContext not ready or invalid frequency.", frequency);
        return;
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // Connect nodes: oscillator -> gain -> destination (speakers)
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Configure oscillator
    oscillator.type = 'triangle'; // 'sine', 'square', 'sawtooth', 'triangle'
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    // Configure gain (simple ADSR envelope)
    const now = audioCtx.currentTime;
    const attackTime = 0.01; // Quick attack
    const decayTime = 0.1;
    const sustainLevel = 0.7;
    const releaseTime = 0.5; // How long it takes to fade out after peak
    const totalDuration = attackTime + decayTime + releaseTime + 0.2; // Give a little extra time

    gainNode.gain.setValueAtTime(0, now); // Start silent
    gainNode.gain.linearRampToValueAtTime(1.0, now + attackTime); // Attack peak
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime); // Decay to sustain
    // Schedule release (fade out) - starts fading after attack+decay
    gainNode.gain.linearRampToValueAtTime(0, now + attackTime + decayTime + releaseTime);

    // Start and stop the oscillator
    oscillator.start(now);
    oscillator.stop(now + totalDuration); // Stop slightly after gain reaches 0
}

// --- Piano Key Generation and Event Handling ---
const pianoContainer = document.getElementById('piano');

if (pianoContainer) {
    NOTES.forEach(note => {
        const keyElement = document.createElement('div');
        const isBlackKey = note.includes('#');

        keyElement.classList.add('key');
        keyElement.classList.add(isBlackKey ? 'black' : 'white');
        keyElement.dataset.note = note; // Store note name in data attribute

        // Add event listeners for mouse interaction
        keyElement.addEventListener('mousedown', () => {
            // Initialize AudioContext on first click/press
            initAudioContext();
            // Play note only if audio context is ready
            if (audioCtx) {
                const freq = getFrequency(note);
                playNote(freq);
                keyElement.classList.add('active'); // Visual feedback
            }
        });

        keyElement.addEventListener('mouseup', () => {
            keyElement.classList.remove('active');
        });

        // Remove active state if mouse leaves while pressed down
        keyElement.addEventListener('mouseleave', () => {
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