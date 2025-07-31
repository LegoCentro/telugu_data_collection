import os
import json
import uuid
import base64
import re
from collections import defaultdict
from flask import Flask, render_template, request, jsonify, session
from PIL import Image
import boto3
from botocore.exceptions import NoCredentialsError, ClientError

# Initialize Flask app
app = Flask(__name__)
# Use an environment variable for the secret key for security.
# Set FLASK_SECRET_KEY in Render's environment variables.
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a_very_strong_random_fallback_key_for_dev_only')

# Load Telugu characters data from the JSON file
# Ensure telugu_script.json is in the same directory as app.py or adjust path
try:
    with open('telugu_script.json', 'r', encoding='utf-8') as f:
        telugu_data = json.load(f)
except FileNotFoundError:
    print("Error: telugu_script.json not found. Please ensure it's in the correct directory.")
    telugu_data = {"vowels": [], "consonants": [], "vowel_signs": [], "special_signs": []}
except json.JSONDecodeError:
    print("Error: Could not decode telugu_script.json. Check file format.")
    telugu_data = {"vowels": [], "consonants": [], "vowel_signs": [], "special_signs": []}


# --- S3 Configuration ---
# These values will be read from environment variables set in Render.com
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1') # Default region if not specified

# NEW: Gemini API Key
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

s3_client = None
if S3_BUCKET_NAME and AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    try:
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
        print(f"S3 client initialized for bucket: {S3_BUCKET_NAME} in region: {AWS_REGION}")
    except Exception as e:
        print(f"Error initializing S3 client: {e}")
        s3_client = None
else:
    print("S3 environment variables (S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) not fully set. S3 operations will be skipped.")

# S3 key for the global progress JSON file
S3_PROGRESS_KEY = 'global_progress/progress.json'

def sanitize_filename(name):
    """Sanitize filename to remove special characters"""
    return re.sub(r'[^\w\-_\. ]', '_', name)

def load_progress():
    """Load progress from S3"""
    if not s3_client:
        print("S3 client not initialized. Cannot load progress.")
        return {}
    try:
        response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=S3_PROGRESS_KEY)
        return json.loads(response['Body'].read().decode('utf-8'))
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            print(f"Progress file {S3_PROGRESS_KEY} not found in S3. Starting new progress.")
            return {}
        else:
            print(f"Error loading progress from S3: {e}")
            return {}
    except Exception as e:
        print(f"Unexpected error loading progress from S3: {e}")
        return {}

def save_progress(progress):
    """Save progress to S3"""
    if not s3_client:
        print("S3 client not initialized. Cannot save progress.")
        return
    try:
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=S3_PROGRESS_KEY,
            Body=json.dumps(progress).encode('utf-8'),
            ContentType='application/json'
        )
    except Exception as e:
        print(f"Error saving progress to S3: {e}")

@app.route('/')
def index():
    # Assign a unique user ID for the session if not already present
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
        print(f"New user session created: {session['user_id']}")

    # Automatically select the first vowel on initial load
    vowels = telugu_data.get('vowels', [])
    if vowels:
        session['current_character'] = vowels[0]
        session['current_category'] = 'vowels'
    else:
        session['current_character'] = None
        session['current_category'] = 'vowels' # Default category

    # Pass the Gemini API key to the template
    return render_template('index.html', telugu_data=telugu_data, gemini_api_key=GEMINI_API_KEY)


@app.route('/save_drawing', methods=['POST'])
def save_drawing():
    if not s3_client:
        return jsonify({'success': False, 'message': 'S3 client not initialized. Cannot save drawing.'}), 500

    try:
        data = request.json
        character = data.get('character')
        category = data.get('category')
        name = data.get('name')
        image_data = data.get('image')

        # Validate required fields
        if not all([character, category, name, image_data]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400

        # Decode base64 image
        # image_data typically starts with "data:image/png;base64,"
        image_bytes = base64.b64decode(image_data.split(',')[1])

        # Create unique S3 key (path within the bucket)
        user_id = session.get('user_id', 'anonymous') # Use 'anonymous' if user_id somehow missing
        sanitized_name = sanitize_filename(name)
        s3_key = f"users/{user_id}/{category}/{sanitized_name}_{uuid.uuid4().hex[:8]}.png"

        # Upload image to S3
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=image_bytes,
            ContentType='image/png'
        )
        print(f"Image uploaded to S3: {s3_key}")

        # Update progress in S3
        char_key = f"{category}_{character}"
        progress = load_progress() # Load from S3
        if char_key not in progress:
            progress[char_key] = 0
        progress[char_key] += 1
        save_progress(progress) # Save to S3

        return jsonify({'success': True, 'message': 'Saved successfully!'})

    except NoCredentialsError:
        print("AWS credentials not found or configured for S3 operation.")
        return jsonify({'success': False, 'message': 'AWS credentials not configured.'}), 500
    except Exception as e:
        print(f"Error saving drawing to S3: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/get_global_progress')
def get_global_progress():
    progress = load_progress() # Load from S3

    # Calculate total number of characters
    total_chars = (len(telugu_data.get('vowels', [])) +
                    len(telugu_data.get('consonants', [])) +
                    len(telugu_data.get('vowel_signs', [])) +
                    len(telugu_data.get('special_signs', [])))

    # Count characters with 50+ samples
    chars_with_50 = sum(1 for count in progress.values() if count >= 50)

    # Calculate overall progress
    total_samples_collected = sum(progress.values())
    target_samples = total_chars * 50  # 50 samples per character

    percentage = round((total_samples_collected / target_samples * 100) if target_samples > 0 else 0, 1)

    return jsonify({
        'chars_with_50_samples': chars_with_50,
        'total_characters': total_chars,
        'total_samples_collected': total_samples_collected,
        'target_samples': target_samples,
        'percentage': percentage
    })

@app.route('/get_character_progress')
def get_character_progress():
    """Get progress for each character from S3"""
    progress = load_progress() # Load from S3
    return jsonify(progress)

# The __name__ == '__main__' block is removed as Gunicorn will start the app in production.
# If you want to run it locally for testing, you can temporarily add:
# if __name__ == '__main__':
#     app.run(debug=True, host='0.0.0.0', port=5000)
