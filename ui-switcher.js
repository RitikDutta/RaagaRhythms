(function () {
    "use strict";

    document.querySelectorAll("[data-ui-choice]").forEach(function (link) {
        link.addEventListener("click", function () {
            try {
                window.localStorage.setItem("raagarhythms-ui", link.dataset.uiChoice);
            } catch (error) {
                // The switch still works when storage is unavailable.
            }
        });
    });
})();
