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
        playerVars: { autohide: 0, cc_load_policy: 0, controls: 1, disablekb: 1, iv_load_policy: 3, modestbranding: 1, rel: 0, showinfo: 0, start: 3 },
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
    youTubePlayer.pauseVideo();
    youTubePlayerDisplayFixedInfos();

    youTubePlayer.playVideo();
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
        youTubePlayer.seekTo((currentTime * youTubePlayer.getDuration()) / 100, true);
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


// Function to fetch songs from Google Sheets web app and display them
function fetchSongs() {
    fetch(
        "https://script.googleusercontent.com/macros/echo?user_content_key=jYy6eHbLN_GmMCajShhHQB-o5_sMPUbCRyc3dkuKHsDUYR1Wo37SOPPwVbNLMKWmBg6rwd6gLKyjeUHrH0zqkm0pvPPn_VP7m5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnMJacPG11zpZatw9EbpSF0j7IcRpn3mhZxn4OerUGwP4U2DrpCIAcTSdKFvmM8JtbeNebGWtZWMQLUTLFsBtNp53pO-_vgolWQ&lib=Mh0IRVtLjs2NbijZri3x3-4bkD1ZowIV_"
    )
        .then((response) => response.json())
        .then((data) => {
            // Group songs by raag
            const groupedSongs = {};
            data.forEach((song) => {
                if (!groupedSongs[song.raag]) {
                    groupedSongs[song.raag] = [];
                }
                groupedSongs[song.raag].push(song);
            });

            // Process the grouped songs and display them in the container
            const songsContainer = document.getElementById("songs-container");
            songsContainer.innerHTML = ""; // Clear previous content

            for (const raag in groupedSongs) {
                const songElement = document.createElement("section");
                songElement.innerHTML = `
          <h2>Raag ${raag}</h2>
          <ul>
            ${groupedSongs[raag]
                .map(
                    (song) => `
              <li>
                <a href="#" data-videoid="${extractVideoIdFromLink(song.videoid)}" class="song-link">
                  ${song.name}
                </a>
                <div class="song-details">
                  <span class="detail-label">Singer:</span> ${song.singer}
                  <br>
                  <span class="detail-label">Composer:</span> ${song.composer}
                  <br>
                  <span class="detail-label">Lyricist:</span> ${song.lyricist}
                </div>
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
                if (target.classList.contains("song-link")) {
                    const videoId = target.dataset.videoid;
                    document.getElementById("YouTube-video-id").value = videoId;
                    youTubePlayerChangeVideoId();
                    event.preventDefault();
                }
            });
        })
        .catch((error) => {
            console.error("Error fetching songs:", error);
        });
}

// Call the fetchSongs function when the page loads
document.addEventListener("DOMContentLoaded", fetchSongs);
