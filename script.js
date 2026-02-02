// Global variables
var youTubePlayer;
var unpinTimeoutId;
// var vidElement = document.getElementById("YouTube-player"); // We'll target video-container for fixed mode

// Initialize YouTube Player API
function onYouTubeIframeAPIReady() {
    "use strict";

    var inputVideoId = document.getElementById("YouTube-video-id");
    var videoId = inputVideoId.value || "HBuGBlFRD38"; // Default videoId if input is empty
    var suggestedQuality = "default"; // Use "default" for YT to pick best, or "hd720", "large", "medium", "small"
    // Height and width are now primarily controlled by CSS for the container
    // These values are for the YT.Player constructor but can be overridden by CSS on #YouTube-player
    var height = "100%";
    var width = "100%";
    var youTubePlayerVolumeItemId = "YouTube-player-volume"; // Element not in HTML, but keeping logic

    function onError(event) {
        console.error("YouTube Player Error:", event.data);
        // youTubePlayer.personalPlayer.errors.push(event.data); // If personalPlayer.errors is used
    }

    function onReady(event) {
        var player = event.target;
        // player.loadVideoById({ suggestedQuality: suggestedQuality, videoId: videoId }); // Redundant if videoId in constructor
        // player.pauseVideo(); // Autoplay is 0, so it won't play automatically
        // youTubePlayerDisplayFixedInfos(); // Element not in HTML
    }

    function onStateChange(event) {
        var volume = Math.round(event.target.getVolume());
        var volumeItem = document.getElementById(youTubePlayerVolumeItemId);

        if (volumeItem && Math.round(volumeItem.value) != volume) {
            volumeItem.value = volume;
        }
        // You could add more state handling here if needed
        // For example, to animate controls based on player state
    }

    youTubePlayer = new YT.Player("YouTube-player", {
        videoId: videoId,
        height: height,
        width: width,
        playerVars: {
            autoplay: 0,
            autohide: 1, // Autohide controls
            cc_load_policy: 0, // Default (user's choice for captions)
            controls: 1, // Show YouTube's default controls
            disablekb: 0, // Enable keyboard controls
            iv_load_policy: 3, // Do not show video annotations
            modestbranding: 1, // Reduce YouTube logo
            rel: 0, // Do not show related videos at the end
            showinfo: 0, // Do not show video title and uploader before playing
            // start: 0, // Optional: start time
            fs: 1 // Show fullscreen button
        },
        events: {
            onError: onError,
            onReady: onReady,
            onStateChange: onStateChange,
        },
    });

    // Add private data to the YouTube object if needed
    // youTubePlayer.personalPlayer = { currentTimeSliding: false, errors: [] };
}

// Function to toggle fixed/absolute positioning of the video player
function toggleWidth() {
    var checkbox = document.getElementById("toggleSlider");
    var videoContainer = document.getElementById("video-container");

    if (checkbox.checked) {
        if (unpinTimeoutId) {
            clearTimeout(unpinTimeoutId);
            unpinTimeoutId = null;
        }
        videoContainer.classList.remove('unpinning');
        videoContainer.classList.add('fixed-player-mode');
    } else {
        videoContainer.classList.remove('fixed-player-mode');
        videoContainer.classList.add('unpinning');
        unpinTimeoutId = setTimeout(function () {
            videoContainer.classList.remove('unpinning');
            unpinTimeoutId = null;
        }, 450);
    }
}

function updateNowPlayingDisplay(title, meta) {
    var titleText = title || "Select a song";
    var metaText = meta || "Pick a track to begin listening.";
    document.querySelectorAll('[data-now-playing="title"]').forEach(function (el) {
        el.textContent = titleText;
    });
    document.querySelectorAll('[data-now-playing="meta"]').forEach(function (el) {
        el.textContent = metaText;
    });
}

function setActiveSong(listItem) {
    document.querySelectorAll("#songs-container li.is-playing").forEach(function (item) {
        item.classList.remove("is-playing");
    });
    if (listItem) {
        listItem.classList.add("is-playing");
    }
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function applyFilters() {
    var searchInput = document.getElementById("searchInput");
    var raagFilter = document.getElementById("raagFilter");
    var resultsCount = document.getElementById("resultsCount");
    var noResults = document.getElementById("noResults");
    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var selectedRaag = raagFilter ? raagFilter.value : "all";
    var visibleSongs = 0;
    var visibleRaags = 0;

    document.querySelectorAll("#songs-container > section").forEach(function (section) {
        var sectionRaag = section.dataset.raag;
        var sectionMatches = selectedRaag === "all" || sectionRaag === selectedRaag;
        var sectionHasVisible = false;

        section.querySelectorAll("li").forEach(function (li) {
            var haystack = li.dataset.search || "";
            var matchesQuery = !query || haystack.indexOf(query) !== -1;
            var shouldShow = sectionMatches && matchesQuery;
            li.style.display = shouldShow ? "" : "none";
            if (shouldShow) {
                visibleSongs += 1;
                sectionHasVisible = true;
            }
        });

        section.style.display = sectionHasVisible ? "" : "none";
        if (sectionHasVisible) {
            visibleRaags += 1;
        }
    });

    if (resultsCount) {
        resultsCount.textContent =
            "Showing " +
            visibleSongs +
            " song" +
            (visibleSongs === 1 ? "" : "s") +
            " across " +
            visibleRaags +
            " " +
            (visibleRaags === 1 ? "raag" : "raagas") +
            ".";
    }
    if (noResults) {
        noResults.hidden = visibleSongs !== 0;
    }
}

// Helper function to check if player is active
function youTubePlayerActive() {
    "use strict";
    return youTubePlayer && typeof youTubePlayer.getPlayerState === "function";
}

// Change Video ID for the YouTube Player
function youTubePlayerChangeVideoId() {
    "use strict";
    var inputVideoId = document.getElementById("YouTube-video-id");
    var videoId = inputVideoId.value;

    if (youTubePlayerActive() && videoId) {
        youTubePlayer.loadVideoById({ suggestedQuality: "default", videoId: videoId });
        // youTubePlayer.playVideo(); // Optionally play immediately
        // youTubePlayerDisplayFixedInfos(); // Element not in HTML
    } else if (!videoId) {
        console.warn("No Video ID provided to change.");
    }
}

// Seek video to currentTime
function youTubePlayerCurrentTimeChange(currentTime) {
    "use strict";
    // youTubePlayer.personalPlayer.currentTimeSliding = false; // If used
    if (youTubePlayerActive()) {
        youTubePlayer.seekTo(currentTime, true);
        if (youTubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
             youTubePlayer.playVideo(); // Often, users expect play after seek
        }
    }
}

// Function for when slider moves (if implementing custom slider)
// function youTubePlayerCurrentTimeSlide() { "use strict"; youTubePlayer.personalPlayer.currentTimeSliding = true; }

// Display fixed info (element "YouTube-player-fixed-infos" not in provided HTML)
// function youTubePlayerDisplayFixedInfos() { /* ... */ }

// Player Controls
function youTubePlayerPause() { "use strict"; if (youTubePlayerActive()) { youTubePlayer.pauseVideo(); } }
function youTubePlayerPlay() { "use strict"; if (youTubePlayerActive()) { youTubePlayer.playVideo(); } }
function youTubePlayerStop() { "use strict"; if (youTubePlayerActive()) { youTubePlayer.stopVideo(); /* youTubePlayer.clearVideo(); */ } } // clearVideo() might be too much
// function youTubePlayerVolumeChange(volume) { "use strict"; if (youTubePlayerActive()) { youTubePlayer.setVolume(volume); } }

// Main YouTube API script loading
(function () {
    "use strict";
    function init() {
        var tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        // setInterval(youTubePlayerDisplayInfos, 1000); // 'youTubePlayerDisplayInfos' is not defined
    }
    if (window.addEventListener) { window.addEventListener("load", init); }
    else if (window.attachEvent) { window.attachEvent("onload", init); }
})();

// Extract YouTube video ID from link
function extractVideoIdFromLink(link) {
    if (!link) return null;
    const pattern = /(?:https?:\/\/(?:www\.)?youtube\.com\/watch\?v=|https?:\/\/youtu\.be\/)([0-9A-Za-z_-]{11})/;
    const match = pattern.exec(link);
    return match ? match[1] : null;
}

// Replace custom formatting in text
function replaceFormatting(text) {
    if (typeof text !== 'string') return ''; // Ensure text is a string
    // Timestamp: _(digits)_
    text = text.replace(/_(\d+)_/g, (match, p1) => `<button onclick="convertToTimestamp(this)" class="time_stamp">${p1}</button>`);
    // Popup Link: li[text]
    text = text.replace(/li\[(.*?)\]/g, (match, p1) => `<button onclick="createPopup(this)" class="link">${p1}</button>`);
    // Bold: b[text]
    text = text.replace(/b\[(.*?)\]/g, "<b>$1</b>");
    // Blue text (for dark theme, consider a lighter blue): bl[text]
    text = text.replace(/bl\[(.*?)\]/g, '<span style="color: #82c0ff;">$1</span>'); // Lighter blue
    // Note button: rd[text] or r"text"
    text = text.replace(/rd\[(.*?)\]/g, (match, p1) => `<button onclick="playthat(this)" class="note_button">${p1}</button>`);
    text = text.replace(/r"(.*?)"/g, (match, p1) => `<button onclick="playthat(this)" class="note_button">${p1}</button>`);
    return text;
}

// Play notes (from piano functionality)
function playthat(button) {
    var notes = button.textContent.toLowerCase();
    playNotes(notes);
}

// Convert number in button to timestamp and seek player
function convertToTimestamp(button) {
    const number = parseInt(button.textContent, 10);
    if (!isNaN(number)) {
        youTubePlayerCurrentTimeChange(number);
    }
}

// Fetch word definition (Google Sheet)
function getDefinitionByWord(inputWord) {
    return new Promise((resolve, reject) => {
        fetch(
            "https://script.googleusercontent.com/macros/echo?user_content_key=jYy6eHbLN_GmMCajShhHQB-o5_sMPUbCRyc3dkuKHsDUYR1Wo37SOPPwVbNLMKWmBg6rwd6gLKyjeUHrH0zqkm0pvPPn_VP7m5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnMJacPG11zpZatw9EbpSF0j7IcRpn3mhZxn4OerUGwP4U2DrpCIAcTSdKFvmM8JtbeNebGWtZWMQLUTLFsBtNp53pO-_vgolWQ&lib=Mh0IRVtLjs2NbijZri3x3-4bkD1ZowIV_"
        )
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then((data) => {
            const lowerInputWord = inputWord.toLowerCase();
            const wordDefinition = data.words.find((word) => word.word.toLowerCase() === lowerInputWord);
            if (wordDefinition) {
                resolve(wordDefinition.definition);
            } else {
                resolve("Definition not found for this term.");
            }
        })
        .catch((error) => {
            console.error("Error fetching definition:", error);
            reject("Error fetching definition. Please try again later.");
        });
    });
}

// Create and manage popup for definitions
function createPopup(button) {
    const word = button.textContent;

    // Remove existing popups first to avoid duplicates
    document.querySelectorAll('.popup-container, .popup-overlay').forEach(el => el.remove());

    var popupContainer = document.createElement('div');
    popupContainer.className = 'popup-container'; // Will be made visible with .visible class
    document.body.appendChild(popupContainer);

    var popupOverlay = document.createElement('div');
    popupOverlay.className = 'popup-overlay'; // Will be made visible with .visible class
    document.body.appendChild(popupOverlay);

    var loadingAnimation = document.createElement('div');
    loadingAnimation.className = 'loading-animation';
    popupContainer.appendChild(loadingAnimation);

    var popupText = document.createElement('p');
    popupText.id = 'popupText';
    popupContainer.appendChild(popupText);

    var closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.className = 'popup_close';
    closeButton.onclick = closePopup;
    popupContainer.appendChild(closeButton);

    function openPopup() {
        popupContainer.classList.add('visible');
        popupOverlay.classList.add('visible');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    function closePopup() {
        popupContainer.classList.remove('visible');
        popupOverlay.classList.remove('visible');
        document.body.style.overflow = ''; // Restore scroll

        // Optional: remove popup from DOM after closing to keep DOM clean
        setTimeout(() => {
            if (popupContainer.parentNode) popupContainer.parentNode.removeChild(popupContainer);
            if (popupOverlay.parentNode) popupOverlay.parentNode.removeChild(popupOverlay);
        }, 500); // Match CSS transition duration
    }

    function addTextToPopup(text) {
        loadingAnimation.style.display = 'none';
        popupText.innerHTML = replaceFormatting(text); // Allow basic formatting in definitions too
    }

    popupOverlay.addEventListener('click', closePopup); // Close on overlay click

    openPopup();

    getDefinitionByWord(word)
        .then((definition) => addTextToPopup(definition))
        .catch((errorMsg) => addTextToPopup(errorMsg));
}


// Fetch songs from Google Sheets and display them
function fetchSongs() {
    var songsContainer = document.getElementById("songs-container");
    var raagFilter = document.getElementById("raagFilter");
    var raagNav = document.getElementById("raagNav");
    var resultsCount = document.getElementById("resultsCount");
    var noResults = document.getElementById("noResults");

    if (songsContainer) {
        songsContainer.innerHTML = "<div class=\"loading-state\">Loading raagas...</div>";
    }
    if (resultsCount) {
        resultsCount.textContent = "Loading songs...";
    }
    if (noResults) {
        noResults.hidden = true;
    }

    fetch(
        "https://script.googleusercontent.com/macros/echo?user_content_key=jYy6eHbLN_GmMCajShhHQB-o5_sMPUbCRyc3dkuKHsDUYR1Wo37SOPPwVbNLMKWmBg6rwd6gLKyjeUHrH0zqkm0pvPPn_VP7m5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnMJacPG11zpZatw9EbpSF0j7IcRpn3mhZxn4OerUGwP4U2DrpCIAcTSdKFvmM8JtbeNebGWtZWMQLUTLFsBtNp53pO-_vgolWQ&lib=Mh0IRVtLjs2NbijZri3x3-4bkD1ZowIV_"
    )
    .then((response) => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then((data) => {
        const groupedSongs = {};
        if (data && data.songs) {
            data.songs.forEach((song) => {
                if (!song.raag) song.raag = "Uncategorized";
                if (!groupedSongs[song.raag]) {
                    groupedSongs[song.raag] = {
                        raagDetails: song.raag_details || "No details available for this Raag.",
                        songs: [],
                    };
                }
                groupedSongs[song.raag].songs.push(song);
            });
        } else {
            console.error("No songs data found or data is malformed:", data);
            if (songsContainer) {
                songsContainer.innerHTML = "<div class=\"loading-state\">Could not load songs at this time.</div>";
            }
            if (resultsCount) {
                resultsCount.textContent = "Unable to load songs.";
            }
            return;
        }

        const songsContainerEl = document.getElementById("songs-container");
        if (songsContainerEl) {
            songsContainerEl.innerHTML = "";
        }

        var raagNames = Object.keys(groupedSongs).sort((a, b) => a.localeCompare(b));

        if (raagFilter) {
            raagFilter.innerHTML = "";
            var allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "All raagas";
            raagFilter.appendChild(allOption);
            raagNames.forEach((raag) => {
                var option = document.createElement("option");
                option.value = raag;
                option.textContent = raag;
                raagFilter.appendChild(option);
            });
        }

        if (raagNav) {
            raagNav.innerHTML = "";
            var allLink = document.createElement("a");
            allLink.href = "#content";
            allLink.dataset.raag = "all";
            allLink.textContent = "All raagas";
            raagNav.appendChild(allLink);

            raagNames.forEach((raag) => {
                var link = document.createElement("a");
                link.href = "#raag-" + slugify(raag);
                link.dataset.raag = raag;
                link.textContent = "Raag " + raag;
                raagNav.appendChild(link);
            });
        }

        let sectionIndex = 0;
        raagNames.forEach((raag) => {
            var songElement = document.createElement("section");
            var currentSectionIndex = sectionIndex++;
            songElement.style.setProperty("--section-index", currentSectionIndex);
            songElement.dataset.raag = raag;
            songElement.id = "raag-" + slugify(raag);

            var songs = groupedSongs[raag].songs;

            songElement.innerHTML = `
                <h2 class=\"raag\">
                    <button class=\"raag-toggle\" type=\"button\" aria-expanded=\"false\">Raag ${raag}</button>
                </h2>
                <div class=\"raag-details\" aria-hidden=\"true\">${replaceFormatting(groupedSongs[raag].raagDetails)}</div>
                <ul>
                    ${songs
                        .map((song, index) => {
                            var detailId = "details-" + currentSectionIndex + "-" + index;
                            return `
                                <li>
                                    <button class=\"song-link-button\" type=\"button\" ${song.details ? `aria-expanded=\"false\" aria-controls=\"${detailId}\"` : ""}>
                                        ${song.name || "Untitled Song"}
                                    </button>
                                    <div class=\"song-details\">
                                        ${song.singer ? `<span class=\"detail-label\">Singer:</span> ${song.singer}<br>` : ""}
                                        ${song.composer ? `<span class=\"detail-label\">Composer:</span> ${song.composer}<br>` : ""}
                                        ${song.lyricist ? `<span class=\"detail-label\">Lyricist:</span> ${song.lyricist}` : ""}
                                    </div>
                                    ${song.details ? `<div class=\"more-details\" id=\"${detailId}\" aria-hidden=\"true\">${replaceFormatting(song.details)}</div>` : ""}
                                </li>
                                `;
                        })
                        .join("")}
                </ul>
            `;
            if (songsContainerEl) {
                songsContainerEl.appendChild(songElement);
            }

            songElement.querySelectorAll("li").forEach((li, index) => {
                var song = songs[index] || {};
                var button = li.querySelector(".song-link-button");
                if (button) {
                    var videoId = extractVideoIdFromLink(song.videoid);
                    if (videoId) {
                        button.dataset.videoid = videoId;
                    }
                    button.dataset.raag = raag;
                    if (song.name) button.dataset.title = song.name;
                    if (song.singer) button.dataset.singer = song.singer;
                    if (song.composer) button.dataset.composer = song.composer;
                    if (song.lyricist) button.dataset.lyricist = song.lyricist;
                }
                li.dataset.search = [song.name, song.singer, song.composer, song.lyricist, raag]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
            });
        });

        if (songsContainerEl) {
            songsContainerEl.addEventListener("click", function (event) {
                var target = event.target;

                if (target.classList.contains("raag-toggle")) {
                    var section = target.closest("section");
                    var raagDetails = section ? section.querySelector(".raag-details") : null;
                    if (raagDetails) {
                        var isOpen = raagDetails.classList.toggle("open");
                        target.setAttribute("aria-expanded", isOpen);
                        raagDetails.setAttribute("aria-hidden", !isOpen);
                    }
                    return;
                }

                var listItem = target.closest("li");
                if (!listItem) return;

                if (target.classList.contains("song-link-button")) {
                    var videoId = target.dataset.videoid;
                    if (videoId) {
                        document.getElementById("YouTube-video-id").value = videoId;
                        youTubePlayerChangeVideoId();
                    }

                    var moreDetails = listItem.querySelector(".more-details");
                    if (moreDetails) {
                        var isOpenDetails = moreDetails.classList.toggle("open");
                        target.setAttribute("aria-expanded", isOpenDetails);
                        moreDetails.setAttribute("aria-hidden", !isOpenDetails);
                    }

                    setActiveSong(listItem);
                    var songTitle = target.dataset.title || target.textContent.trim();
                    var metaParts = [];
                    if (target.dataset.raag) metaParts.push("Raag " + target.dataset.raag);
                    if (target.dataset.singer) metaParts.push(target.dataset.singer);
                    updateNowPlayingDisplay(songTitle, metaParts.length ? metaParts.join(" | ") : "Playing now.");
                    return;
                }

                if (target.closest(".time_stamp, .note_button, .link")) {
                    return;
                }

                var cardDetails = listItem.querySelector(".more-details");
                var cardButton = listItem.querySelector(".song-link-button");
                if (cardDetails) {
                    var isCardOpen = cardDetails.classList.toggle("open");
                    if (cardButton) {
                        cardButton.setAttribute("aria-expanded", isCardOpen);
                    }
                    cardDetails.setAttribute("aria-hidden", !isCardOpen);
                }
            });
        }

        if (raagNav && raagFilter) {
            raagNav.addEventListener("click", function (event) {
                var link = event.target.closest("a");
                if (!link) return;
                var raagValue = link.dataset.raag;
                if (raagValue) {
                    raagFilter.value = raagValue;
                    applyFilters();
                }
            });
        }

        var searchInput = document.getElementById("searchInput");
        var clearFilters = document.getElementById("clearFilters");

        if (searchInput) {
            searchInput.addEventListener("input", applyFilters);
            searchInput.addEventListener("keydown", function (event) {
                if (event.key === "Escape") {
                    searchInput.value = "";
                    applyFilters();
                }
            });
        }

        if (raagFilter) {
            raagFilter.addEventListener("change", applyFilters);
        }

        if (clearFilters) {
            clearFilters.addEventListener("click", function () {
                if (searchInput) searchInput.value = "";
                if (raagFilter) raagFilter.value = "all";
                applyFilters();
                if (searchInput) searchInput.focus();
            });
        }

        applyFilters();
    })
    .catch((error) => {
        console.error("Error fetching songs:", error);
        if (songsContainer) {
            songsContainer.innerHTML = "<div class=\"loading-state\">Failed to load musical entries. Please check your connection or try again later.</div>";
        }
        if (resultsCount) {
            resultsCount.textContent = "Unable to load songs.";
        }
    });
}

// Piano Notes Data
var notes = {
    'sa0': 'notes/sa0.mp3', 're0': 'notes/re0.mp3', 'ga0': 'notes/ga0.mp3', 'ma0': 'notes/ma0.mp3',
    'pa0': 'notes/pa0.mp3', 'dha0': 'notes/dha0.mp3', 'ni0': 'notes/ni0.mp3',
    'sa': 'notes/sa.mp3', 're': 'notes/re.mp3', 'ga': 'notes/ga.mp3', 'ma': 'notes/ma.mp3',
    'pa': 'notes/pa.mp3', 'dha': 'notes/dha.mp3', 'ni': 'notes/ni.mp3',
    'sa2': 'notes/sa2.mp3', 're2': 'notes/re2.mp3', 'ga2': 'notes/ga2.mp3', 'ma2': 'notes/ma2.mp3',
    'pa2': 'notes/pa2.mp3', 'dha2': 'notes/dha2.mp3', 'ni2': 'notes/ni2.mp3'
};

// Play sequence of piano notes
function playNotes(input, delay = 300) {
    if (!input) return;
    var sequence = input.replace(/,/g, ' , ').trim().split(/\s+/);
    var currentAudio = null; // To handle overlapping plays if needed, though timeout prevents most

    function playSequenceAtIndex(index) {
        if (index < sequence.length) {
            var note = sequence[index].toLowerCase();
            var currentDelay = delay;

            if (note === ',') {
                currentDelay = delay * 1.2; // Slightly longer pause for comma
                setTimeout(() => playSequenceAtIndex(index + 1), currentDelay);
            } else if (notes[note]) {
                // If an audio is playing, stop it before starting new one (optional)
                // if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
                var audio = new Audio(notes[note]);
                currentAudio = audio;
                audio.play().catch(e => console.error("Error playing note:", e));
                setTimeout(() => playSequenceAtIndex(index + 1), currentDelay);
            } else {
                // Skip unrecognized elements, continue sequence
                playSequenceAtIndex(index + 1);
            }
        }
    }
    playSequenceAtIndex(0);
}


// DOMContentLoaded - Primary execution after HTML is parsed
document.addEventListener('DOMContentLoaded', function() {
    var scrollButton = document.getElementById("scrollToSongs");
    if (scrollButton) {
        scrollButton.addEventListener("click", function () {
            var target = document.getElementById("songs-wrapper");
            if (target) {
                target.scrollIntoView({ behavior: "smooth" });
            }
        });
    }

    updateNowPlayingDisplay();

    // GSAP Animations (ensure GSAP and ScrollTrigger are loaded in HTML)
    if (typeof gsap !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);

        // Hero Animation
        gsap.from(".hero-copy > *", {
            duration: 0.8,
            y: 30,
            opacity: 0,
            ease: "power2.out",
            stagger: 0.08
        });

        gsap.from(".hero-player", {
            duration: 0.9,
            y: 40,
            opacity: 0,
            ease: "power2.out",
            delay: 0.1,
            clearProps: "transform"
        });

        gsap.from(".controls-panel", {
            duration: 0.8,
            y: 30,
            opacity: 0,
            ease: "power2.out",
            scrollTrigger: {
                trigger: ".controls-panel",
                start: "top 85%",
                toggleActions: "play none none none",
            }
        });

        // Raag Sections Staggered Animation
        // GSAP handles this better than CSS --section-index if available
        gsap.utils.toArray('#songs-container > section').forEach(section => {
            gsap.from(section, {
                duration: 0.7,
                y: 40,
                opacity: 0,
                ease: "power1.out",
                scrollTrigger: {
                    trigger: section,
                    start: "top 90%",
                    toggleActions: "play none none none",
                    // markers: true, // For debugging
                }
            });
        });

        // Footer Animation
        gsap.from("footer", {
            duration: 0.8,
            y: 40,
            opacity: 0,
            ease: "power1.out",
            scrollTrigger: {
                trigger: "footer",
                start: "top 90%",
                toggleActions: "play none none none",
            }
        });
    } else {
        console.warn("GSAP not loaded. Animations will fall back to CSS where available.");
    }

    // Initial fetch of songs
    fetchSongs();
});
