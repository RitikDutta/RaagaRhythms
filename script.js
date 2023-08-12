var youTubePlayer;
var vidElement = document.getElementById("YouTube-player");

function toggleWidth() {
    var checkbox = document.getElementById("toggleSlider");
    var vidElement = document.getElementById("YouTube-player");

    // If the checkbox is checked, set the width to 400px, otherwise set it back to 200px
    if (checkbox.checked) {
        // If the checkbox is checked, set the position to 'fixed'
        vidElement.style.position = "fixed";
        vidElement.style.top = "0";
        vidElement.style.left = "0";
    } else {
        // If the checkbox is unchecked, set the position to 'absolute'
        vidElement.style.position = "absolute";
    }
}

vidElement.style.width = "100%";
vidElement.style.position = "absolute";
vidElement.style.top = "0";
vidElement.style.left = "0";

function onYouTubeIframeAPIReady() {
    "use strict";

    var inputVideoId = document.getElementById("YouTube-video-id");
    var videoId = inputVideoId.value;
    var suggestedQuality = "tiny";
    var height = 250;
    var width = 400;
    var youTubePlayerVolumeItemId = "YouTube-player-volume";

    function onError(event) {
        youTubePlayer.personalPlayer.errors.push(event.data);
    }

    function onReady(event) {
        var player = event.target;

        player.loadVideoById({ suggestedQuality: suggestedQuality, videoId: videoId });
        player.pauseVideo();
        youTubePlayerDisplayFixedInfos();
        // player.playVideo();
    }

    function onStateChange(event) {
        var volume = Math.round(event.target.getVolume());
        var volumeItem = document.getElementById(youTubePlayerVolumeItemId);

        if (volumeItem && Math.round(volumeItem.value) != volume) {
            volumeItem.value = volume;
        }
    }

    youTubePlayer = new YT.Player("YouTube-player", {
        videoId: videoId,
        height: height,
        width: width,
        playerVars: { autohide: 0, cc_load_policy: 0, controls: 1, disablekb: 1, iv_load_policy: 3, modestbranding: 1, rel: 0, showinfo: 0, start: 3, autoplay: 0 },
        events: { onError: onError, onReady: onReady, onStateChange: onStateChange },
    });

    // Add private data to the YouTube object
    youTubePlayer.personalPlayer = { currentTimeSliding: false, errors: [] };
}

/**
 * :return: true if the player is active, else false
 */
function youTubePlayerActive() {
    "use strict";

    return youTubePlayer && youTubePlayer.hasOwnProperty("getPlayerState");
}

/**
 * Get videoId from the #YouTube-video-id HTML item value,
 * load this video, pause it
 * and show new infos.
 */
function youTubePlayerChangeVideoId() {
    "use strict";

    var inputVideoId = document.getElementById("YouTube-video-id");
    var videoId = inputVideoId.value;

    youTubePlayer.cueVideoById({ suggestedQuality: "tiny", videoId: videoId });

    youTubePlayerDisplayFixedInfos();

    // youTubePlayer.playVideo();
}

/**
 * Seek the video to the currentTime.
 * (And mark that the HTML slider *don't* move.)
 *
 * :param currentTime: 0 <= number <= 100
 */
function youTubePlayerCurrentTimeChange(currentTime) {
    "use strict";

    youTubePlayer.personalPlayer.currentTimeSliding = false;
    if (youTubePlayerActive()) {
        youTubePlayer.seekTo(currentTime, true);
    }
}

/**
 * Mark that the HTML slider move.
 */
function youTubePlayerCurrentTimeSlide() {
    "use strict";

    youTubePlayer.personalPlayer.currentTimeSliding = true;
}

/**
 * Display embed code to #YouTube-player-fixed-infos.
 */
function youTubePlayerDisplayFixedInfos() {
    "use strict";

    if (youTubePlayerActive()) {
        document.getElementById("YouTube-player-fixed-infos").innerHTML = "Embed code: <textarea readonly>" + youTubePlayer.getVideoEmbedCode() + "</textarea>";
    }
}

/**
 * Pause.
 */
function youTubePlayerPause() {
    "use strict";

    if (youTubePlayerActive()) {
        youTubePlayer.pauseVideo();
    }
}

/**
 * Play.
 */
function youTubePlayerPlay() {
    "use strict";

    if (youTubePlayerActive()) {
        youTubePlayer.playVideo();
    }
}

function youTubePlayerStateValueToDescription(state, unknow) {
    "use strict";

    var STATES = {
        "-1": "unstarted", // YT.PlayerState.
        "0": "ended", // YT.PlayerState.ENDED
        "1": "playing", // YT.PlayerState.PLAYING
        "2": "paused", // YT.PlayerState.PAUSED
        "3": "buffering", // YT.PlayerState.BUFFERING
        "5": "video cued",
    }; // YT.PlayerState.CUED

    return state in STATES ? STATES[state] : unknow;
}

/**
 * Stop.
 */
function youTubePlayerStop() {
    "use strict";

    if (youTubePlayerActive()) {
        youTubePlayer.stopVideo();
        youTubePlayer.clearVideo();
    }
}

/**
 * Change the volume.
 *
 * :param volume: 0 <= number <= 100
 */
function youTubePlayerVolumeChange(volume) {
    "use strict";

    if (youTubePlayerActive()) {
        youTubePlayer.setVolume(volume);
    }
}

/**
 * Main
 */
(function () {
    "use strict";

    function init() {
        // Load YouTube library
        var tag = document.createElement("script");

        tag.src = "https://www.youtube.com/iframe_api";

        var first_script_tag = document.getElementsByTagName("script")[0];

        first_script_tag.parentNode.insertBefore(tag, first_script_tag);

        // Set timer to display infos
        setInterval(youTubePlayerDisplayInfos, 1000);
    }

    if (window.addEventListener) {
        window.addEventListener("load", init);
    } else if (window.attachEvent) {
        window.attachEvent("onload", init);
    }
})();

// to extracr youtube id from link
function extractVideoIdFromLink(link) {
    const pattern = /(?:https?:\/\/(?:www\.)?youtube\.com\/watch\?v=|https?:\/\/youtu\.be\/)([0-9A-Za-z_-]{11})/;
    const match = pattern.exec(link);
    return match ? match[1] : null;
}

function replaceFormatting(text) {
    // Handle _1_ and replace with a timestamp
    text = text.replace(/_(\d+)_/g, '<button onclick="convertToTimestamp(this)" class="time_stamp">' + "$1" + "</button>");

    // Handle _1_ and replace with a timestamp
    text = text.replace(/li\[(.*?)\]/g, '<button id="openPopupBtn" onclick="createPopup(this)" class="link">' + "$1" + "</button>");
    
    //for notes
    // text = text.replace(/no\[(.*?)\]/g, '<button onclick="playthat(this)" class="note_button">' + "$1" + "</button>");

    // Handle <{b}"text"> and replace with a blue button
    text = text.replace(/b\[(.*?)\]/g, "<b>$1</b>");
    text = text.replace(/bl\[(.*?)\]/g, '<span style="color: #1765a3">$1</span>');
    text = text.replace(/rd\[(.*?)\]/g, '<button onclick="playthat(this)" class="note_button">' + "$1" + "</button>");
    text = text.replace(/r"(.*?)"/g, '<button onclick="playthat(this)" class="note_button">' + "$1" + "</button>");

    return text;
}
function playthat(button){
    var notes = button.textContent.toLowerCase()
    console.log(notes)
    playNotes(notes)

}

// Function to replace timestamp with the number from the clicked button
function convertToTimestamp(button) {
    const number = button.textContent;
    youTubePlayerCurrentTimeChange(number);
}

// Function to replace link with the text from the clicked button
// function convertToLink(button) {
//     const link = button.textContent;
//     window.open(link);
// }
// Add event listener to open the popup


function getDefinitionByWord(inputWord) {
    return new Promise((resolve, reject) => {
        fetch(
            "https://script.googleusercontent.com/macros/echo?user_content_key=jYy6eHbLN_GmMCajShhHQB-o5_sMPUbCRyc3dkuKHsDUYR1Wo37SOPPwVbNLMKWmBg6rwd6gLKyjeUHrH0zqkm0pvPPn_VP7m5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnMJacPG11zpZatw9EbpSF0j7IcRpn3mhZxn4OerUGwP4U2DrpCIAcTSdKFvmM8JtbeNebGWtZWMQLUTLFsBtNp53pO-_vgolWQ&lib=Mh0IRVtLjs2NbijZri3x3-4bkD1ZowIV_"
        )
        .then((response) => response.json())
        .then((data) => {
            // Convert the input word to lowercase for case-insensitive comparison
            const lowerInputWord = inputWord.toLowerCase();

            // Find the word's definition from the data (using lowercase comparison)
            const wordDefinition = data.words.find((word) => word.word.toLowerCase() === lowerInputWord);

            // Resolve the promise with the definition or appropriate message
            if (wordDefinition) {
                resolve(wordDefinition.definition);
            } else {
                resolve("NOT FOUND");
            }
        })
        .catch((error) => {
            // Reject the promise in case of an error
            reject(error);
        });
    });
}





function createPopup(button) {
    const word = button.textContent;

    // Create the popup elements dynamically
    var popupContainer = document.createElement('div');
    popupContainer.className = 'popup-container';
    document.body.appendChild(popupContainer);

    var popupOverlay = document.createElement('div');
    popupOverlay.className = 'popup-overlay';
    document.body.appendChild(popupOverlay);

    var loadingAnimation = document.createElement('div');
    loadingAnimation.className = 'loading-animation';
    popupContainer.appendChild(loadingAnimation);

    var popupText = document.createElement('p');
    popupText.id = 'popupText';
    popupContainer.appendChild(popupText);

    var closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.className = 'popup_close'
    closeButton.onclick = closePopup;
    popupContainer.appendChild(closeButton);

    // Function to open the popup
    function openPopup() {
        popupContainer.style.display = 'block';
        popupOverlay.style.display = 'block';

        setTimeout(() => {
            popupContainer.style.opacity = '1';
            popupOverlay.style.opacity = '1';
        }, 10); 
    }

    // Function to close the popup
    function closePopup() {
        popupContainer.style.display = 'none';
        popupOverlay.style.display = 'none';
    }

    // Function to add text to the popup
    function addTextToPopup(text) {
        loadingAnimation.style.display = 'none'; // Hide the loading animation
        popupText.textContent = text;
    }

    // Add event listener to the overlay to close the popup
    popupOverlay.addEventListener('click', function () {
        closePopup();
    });

    // Call this to open the popup
    openPopup();

    // Fetch the definition and update the popup content
    getDefinitionByWord(word)
    .then((definition) => {
        addTextToPopup(definition);
    })
    .catch((error) => {
        addTextToPopup(error);
    });
}






// Function to fetch songs from Google Sheets web app and display them
// ...

function fetchSongs() {
    fetch(
        "https://script.googleusercontent.com/macros/echo?user_content_key=jYy6eHbLN_GmMCajShhHQB-o5_sMPUbCRyc3dkuKHsDUYR1Wo37SOPPwVbNLMKWmBg6rwd6gLKyjeUHrH0zqkm0pvPPn_VP7m5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnMJacPG11zpZatw9EbpSF0j7IcRpn3mhZxn4OerUGwP4U2DrpCIAcTSdKFvmM8JtbeNebGWtZWMQLUTLFsBtNp53pO-_vgolWQ&lib=Mh0IRVtLjs2NbijZri3x3-4bkD1ZowIV_"
    )
        .then((response) => response.json())
        .then((data) => {
            // Group songs by raag
            const groupedSongs = {};
            data.songs.forEach((song) => {
                if (!groupedSongs[song.raag]) {
                    groupedSongs[song.raag] = {
                        raagDetails: song.raag_details,
                        songs: [],
                    };
                }
                groupedSongs[song.raag].songs.push(song);
            });

            // Process the grouped songs and display them in the container
            const songsContainer = document.getElementById("songs-container");
            songsContainer.innerHTML = ""; // Clear previous content

            for (const raag in groupedSongs) {
                const songElement = document.createElement("section");
                songElement.innerHTML = `
          <h2 class='raag'>Raag ${raag}</h2>
          <p class="raag-details" style="display: none;">${groupedSongs[raag].raagDetails}</p>
          <ul>
            ${groupedSongs[raag].songs
                .map(
                    (song, index) => `
                  <li>
                      <button data-videoid="${extractVideoIdFromLink(song.videoid)}" class="song-link-button">
                        ${song.name}
                      </button>

                    <div class="song-details">
                      <span class="detail-label">Singer:</span> ${song.singer}
                      <br>
                      <span class="detail-label">Composer:</span> ${song.composer}
                      <br>
                      <span class="detail-label">Lyricist:</span> ${song.lyricist}
                    </div>
                    <div class="more-details" id="moreDetails-${index}" style="display: ${song.details ? "none" : "block"};">${song.details}</div>
                  ${index !== groupedSongs[raag].songs.length - 1 ? '<div class="separation-line"></div>' : ""}
                  </li>
                `
                )
                .join("")}
          </ul>
        `;

                songsContainer.appendChild(songElement);
            }

            // Attach onclick event using event delegation
            songsContainer.addEventListener("click", function (event) {
                const target = event.target;
                const listItem = target.closest("li"); // Find the closest <li> element to the clicked target
                const raagSection = target.closest("section");

                if (raagSection && !listItem && !target.closest(".raag-details button")) {
                    const raagDetails = raagSection.querySelector(".raag-details");
                    if (raagDetails) {
                        raagDetails.style.display = raagDetails.style.display === "none" ? "block" : "none";
                        // Check if the details are visible and convert numbers to blue if they exist
                        if (raagDetails.style.display === "block") {
                            raagDetails.innerHTML = replaceFormatting(raagDetails.innerHTML);
                        }
                    }
                }

                if (listItem) {
                    const moreDetails = listItem.querySelector(".more-details");

                    if (moreDetails && !target.closest(".more-details button")) {
                        moreDetails.style.display = moreDetails.style.display === "none" ? "block" : "none";

                        // Check if the details are visible and convert numbers to blue if they exist
                        if (moreDetails.style.display === "block") {
                            moreDetails.innerHTML = replaceFormatting(moreDetails.innerHTML);
                        }
                    }

                    if (target.classList.contains("song-link-button")) {
                        const videoId = target.dataset.videoid;
                        document.getElementById("YouTube-video-id").value = videoId;
                        youTubePlayerChangeVideoId();
                        event.preventDefault(); // Prevent the default behavior of the button
                    }
                }
            });
        })
        .catch((error) => {
            console.error("Error fetching songs:", error);
        });
}

// Call the fetchSongs function when the page loads
document.addEventListener("DOMContentLoaded", fetchSongs);







//PIANO

var notes = {
    'sa': 'notes/sa.mp3',
    're': 'notes/re.mp3',
    'ga': 'notes/ga.mp3',
    'ma': 'notes/ma.mp3',
    'pa': 'notes/pa.mp3',
    'dha': 'notes/dha.mp3',
    'ni': 'notes/ni.mp3',
    'sa2': 'notes/sa2.mp3'
};


function playNotes(input, delay = 300) {
    var sequence = input.replace(/,/g, ' , ');
    sequence = sequence.split(/\s+/); // Split by spaces

    var delayShort = delay; // Short pause duration in milliseconds
    var delayLong = delayShort * 1.1; // Long pause duration in milliseconds

    function playSequence(index) {
        if (index < sequence.length) {
            var note = sequence[index];
            
            if (note === ',') {
                setTimeout(function () {
                    playSequence(index + 1);
                }, delayLong);
            } else if (notes[note]) {
                var audio = new Audio(notes[note]);
                audio.play();
                setTimeout(function () {
                    playSequence(index + 1);
                }, delayShort);
            } else {
                playSequence(index + 1); // Skip unrecognized elements
            }
        }
    }

    playSequence(0);
}

// Example usage:
// playNotes("ga ma dha, ma dha ni, dha ni sa");
