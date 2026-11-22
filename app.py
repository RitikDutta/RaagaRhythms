from pathlib import Path

from flask import Flask, abort, send_from_directory

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent

PUBLIC_FILES = {
    'future.css',
    'future-design.css',
    'future.js',
    'legacy.html',
    'piano.css',
    'piano.html',
    'piano.js',
    'testing-mic-proximity.html',
    'testing-vocal-accuracy.html',
    'song_test.mp3',
    'script.js',
    'style.css',
    'ui-switcher.css',
    'ui-switcher.js',
    'voice.html',
}
PUBLIC_DIRECTORIES = ('crepe/', 'images/', 'notes/', 'mic-proximity/', 'vocal-accuracy/', 'future_phase/public/')

@app.route('/')
def raagas_webpage():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/<path:asset_path>')
def public_asset(asset_path):
    is_public_directory = any(asset_path.startswith(prefix) for prefix in PUBLIC_DIRECTORIES)
    if asset_path not in PUBLIC_FILES and not is_public_directory:
        abort(404)
    return send_from_directory(BASE_DIR, asset_path)

if __name__ == '__main__':
    app.run(debug=True, port=8000)
