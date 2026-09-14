(function () {
    "use strict";

    const ROOTS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
    const ROOT_FREQUENCIES = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392, 415.3, 440, 466.16, 493.88];
    const SWARAS = ["Sa", "re", "Re", "ga", "Ga", "Ma", "Mā", "Pa", "dha", "Dha", "ni", "Ni"];
    const PRACTICE_NOTE_WINDOW_MS = 700;
    const PRACTICE_SILENCE_RESET_MS = 1000;
    const PRACTICE_TOLERANCE_CENTS = 55;

    const PRACTICE_MODES = {
        pakad: { label: "Pakad" },
        aaroh: { label: "Aaroh–Avroh" },
        bandish: { label: "Bandish" },
        meend: { label: "Meend" },
    };

    const RAAGAS = [
        { id: "yaman", name: "Yaman", time: "Evening", thaat: "Kalyan", mood: "Luminous devotion", vadi: "Ga", color: "teal", aroh: "Ni Re Ga Mā Pa Dha Ni Sa′", avroh: "Sa′ Ni Dha Pa Mā Ga Re Sa", pakad: "Ni Re Ga · Re Sa · Pa Mā Ga Re Sa", reference: "Chhupa Lo Yun Dil Mein", cue: "Notice how Teevra Ma opens into Pa before returning to Ga.", concept: "Meend" },
        { id: "bhairav", name: "Bhairav", time: "Morning", thaat: "Bhairav", mood: "Grave serenity", vadi: "Dha", color: "clay", aroh: "Sa re Ga Ma Pa dha Ni Sa′", avroh: "Sa′ Ni dha Pa Ma Ga re Sa", pakad: "Ga Ma re Sa · Sa dha dha Pa", reference: "Mohe Bhool Gaye Sanwariya", cue: "Listen for the gentle oscillation on komal Re and komal Dha.", concept: "Andolan" },
        { id: "bageshri", name: "Bageshri", time: "Night", thaat: "Kafi", mood: "Tender longing", vadi: "Ma", color: "indigo", aroh: "Sa ga Ma Dha ni Sa′", avroh: "Sa′ ni Dha Ma Pa Dha Ma ga Re Sa", pakad: "Dha ni Sa′ · Ma ga Re Sa", reference: "Radha Na Bole Na Bole Re", cue: "Feel the inward pull of komal Ga as the phrase settles on Ma.", concept: "Murki" },
        { id: "bhupali", name: "Bhupali", time: "Evening", thaat: "Kalyan", mood: "Quiet wonder", vadi: "Ga", color: "gold", aroh: "Sa Re Ga Pa Dha Sa′", avroh: "Sa′ Dha Pa Ga Re Sa", pakad: "Ga Re Sa · Dha Sa Re Ga", reference: "Jyoti Kalash Chhalke", cue: "Only five swaras—clarity comes from phrasing, not complexity.", concept: "Alap" },
        { id: "darbari", name: "Darbari Kanada", time: "Night", thaat: "Asavari", mood: "Majestic depth", vadi: "Re", color: "midnight", aroh: "Sa Re ga Ma Pa dha ni Sa′", avroh: "Sa′ dha ni Pa Ma ga Ma Re Sa", pakad: "Re ga~ga Ma · Pa · Ma ga~ga Re Sa", reference: "O Duniya Ke Rakhwale", cue: "The slow andolan on komal Ga gives Darbari its unmistakable weight.", concept: "Andolan" },
        { id: "desh", name: "Desh", time: "Night", thaat: "Khamaj", mood: "Romantic openness", vadi: "Re", color: "sky", aroh: "Sa Re Ma Pa Ni Sa′", avroh: "Sa′ ni Dha Pa Ma Ga Re Ga Sa", pakad: "Re Ma Pa · Ni Dha Pa · Dha Ma Ga Re", reference: "Vande Mataram", cue: "Hear the contrast between shuddha Ni upward and komal ni downward.", concept: "Kan swar" },
    ];

    const RAAG_SIGNATURES = {
        yaman: { scale: [11, 14, 16, 18, 19, 21, 23, 24], pakad: [11, 14, 16, 14, 12, 19, 18, 16, 14, 12] },
        bhairav: { scale: [12, 13, 16, 17, 19, 20, 23, 24], pakad: [16, 17, 13, 12, 12, 20, 20, 19] },
        bageshri: { scale: [12, 15, 17, 21, 22, 24], pakad: [21, 22, 24, 17, 15, 14, 12] },
        bhupali: { scale: [12, 14, 16, 19, 21, 24], pakad: [16, 14, 12, 21, 24, 14, 16] },
        darbari: { scale: [12, 14, 15, 17, 19, 20, 22, 24], pakad: [14, 15, 15.3, 17, 19, 17, 15.2, 14, 12] },
        desh: { scale: [12, 14, 17, 19, 23, 24], pakad: [14, 17, 19, 23, 21, 19, 17, 16, 14, 12] },
    };

    const state = {
        mode: "pakad",
        graphMode: new URLSearchParams(window.location.search).get("graph") === "practice" ? "practice" : "analyze",
        rootIndex: 0,
        inputMode: "idle",
        selectedRaagId: "yaman",
        timeFilter: "All",
        plannerGoal: "Sur stability",
        pitchHistory: [],
        centsHistory: [],
        currentFrequency: null,
        currentConfidence: 0,
        accuracy: 0,
    };

    const $ = (selector, root) => (root || document).querySelector(selector);
    const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
    const selectedRaag = () => RAAGAS.find((raag) => raag.id === state.selectedRaagId) || RAAGAS[0];
    let demoTimer = null;
    let previewTimer = null;
    let previewPlaying = false;
    let previewProgress = 24;
    let toastTimer = null;
    let practiceSilenceTimer = null;
    const practiceRun = {
        currentIndex: 0,
        results: [],
        samples: [],
        livePoints: [],
        voicedMs: 0,
        lastVoicedAt: 0,
        lastSampleAt: 0,
        started: false,
        complete: false,
        liveQuality: null,
        resetReason: "",
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function targetNotesFor(raagId, mode) {
        const signature = RAAG_SIGNATURES[raagId] || RAAG_SIGNATURES.yaman;
        if (mode === "aaroh") return signature.scale.concat(signature.scale.slice(0, -1).reverse());
        if (mode === "bandish") return signature.pakad.slice(0, 5).concat(signature.scale.slice(2, 6), signature.pakad.slice(-5));
        if (mode === "meend") {
            const anchors = signature.pakad.slice(0, 5);
            const result = [];
            anchors.forEach(function (note, index) {
                if (index === anchors.length - 1) {
                    result.push(note);
                    return;
                }
                const distance = anchors[index + 1] - note;
                result.push(note, note + distance / 3, note + distance * 2 / 3);
            });
            return result;
        }
        return signature.pakad.slice();
    }

    function graphPoints(values, width, height) {
        width = width || 760;
        height = height || 240;
        const min = 8;
        const max = 26;
        return values.map(function (value, index) {
            return {
                x: 30 + (index / Math.max(values.length - 1, 1)) * (width - 60),
                y: height - 24 - ((value - min) / (max - min)) * (height - 54),
            };
        });
    }

    function smoothCoordinatePath(points) {
        if (!points.length) return "";
        return points.reduce(function (path, point, index) {
            if (index === 0) return "M " + point.x + " " + point.y;
            const previous = points[index - 1];
            const controlX = (previous.x + point.x) / 2;
            return path + " C " + controlX + " " + previous.y + ", " + controlX + " " + point.y + ", " + point.x + " " + point.y;
        }, "");
    }

    function smoothPath(values, width, height) {
        if (!values.length) return "";
        return smoothCoordinatePath(graphPoints(values, width, height));
    }

    function graphY(value, height) {
        height = height || 240;
        return height - 24 - ((value - 8) / (26 - 8)) * (height - 54);
    }

    function swaraForGraphValue(value) {
        const relative = Math.round(value - 12);
        const normalized = ((relative % 12) + 12) % 12;
        const octave = Math.floor(relative / 12);
        if (octave < 0) return SWARAS[normalized] + "̣";
        if (octave > 0) return SWARAS[normalized] + "′";
        return SWARAS[normalized];
    }

    function frequencyToNote(frequency) {
        const saFrequency = ROOT_FREQUENCIES[state.rootIndex];
        const semitones = 12 * Math.log2(frequency / saFrequency);
        const rounded = Math.round(semitones);
        const cents = Math.round((semitones - rounded) * 100);
        const normalized = ((rounded % 12) + 12) % 12;
        const octaveOffset = Math.floor(rounded / 12);
        return {
            swara: SWARAS[normalized],
            cents: cents,
            semitones: semitones,
            octave: octaveOffset > 0 ? "tār" : octaveOffset < 0 ? "mandra" : "madhya",
        };
    }

    function updateGraph() {
        const notes = targetNotesFor(state.selectedRaagId, state.mode);
        const target = smoothPath(notes);
        $("#targetShadow").setAttribute("d", target);
        $("#targetPath").setAttribute("d", target);
        $("#practiceProgressPath").setAttribute("d", target);
        if (state.graphMode === "practice") {
            renderPracticeGraph(notes);
        } else {
            $("#livePath").setAttribute("d", smoothPath(state.pitchHistory.slice(-80)));
            $("#practiceGuides").innerHTML = "";
            $("#practicePoints").innerHTML = "";
            $("#practiceLiveMarker").hidden = true;
        }
    }

    function clearPracticeSilenceTimer() {
        if (practiceSilenceTimer) clearTimeout(practiceSilenceTimer);
        practiceSilenceTimer = null;
    }

    function median(values) {
        if (!values.length) return Infinity;
        const sorted = values.slice().sort(function (a, b) { return a - b; });
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function resetPracticeRun(reason) {
        const noteCount = targetNotesFor(state.selectedRaagId, state.mode).length;
        clearPracticeSilenceTimer();
        practiceRun.currentIndex = 0;
        practiceRun.results = new Array(noteCount).fill(null);
        practiceRun.samples = [];
        practiceRun.livePoints = [];
        practiceRun.voicedMs = 0;
        practiceRun.lastVoicedAt = 0;
        practiceRun.lastSampleAt = 0;
        practiceRun.started = false;
        practiceRun.complete = false;
        practiceRun.liveQuality = null;
        practiceRun.resetReason = reason || "";
    }

    function renderPracticeGraph(notes) {
        const points = graphPoints(notes);
        $("#practiceGuides").innerHTML = points.map(function (point) {
            return '<line x1="' + point.x + '" y1="' + (point.y + 10) + '" x2="' + point.x + '" y2="228"></line>';
        }).join("");

        $("#practicePoints").innerHTML = points.map(function (point, index) {
            const result = practiceRun.results[index];
            const isActive = !practiceRun.complete && index === practiceRun.currentIndex;
            let className = "practice-point";
            if (result === true) className += " is-correct";
            else if (result === false) className += " is-incorrect";
            else if (isActive) {
                className += " is-active";
                if (practiceRun.liveQuality === true) className += " is-live-correct";
                if (practiceRun.liveQuality === false) className += " is-live-incorrect";
            }
            const labelY = point.y < 34 ? point.y + 25 : point.y - 16;
            return '<g class="' + className + '" data-practice-point="' + index + '">' +
                '<circle class="practice-point-halo" cx="' + point.x + '" cy="' + point.y + '" r="12"></circle>' +
                '<circle class="practice-point-ring" cx="' + point.x + '" cy="' + point.y + '" r="7"></circle>' +
                '<circle class="practice-point-core" cx="' + point.x + '" cy="' + point.y + '" r="2.5"></circle>' +
                '<text x="' + point.x + '" y="' + labelY + '" text-anchor="middle">' + swaraForGraphValue(notes[index]) + '</text>' +
            '</g>';
        }).join("");

        $("#livePath").setAttribute("d", smoothCoordinatePath(practiceRun.livePoints));
        const marker = $("#practiceLiveMarker");
        const lastPoint = practiceRun.livePoints[practiceRun.livePoints.length - 1];
        marker.hidden = !lastPoint;
        if (lastPoint) {
            marker.setAttribute("cx", lastPoint.x);
            marker.setAttribute("cy", lastPoint.y);
            marker.classList.toggle("is-correct", practiceRun.liveQuality === true);
            marker.classList.toggle("is-incorrect", practiceRun.liveQuality === false);
        }

        const completed = practiceRun.results.filter(function (result) { return result !== null; }).length;
        let pathProgress = points.length > 1 ? completed / (points.length - 1) : completed;
        if (lastPoint && points.length > 1) pathProgress = (lastPoint.x - points[0].x) / (points[points.length - 1].x - points[0].x);
        if (practiceRun.complete) pathProgress = 1;
        pathProgress = clamp(pathProgress, 0, 1);
        const progressPath = $("#practiceProgressPath");
        try {
            const length = progressPath.getTotalLength();
            progressPath.style.strokeDasharray = length + " " + length;
            progressPath.style.strokeDashoffset = String(length * (1 - pathProgress));
        } catch (error) {
            progressPath.style.strokeDasharray = "100";
            progressPath.style.strokeDashoffset = String(100 * (1 - pathProgress));
        }

        const status = $("#practiceStep");
        const target = $("#practiceTargetLabel");
        if (practiceRun.complete) {
            const correct = practiceRun.results.filter(Boolean).length;
            status.textContent = "Phrase complete · " + correct + "/" + notes.length + " correct";
            target.textContent = "Pause for one second to begin again";
        } else if (!practiceRun.started) {
            status.textContent = practiceRun.resetReason === "silence" ? "Restarted after silence · Note 1 of " + notes.length : "Ready · Note 1 of " + notes.length;
            target.textContent = "Begin on " + swaraForGraphValue(notes[0]);
        } else {
            status.textContent = "Note " + (practiceRun.currentIndex + 1) + " of " + notes.length;
            target.textContent = "Hold " + swaraForGraphValue(notes[practiceRun.currentIndex]) + " · ±" + PRACTICE_TOLERANCE_CENTS + " cents";
        }
    }

    function updatePracticeScore() {
        const completedResults = practiceRun.results.filter(function (result) { return result !== null; });
        const correct = completedResults.filter(Boolean).length;
        state.accuracy = completedResults.length ? Math.round(correct / completedResults.length * 100) : 0;
        $("#accuracyValue").textContent = state.accuracy + "%";
        $("#accuracyFill").style.width = state.accuracy + "%";
    }

    function schedulePracticeSilenceReset() {
        clearPracticeSilenceTimer();
        practiceSilenceTimer = setTimeout(function () {
            practiceSilenceTimer = null;
            const activeInput = state.inputMode === "mic" || state.inputMode === "tab" || state.inputMode === "demo";
            if (state.graphMode !== "practice" || !activeInput) return;
            if (Date.now() - practiceRun.lastVoicedAt < PRACTICE_SILENCE_RESET_MS) {
                schedulePracticeSilenceReset();
                return;
            }
            resetPitch("silence");
            setEngineMessage("Practice restarted after one second of silence. Begin again from the leftmost note.");
        }, PRACTICE_SILENCE_RESET_MS);
    }

    function handlePracticePitch(relative, confidence) {
        const notes = targetNotesFor(state.selectedRaagId, state.mode);
        const now = Date.now();
        clearPracticeSilenceTimer();
        practiceRun.lastVoicedAt = now;
        schedulePracticeSilenceReset();
        if (practiceRun.complete) {
            renderPracticeGraph(notes);
            return;
        }

        if (!practiceRun.started) {
            practiceRun.started = true;
            practiceRun.lastSampleAt = now;
            practiceRun.resetReason = "";
        }

        const elapsed = practiceRun.lastSampleAt ? clamp(now - practiceRun.lastSampleAt, 0, 180) : 0;
        practiceRun.lastSampleAt = now;
        practiceRun.voicedMs += elapsed;
        const targetValue = notes[practiceRun.currentIndex];
        const errorCents = Math.abs(relative - targetValue) * 100;
        practiceRun.samples.push(errorCents);
        practiceRun.liveQuality = errorCents <= PRACTICE_TOLERANCE_CENTS && confidence >= 0.5;

        const points = graphPoints(notes);
        const endPoint = points[practiceRun.currentIndex];
        const startPoint = points[Math.max(0, practiceRun.currentIndex - 1)];
        const fraction = practiceRun.currentIndex === 0 ? 0 : clamp(practiceRun.voicedMs / PRACTICE_NOTE_WINDOW_MS, 0, 1);
        practiceRun.livePoints.push({
            x: startPoint.x + (endPoint.x - startPoint.x) * fraction,
            y: clamp(graphY(relative), 8, 232),
        });
        practiceRun.livePoints = practiceRun.livePoints.slice(-240);

        if (practiceRun.voicedMs >= PRACTICE_NOTE_WINDOW_MS) {
            const wasCorrect = median(practiceRun.samples) <= PRACTICE_TOLERANCE_CENTS;
            practiceRun.results[practiceRun.currentIndex] = wasCorrect;
            practiceRun.currentIndex += 1;
            practiceRun.samples = [];
            practiceRun.voicedMs = 0;
            practiceRun.lastSampleAt = now;
            practiceRun.liveQuality = null;
            if (practiceRun.currentIndex >= notes.length) {
                practiceRun.currentIndex = notes.length - 1;
                practiceRun.complete = true;
            }
            updatePracticeScore();
        }
        renderPracticeGraph(notes);
    }

    function handlePracticeSilence() {
        if (state.graphMode !== "practice" || !practiceRun.lastVoicedAt) return;
        if (!practiceSilenceTimer) schedulePracticeSilenceReset();
    }

    function practiceHint() {
        const raag = selectedRaag();
        if (state.mode === "pakad") return raag.pakad;
        if (state.mode === "aaroh") return raag.aroh + " · " + raag.avroh;
        if (state.mode === "bandish") return raag.reference + " · guided contour";
        return raag.concept + " · connect each swara without a break";
    }

    function renderPracticeContext() {
        const raag = selectedRaag();
        $("#practiceTitle").textContent = raag.name + " · " + PRACTICE_MODES[state.mode].label;
        $("#practiceHint").textContent = practiceHint();
        $$("[data-selected-raag]").forEach(function (node) { node.textContent = raag.name; });
        $$("[data-selected-concept]").forEach(function (node) { node.textContent = raag.concept; });
        updateGraph();
    }

    function updatePitch(frequency, confidence) {
        state.currentConfidence = confidence || 0;
        $("#confidenceValue").textContent = confidence ? "Confidence " + Math.round(confidence * 100) + "%" : "Confidence —";
        if (!frequency || !isFinite(frequency) || confidence < 0.5) {
            handlePracticeSilence();
            return;
        }

        const note = frequencyToNote(frequency);
        const relative = 12 + 12 * Math.log2(frequency / ROOT_FREQUENCIES[state.rootIndex]);
        state.currentFrequency = frequency;

        $("#currentSwara").textContent = note.swara;
        $("#currentFrequency").textContent = frequency.toFixed(1) + " Hz";
        $("#currentPitchMeta").textContent = (note.cents > 0 ? "+" : "") + note.cents + " cents · " + note.octave;

        if (state.graphMode === "practice") {
            handlePracticePitch(relative, confidence);
        } else {
            state.pitchHistory.push(clamp(relative, 8, 26));
            state.pitchHistory = state.pitchHistory.slice(-80);
            state.centsHistory.push(note.cents);
            state.centsHistory = state.centsHistory.slice(-24);

            const mean = state.centsHistory.reduce(function (total, value) { return total + value; }, 0) / state.centsHistory.length;
            const variance = state.centsHistory.reduce(function (total, value) {
                return total + Math.pow(value - mean, 2);
            }, 0) / state.centsHistory.length;
            const stability = 100 - clamp(Math.sqrt(variance) * 2.2, 0, 100);
            const tuning = 100 - clamp(Math.abs(note.cents) * 1.35, 0, 100);
            state.accuracy = Math.round((stability * 0.55 + tuning * 0.45) * (0.82 + confidence * 0.18));
            $("#accuracyValue").textContent = state.accuracy + "%";
            $("#accuracyFill").style.width = state.accuracy + "%";
            updateGraph();
        }
    }

    function resetPitch(reason) {
        state.pitchHistory = [];
        state.centsHistory = [];
        state.currentFrequency = null;
        state.currentConfidence = 0;
        state.accuracy = 0;
        $("#currentSwara").textContent = "Sa";
        $("#currentFrequency").textContent = ROOTS[state.rootIndex];
        $("#currentPitchMeta").textContent = "waiting for pitch";
        $("#accuracyValue").textContent = "0%";
        $("#accuracyFill").style.width = "0%";
        $("#confidenceValue").textContent = "Confidence —";
        resetPracticeRun(reason);
        updateGraph();
    }

    function setGraphMode(mode, announce) {
        if (mode !== "analyze" && mode !== "practice") return;
        if (state.inputMode === "demo" && demoTimer) {
            clearInterval(demoTimer);
            demoTimer = null;
            setInputMode("idle");
        }
        state.graphMode = mode;
        $("#pitchStage").dataset.graphMode = mode;
        $("#practiceProgressCopy").hidden = mode !== "practice";
        $("#accuracyLabel").textContent = mode === "practice" ? "Practice score" : "Pitch steadiness";
        $$("[data-graph-mode]").forEach(function (button) {
            const selected = button.dataset.graphMode === mode;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-selected", String(selected));
        });
        resetPitch();
        if (announce !== false) {
            setEngineMessage(mode === "practice"
                ? "Practice mode: sing each point from left to right. Rings turn green or red; one second of silence restarts the phrase."
                : "Analyze mode: the live pitch contour and steadiness display work as before.");
        }
    }

    function setEngineMessage(message, isError) {
        $("#engineMessage").textContent = message;
        $("#engineStatus").classList.toggle("is-error", Boolean(isError));
    }

    function setInputMode(mode) {
        state.inputMode = mode;
        const labels = {
            idle: "Ready to listen",
            mic: "Listening to your voice",
            tab: "Listening to shared tab",
            demo: "Guided phrase demo",
            loading: "Preparing pitch model",
        };
        $("#inputStatus").textContent = labels[mode] || labels.idle;
        $("#liveDot").dataset.live = mode !== "idle" && mode !== "loading" ? "true" : "false";
        $("#idleActions").hidden = mode !== "idle";
        $("#activeActions").hidden = mode === "idle" || mode === "loading";
        $("#startMic").disabled = mode === "loading";
        $("#startTab").disabled = mode === "loading";
    }

    class CrepePitchEngine {
        constructor(onPitch, onStatus, onStopped) {
            this.onPitch = onPitch;
            this.onStatus = onStatus;
            this.onStopped = onStopped;
            this.modelPromise = null;
            this.model = null;
            this.centMapping = null;
            this.audioContext = null;
            this.stream = null;
            this.source = null;
            this.processor = null;
            this.silentGain = null;
            this.processing = false;
            this.stopRequested = false;
        }

        loadModel() {
            if (this.modelPromise) return this.modelPromise;
            if (!window.tf || typeof window.tf.loadModel !== "function") {
                return Promise.reject(new Error("The bundled TensorFlow.js library did not load."));
            }
            this.onStatus("Loading the local CREPE neural pitch model…");
            this.modelPromise = window.tf.loadModel("./crepe/model/model.json").then((model) => {
                this.model = model;
                this.centMapping = window.tf.add(
                    window.tf.linspace(0, 7180, 360),
                    window.tf.tensor(1997.3794084376191)
                );
                return model;
            }).catch((error) => {
                this.modelPromise = null;
                throw error;
            });
            return this.modelPromise;
        }

        resample(audioBuffer) {
            const multiplier = audioBuffer.sampleRate / 16000;
            const original = audioBuffer.getChannelData(0);
            const samples = new Float32Array(1024);
            const interpolate = audioBuffer.sampleRate % 16000 !== 0;
            for (let index = 0; index < 1024; index += 1) {
                if (!interpolate) {
                    samples[index] = original[Math.floor(index * multiplier)] || 0;
                } else {
                    const left = Math.floor(index * multiplier);
                    const right = Math.min(left + 1, original.length - 1);
                    const amount = index * multiplier - left;
                    samples[index] = (1 - amount) * (original[left] || 0) + amount * (original[right] || 0);
                }
            }
            return samples;
        }

        analyse(event) {
            if (this.processing || !this.model || this.stopRequested) return;
            this.processing = true;
            try {
                const samples = this.resample(event.inputBuffer);
                let energy = 0;
                for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
                if (Math.sqrt(energy / samples.length) < 0.004) {
                    this.onPitch(null, 0);
                    return;
                }

                const result = window.tf.tidy(() => {
                    const frame = window.tf.tensor(samples);
                    const zeroMean = window.tf.sub(frame, window.tf.mean(frame));
                    const standardDeviation = window.tf.norm(zeroMean).dataSync()[0] / Math.sqrt(1024);
                    if (!isFinite(standardDeviation) || standardDeviation < 0.000001) return null;
                    const normalized = window.tf.div(zeroMean, window.tf.tensor(standardDeviation));
                    const input = normalized.reshape([1, 1024]);
                    const activation = this.model.predict([input]).reshape([360]);
                    const confidence = activation.max().dataSync()[0];
                    const center = activation.argMax().dataSync()[0];
                    const start = Math.max(0, center - 4);
                    const end = Math.min(360, center + 5);
                    const weights = activation.slice([start], [end - start]);
                    const cents = this.centMapping.slice([start], [end - start]);
                    const products = window.tf.mul(weights, cents);
                    const weightValues = weights.dataSync();
                    const productValues = products.dataSync();
                    let productSum = 0;
                    let weightSum = 0;
                    for (let index = 0; index < weightValues.length; index += 1) {
                        productSum += productValues[index];
                        weightSum += weightValues[index];
                    }
                    const predictedCents = productSum / weightSum;
                    return {
                        confidence: confidence,
                        frequency: 10 * Math.pow(2, predictedCents / 1200),
                    };
                });
                if (result) this.onPitch(result.frequency, result.confidence);
            } catch (error) {
                this.onStatus("Pitch analysis paused: " + error.message, true);
            } finally {
                this.processing = false;
            }
        }

        async start(stream, sourceLabel) {
            await this.stop(false);
            this.stopRequested = false;
            this.stream = stream;
            await this.loadModel();
            if (this.stopRequested) return;

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) throw new Error("Web Audio is not supported in this browser.");
            this.audioContext = new AudioContextClass();
            await this.audioContext.resume();
            this.source = this.audioContext.createMediaStreamSource(stream);
            const minimum = this.audioContext.sampleRate / 16000 * 1024;
            let bufferSize = 4;
            while (bufferSize < minimum) bufferSize *= 2;
            this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            this.silentGain = this.audioContext.createGain();
            this.silentGain.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.processor.onaudioprocess = this.analyse.bind(this);
            this.source.connect(this.processor);
            this.processor.connect(this.silentGain);
            this.silentGain.connect(this.audioContext.destination);
            stream.getTracks().forEach((track) => {
                track.addEventListener("ended", () => {
                    if (!this.stopRequested) {
                        this.stop();
                        this.onStopped();
                    }
                }, { once: true });
            });
            this.onStatus("Running CREPE on " + sourceLabel + " · audio stays in this browser.");
        }

        async stop(stopTracks) {
            this.stopRequested = true;
            if (stopTracks !== false && this.stream) {
                this.stream.getTracks().forEach((track) => track.stop());
            }
            if (this.processor) {
                this.processor.onaudioprocess = null;
                try { this.processor.disconnect(); } catch (error) {}
            }
            if (this.source) {
                try { this.source.disconnect(); } catch (error) {}
            }
            if (this.silentGain) {
                try { this.silentGain.disconnect(); } catch (error) {}
            }
            if (this.audioContext && this.audioContext.state !== "closed") {
                try { await this.audioContext.close(); } catch (error) {}
            }
            this.audioContext = null;
            this.stream = null;
            this.source = null;
            this.processor = null;
            this.silentGain = null;
            this.processing = false;
        }
    }

    const pitchEngine = new CrepePitchEngine(
        updatePitch,
        setEngineMessage,
        function () {
            setInputMode("idle");
            setEngineMessage("Audio sharing ended. The CREPE model remains ready.");
        }
    );

    class RaagaSynth {
        constructor() {
            this.context = null;
            this.dryGain = null;
            this.wetGain = null;
            this.convolver = null;
        }

        init() {
            if (this.context) {
                if (this.context.state === "suspended") this.context.resume();
                return this.context;
            }
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            this.context = new AudioContextClass();
            this.convolver = this.context.createConvolver();
            this.dryGain = this.context.createGain();
            this.wetGain = this.context.createGain();
            this.dryGain.connect(this.context.destination);
            this.convolver.connect(this.wetGain);
            this.wetGain.connect(this.context.destination);
            this.dryGain.gain.value = 0.88;
            this.wetGain.gain.value = 0.12;

            const length = this.context.sampleRate * 1.5;
            const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
            for (let channel = 0; channel < 2; channel += 1) {
                const data = impulse.getChannelData(channel);
                for (let index = 0; index < length; index += 1) {
                    data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 3);
                }
            }
            this.convolver.buffer = impulse;
            return this.context;
        }

        play(semitone, duration) {
            const context = this.init();
            if (!context) return;
            duration = duration || 0.82;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const frequency = ROOT_FREQUENCIES[state.rootIndex] * Math.pow(2, semitone / 12);
            oscillator.type = "triangle";
            oscillator.frequency.setValueAtTime(frequency, context.currentTime);
            oscillator.connect(gain);
            gain.connect(this.dryGain);
            gain.connect(this.convolver);
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.34, context.currentTime + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
            oscillator.start();
            oscillator.stop(context.currentTime + duration + 0.06);
        }
    }

    const synth = new RaagaSynth();

    function showToast(message) {
        const toast = $("#toast");
        toast.textContent = message;
        toast.classList.add("visible");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove("visible"); }, 2400);
    }

    async function stopListening(options) {
        options = options || {};
        if (demoTimer) clearInterval(demoTimer);
        demoTimer = null;
        await pitchEngine.stop();
        setInputMode("idle");
        if (!options.keepPitch) resetPitch();
        setEngineMessage("CREPE is ready. Start the microphone or share audio when you want to continue.");
    }

    async function startMic() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setEngineMessage("Microphone capture is unavailable in this browser.", true);
            return;
        }
        try {
            await stopListening();
            setInputMode("loading");
            setEngineMessage("Waiting for microphone permission…");
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            });
            await pitchEngine.start(stream, "your microphone");
            setInputMode("mic");
        } catch (error) {
            await pitchEngine.stop();
            setInputMode("idle");
            setEngineMessage("Could not start microphone analysis: " + error.message, true);
        }
    }

    async function startTabAudio() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            setEngineMessage("Tab-audio sharing is unavailable in this browser.", true);
            return;
        }
        try {
            await stopListening();
            setInputMode("loading");
            setEngineMessage("Choose a browser tab and enable “Share tab audio”.");
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            if (!stream.getAudioTracks().length) {
                stream.getTracks().forEach((track) => track.stop());
                throw new Error("The selected share did not include audio.");
            }
            await pitchEngine.start(stream, "the shared tab");
            setInputMode("tab");
        } catch (error) {
            await pitchEngine.stop();
            setInputMode("idle");
            setEngineMessage("Could not start tab analysis: " + error.message, true);
        }
    }

    async function startDemo() {
        await stopListening();
        setInputMode("demo");
        setEngineMessage("Guided contour demo · using the selected raag and practice mode.");
        const notes = targetNotesFor(state.selectedRaagId, state.mode);
        let index = 0;
        const interval = state.graphMode === "practice" ? 120 : 240;
        demoTimer = setInterval(function () {
            const targetIndex = state.graphMode === "practice"
                ? Math.min(practiceRun.currentIndex, notes.length - 1)
                : index % notes.length;
            const drift = state.graphMode === "practice" ? Math.sin(index * 1.7) * 0.04 : Math.sin(index * 1.7) * 0.12;
            const note = notes[targetIndex] + drift;
            const frequency = ROOT_FREQUENCIES[state.rootIndex] * Math.pow(2, (note - 12) / 12);
            updatePitch(frequency, 0.94);
            synth.play(note - 12, state.graphMode === "practice" ? 0.14 : 0.24);
            index += 1;
        }, interval);
    }

    function renderRaagas() {
        const visible = state.timeFilter === "All"
            ? RAAGAS
            : RAAGAS.filter((raag) => raag.time === state.timeFilter);
        $("#raagGrid").innerHTML = visible.map(function (raag) {
            return '<button type="button" class="raag-tile ' + raag.color + (raag.id === state.selectedRaagId ? ' selected' : '') + '" data-raag-id="' + raag.id + '" aria-pressed="' + (raag.id === state.selectedRaagId) + '">' +
                '<span class="tile-time">' + raag.time + '</span>' +
                '<strong>' + raag.name + '</strong>' +
                '<span class="tile-mood">' + raag.mood + '</span>' +
                '<span class="tile-footer"><i>' + raag.thaat + ' Thaat</i><b>Vadi · ' + raag.vadi + '</b></span>' +
            '</button>';
        }).join("");
    }

    function renderRaagDetail() {
        const raag = selectedRaag();
        $("#raagDetail").innerHTML =
            '<div class="detail-title"><div><span>Selected raag</span><h3>' + raag.name + '</h3></div><b>' + raag.time + '</b></div>' +
            '<p class="detail-mood">' + raag.mood + ' · ' + raag.thaat + ' Thaat</p>' +
            '<dl>' +
                '<div><dt>Aaroh</dt><dd>' + raag.aroh + '</dd></div>' +
                '<div><dt>Avroh</dt><dd>' + raag.avroh + '</dd></div>' +
                '<div><dt>Pakad</dt><dd>' + raag.pakad + '</dd></div>' +
            '</dl>' +
            '<div class="listening-cue"><span>Listening cue · ' + raag.concept + '</span><strong>' + raag.reference + '</strong><p>' + raag.cue + '</p></div>' +
            '<button class="button light" id="practiceSelectedRaag" type="button">Practise this Pakad <span>↗</span></button>';
    }

    function selectRaag(id, shouldRenderGrid) {
        if (!RAAGAS.some((raag) => raag.id === id)) return;
        state.selectedRaagId = id;
        state.pitchHistory = [];
        state.centsHistory = [];
        if (state.graphMode === "practice") resetPitch();
        if (shouldRenderGrid !== false) renderRaagas();
        renderRaagDetail();
        renderPracticeContext();
    }

    function openSelectedForPractice() {
        state.mode = "pakad";
        $$("[data-practice-mode]").forEach(function (button) {
            const selected = button.dataset.practiceMode === "pakad";
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-selected", String(selected));
        });
        setGraphMode("practice");
        renderPracticeContext();
        $("#studio").scrollIntoView({ behavior: "smooth" });
    }

    function renderSearchResults(query) {
        const normalized = (query || "").trim().toLowerCase();
        const matches = RAAGAS.filter(function (raag) {
            return !normalized || [raag.name, raag.time, raag.thaat, raag.mood, raag.concept]
                .join(" ").toLowerCase().includes(normalized);
        });
        $("#searchResults").innerHTML = matches.length
            ? matches.map(function (raag) {
                return '<button class="search-result" type="button" data-search-raag="' + raag.id + '">' +
                    '<strong>' + raag.name + '</strong><span>' + raag.time + ' · ' + raag.thaat + ' · ' + raag.mood + '</span><i>↗</i>' +
                '</button>';
            }).join("")
            : '<p class="search-empty">No raagas match that search.</p>';
    }

    function togglePreview() {
        if (previewTimer) clearInterval(previewTimer);
        if (previewPlaying) {
            previewPlaying = false;
            $("#previewButton").textContent = "▶";
            $("#previewButton").setAttribute("aria-label", "Play Yaman preview");
            $("#previewStatus").textContent = "Tap to hear the swaras";
            return;
        }
        previewPlaying = true;
        $("#previewButton").textContent = "Ⅱ";
        $("#previewButton").setAttribute("aria-label", "Pause Yaman preview");
        $("#previewStatus").textContent = "Playing a Yaman phrase";
        const melody = [0, 2, 4, 6, 7, 11, 9, 7, 6, 4, 2, 0];
        let index = 0;
        synth.play(melody[0]);
        previewTimer = setInterval(function () {
            index += 1;
            synth.play(melody[index % melody.length]);
            previewProgress = previewProgress >= 98 ? 8 : previewProgress + 4;
            $("#previewProgress").style.width = previewProgress + "%";
        }, 620);
    }

    function saveJournal() {
        const snapshot = {
            raag: selectedRaag().name,
            raagId: state.selectedRaagId,
            goal: state.plannerGoal,
            steadiness: state.accuracy,
            contour: state.pitchHistory.slice(-80),
            savedAt: new Date().toISOString(),
        };
        try {
            window.localStorage.setItem("raagarhythms-last-session", JSON.stringify(snapshot));
            $("#saveJournal").textContent = "Session saved ✓";
            renderSavedJournal(snapshot);
            showToast("Today’s Riyaz snapshot was saved on this device.");
        } catch (error) {
            showToast("This browser could not save the session locally.");
        }
    }

    function renderSavedJournal(snapshot) {
        if (!snapshot) return;
        $("#journalAccuracy").textContent = Number(snapshot.steadiness || 0) + "%";
        const savedDate = new Date(snapshot.savedAt);
        $("#journalSavedAt").textContent = isNaN(savedDate.getTime())
            ? "Saved locally"
            : "Saved " + savedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    function loadJournal() {
        try {
            const saved = JSON.parse(window.localStorage.getItem("raagarhythms-last-session"));
            renderSavedJournal(saved);
        } catch (error) {
            // Ignore invalid or blocked local storage.
        }
    }

    function bindEvents() {
        $$("[data-graph-mode]").forEach(function (button) {
            button.addEventListener("click", function () {
                setGraphMode(button.dataset.graphMode);
            });
        });

        $$("[data-practice-mode]").forEach(function (button) {
            button.addEventListener("click", function () {
                state.mode = button.dataset.practiceMode;
                $$("[data-practice-mode]").forEach(function (candidate) {
                    const selected = candidate === button;
                    candidate.classList.toggle("selected", selected);
                    candidate.setAttribute("aria-selected", String(selected));
                });
                resetPitch();
                renderPracticeContext();
            });
        });

        $("#sa-root").addEventListener("change", function (event) {
            state.rootIndex = Number(event.target.value);
            resetPitch();
        });

        $("#startMic").addEventListener("click", startMic);
        $("#startTab").addEventListener("click", startTabAudio);
        $("#startDemo").addEventListener("click", startDemo);
        $("#stopListening").addEventListener("click", function () { stopListening(); });
        $("#previewButton").addEventListener("click", togglePreview);

        $$("[data-piano-note]").forEach(function (button) {
            button.addEventListener("click", function () {
                synth.play(Number(button.dataset.pianoNote));
                button.classList.add("is-playing");
                setTimeout(function () { button.classList.remove("is-playing"); }, 190);
            });
        });

        $$("[data-time-filter]").forEach(function (button) {
            button.addEventListener("click", function () {
                state.timeFilter = button.dataset.timeFilter;
                $$("[data-time-filter]").forEach(function (candidate) {
                    const selected = candidate === button;
                    candidate.classList.toggle("selected", selected);
                    candidate.setAttribute("aria-pressed", String(selected));
                });
                renderRaagas();
            });
        });

        $("#raagGrid").addEventListener("click", function (event) {
            const tile = event.target.closest("[data-raag-id]");
            if (tile) selectRaag(tile.dataset.raagId);
        });
        $("#raagDetail").addEventListener("click", function (event) {
            if (event.target.closest("#practiceSelectedRaag")) openSelectedForPractice();
        });

        $$("[data-goal]").forEach(function (button) {
            button.addEventListener("click", function () {
                state.plannerGoal = button.dataset.goal;
                $("#plannerGoal").textContent = state.plannerGoal;
                $$("[data-goal]").forEach(function (candidate) {
                    const selected = candidate === button;
                    candidate.classList.toggle("selected", selected);
                    candidate.setAttribute("aria-pressed", String(selected));
                });
            });
        });

        $("#beginRiyaz").addEventListener("click", openSelectedForPractice);
        $("#saveJournal").addEventListener("click", saveJournal);

        const dialog = $("#searchDialog");
        $("#openSearch").addEventListener("click", function () {
            renderSearchResults("");
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
            setTimeout(function () { $("#globalSearch").focus(); }, 0);
        });
        $("#globalSearch").addEventListener("input", function (event) {
            renderSearchResults(event.target.value);
        });
        $("#searchResults").addEventListener("click", function (event) {
            const result = event.target.closest("[data-search-raag]");
            if (!result) return;
            selectRaag(result.dataset.searchRaag);
            if (typeof dialog.close === "function") dialog.close();
            else dialog.removeAttribute("open");
            $("#explore").scrollIntoView({ behavior: "smooth" });
        });

        const navLinks = $$(".topbar > nav > a");
        if ("IntersectionObserver" in window) {
            const observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    navLinks.forEach(function (link) {
                        link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
                    });
                });
            }, { rootMargin: "-35% 0px -55% 0px" });
            ["explore", "learn", "studio", "journal"].forEach(function (id) {
                const section = document.getElementById(id);
                if (section) observer.observe(section);
            });
        }

        window.addEventListener("beforeunload", function () {
            if (demoTimer) clearInterval(demoTimer);
            clearPracticeSilenceTimer();
            pitchEngine.stop();
        });
    }

    renderRaagas();
    renderRaagDetail();
    renderPracticeContext();
    renderSearchResults("");
    loadJournal();
    bindEvents();
    setGraphMode(state.graphMode, false);
})();
