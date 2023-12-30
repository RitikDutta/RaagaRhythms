var notes = new Array();

notes['sa'] = 'notes/sa.mp3';
notes['re'] = 'notes/re.mp3';
notes['ga'] = 'notes/ga.mp3';
notes['ma'] = 'notes/ma.mp3';
notes['pa'] = 'notes/pa.mp3';
notes['dha'] = 'notes/dha.mp3';
notes['ni'] = 'notes/ni.mp3';
notes['sa2'] = 'notes/sa2.mp3';


for (var note in notes) {
    // insert audio
    $('body').append('<audio id="note_' + note + '" src="' + notes[note] + '"></audio>');
    // activate button
    $('#' + note).click(function (e) {
        e.preventDefault();
        myNote = document.getElementById('note_' + $(this).attr('id'));
        myNote.currentTime = 0;
        myNote.play();
    });
}

function addSpaceBeforeComma(text) {
  const modifiedText = text.replace(/,/g, ' , ');
  return modifiedText;
}


function getSelectedDelay() {
    const delaySlider = document.getElementById('delaySlider');
    const selectedDelay = parseInt(delaySlider.value);
    return selectedDelay;
}

// Function to play the custom tune based on input from the textbox
function playCustomTune() {
    var customTuneInput = document.getElementById('customTuneInput').value.trim().toLowerCase();
    var customTuneInputMod = addSpaceBeforeComma(customTuneInput);
    var delay = getSelectedDelay();

    // Split the input by spaces to get individual notes and breaks
    var customTuneSections = customTuneInputMod.split(/\s+/);

    // Iterate through each section (note or break)
    customTuneSections.forEach((section, index) => {
        if (section === ',') {
            // If it's a comma (break), wait for the specified delay before proceeding to the next section
            setTimeout(() => {}, index * delay);
        } else if (Object.keys(notes).includes(section)) {
            // If it's a valid note, play it after the break (if any)
            setTimeout(() => {
                var myNote = document.getElementById('note_' + section);
                myNote.currentTime = 0;
                myNote.play();
            }, (index + 1) * delay); // Play the note after the break
        }
    });
}

// Add event listener for the 'Play Custom Tune' button
document.getElementById('playCustomTune').addEventListener('click', function () {
    playCustomTune();
});

// Add event listener for the delay slider to update the displayed value
document.getElementById('delaySlider').addEventListener('input', function () {
    const delayValue = document.getElementById('delayValue');
    delayValue.textContent = this.value + ' ms';
});
