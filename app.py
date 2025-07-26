import os
import json
import uuid
from flask import Flask, render_template, request, jsonify, session
import base64
from PIL import Image
import re
from collections import defaultdict

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this'

# Load Telugu characters
with open('telugu_script.json', 'r', encoding='utf-8') as f:
    telugu_data = json.load(f)

# Create data directories
DATA_DIR = 'collected_data'
USERS_DIR = os.path.join(DATA_DIR, 'users')
PROGRESS_FILE = os.path.join(DATA_DIR, 'progress.json')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(USERS_DIR, exist_ok=True)

# Create category directories
for category in ['vowels', 'consonants', 'vowel_signs', 'special_signs']:
    os.makedirs(os.path.join(DATA_DIR, category), exist_ok=True)


def load_progress():
    """Load progress from file"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {}


def save_progress(progress):
    """Save progress to file"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)


def sanitize_filename(name):
    """Sanitize filename to remove special characters"""
    return re.sub(r'[^\w\-_\. ]', '_', name)


@app.route('/')
def index():
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())

    # Create user directory
    user_dir = os.path.join(USERS_DIR, session['user_id'])
    os.makedirs(user_dir, exist_ok=True)

    # Automatically select the first vowel
    vowels = telugu_data.get('vowels', [])
    if vowels:
        first_vowel = vowels[0]
        session['current_character'] = first_vowel
        session['current_category'] = 'vowels'

    return render_template('index.html', telugu_data=telugu_data)


@app.route('/save_drawing', methods=['POST'])
def save_drawing():
    try:
        data = request.json
        character = data['character']
        category = data['category']
        name = data['name']
        image_data = data['image']

        # Validate required fields
        if not all([character, category, name, image_data]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400

        # Decode base64 image
        image_data = image_data.split(',')[1]
        image_bytes = base64.b64decode(image_data)

        # Create unique filename
        sanitized_name = sanitize_filename(name)
        filename = f"{sanitized_name}_{uuid.uuid4().hex[:8]}.png"

        # Save to category folder
        category_path = os.path.join(DATA_DIR, category)
        file_path = os.path.join(category_path, filename)

        # Save image
        with open(file_path, 'wb') as f:
            f.write(image_bytes)

        # Also save to user folder for tracking
        user_category_path = os.path.join(
            USERS_DIR, session['user_id'], category)
        os.makedirs(user_category_path, exist_ok=True)
        user_file_path = os.path.join(user_category_path, filename)
        with open(user_file_path, 'wb') as f:
            f.write(image_bytes)

        # Update progress
        char_key = f"{category}_{character}"
        progress = load_progress()
        if char_key not in progress:
            progress[char_key] = 0
        progress[char_key] += 1
        save_progress(progress)

        return jsonify({'success': True, 'message': 'Saved successfully!'})

    except Exception as e:
        print(f"Error saving drawing: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/get_global_progress')
def get_global_progress():
    progress = load_progress()

    # Count characters with 50+ samples
    chars_with_50 = sum(1 for count in progress.values() if count >= 50)
    total_chars = (len(telugu_data['vowels']) +
                   len(telugu_data['consonants']) +
                   len(telugu_data['vowel_signs']) +
                   len(telugu_data['special_signs']))

    # Calculate overall progress
    total_samples_collected = sum(progress.values())
    target_samples = total_chars * 50  # 50 samples per character

    percentage = round((total_samples_collected /
                       target_samples * 100) if target_samples > 0 else 0, 1)

    return jsonify({
        'chars_with_50_samples': chars_with_50,
        'total_characters': total_chars,
        'total_samples_collected': total_samples_collected,
        'target_samples': target_samples,
        'percentage': percentage
    })


@app.route('/get_character_progress')
def get_character_progress():
    """Get progress for each character"""
    progress = load_progress()
    return jsonify(progress)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
