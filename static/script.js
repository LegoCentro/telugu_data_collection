class TeluguCollector {
  constructor() {
    this.currentCharacter = null;
    this.currentCategory = "vowels";
    this.canvas = document.getElementById("drawingCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.progressData = {};
    this.audioPlayer = document.getElementById("audioPlayer");
    this.listenButton = document.getElementById("listenButton");
    this.loadingSpinner = document.getElementById("loadingSpinner");
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)(); // For playing PCM audio

    this.init();
  }

  init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.populateCharacterGrid();
    this.updateProgress();

    // Automatically select the first vowel
    const firstVowel = window.teluguData.vowels[0];
    this.selectCharacter(firstVowel, "vowels");
    // Re-populate and update progress to ensure initial state is correct
    this.populateCharacterGrid();
    this.updateProgress();
  }

  setupCanvas() {
    // Set canvas background to white
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  setupEventListeners() {
    // Canvas drawing events
    this.canvas.addEventListener("mousedown", (e) => this.startDrawing(e));
    this.canvas.addEventListener("mousemove", (e) => this.draw(e));
    this.canvas.addEventListener("mouseup", () => this.stopDrawing());
    this.canvas.addEventListener("mouseout", () => this.stopDrawing());

    // Touch events for mobile
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousedown", {
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
      this.canvas.dispatchEvent(mouseEvent);
    });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousemove", {
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
      this.canvas.dispatchEvent(mouseEvent);
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      const mouseEvent = new MouseEvent("mouseup", {});
      this.canvas.dispatchEvent(mouseEvent);
    });

    // Button events
    document
      .getElementById("clearCanvas")
      .addEventListener("click", () => this.clearCanvas());
    document
      .getElementById("saveDrawing")
      .addEventListener("click", () => this.saveDrawing());

    // NEW: Listen button event
    this.listenButton.addEventListener("click", () => this.playCharacterAudio());

    // Tab events
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.switchCategory(e));
    });
  }

  populateCharacterGrid() {
    const characterGrid = document.getElementById("characterGrid");
    characterGrid.innerHTML = "";

    const categoryData = window.teluguData[this.currentCategory] || [];

    categoryData.forEach((charData, index) => {
      const charKey = `${this.currentCategory}_${charData.character}`;
      const currentCount = this.progressData[charKey] || 0;
      const isCompleted = currentCount >= 50;

      const charItem = document.createElement("div");
      charItem.className = `character-item ${isCompleted ? "completed" : ""}`;
      charItem.innerHTML = `
                <div class="char">${charData.character}</div>
                <div class="name">${charData.name}</div>
                <div class="progress-count">${currentCount}/50</div>
            `;

      charItem.addEventListener("click", () => {
        this.selectCharacter(charData, this.currentCategory);
        document.querySelectorAll(".character-item").forEach((item) => {
          item.classList.remove("selected");
        });
        charItem.classList.add("selected");
      });

      characterGrid.appendChild(charItem);
    });
  }

  switchCategory(event) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    event.target.classList.add("active");

    this.currentCategory = event.target.dataset.category;
    this.populateCharacterGrid();
  }

  selectCharacter(characterData, category) {
    this.currentCharacter = characterData;
    document.getElementById("currentCharacter").textContent =
      characterData.character;
    document.getElementById("characterName").textContent = `${
      characterData.name
    } (${category.replace("_", " ")})`;
    document.getElementById(
      "characterInstructions"
    ).textContent = `Please write the character "${characterData.character}" in the box below`;

    // Update samples needed display
    const charKey = `${category}_${characterData.character}`;
    const currentCount = this.progressData[charKey] || 0;
    document.getElementById(
      "samplesNeeded"
    ).textContent = `Samples collected: ${currentCount}/50 ${
      currentCount >= 50 ? "✅" : "❌"
    }`;

    this.clearCanvas();
  }

  startDrawing(e) {
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.lastX = e.clientX - rect.left;
    this.lastY = e.clientY - rect.top;
  }

  draw(e) {
    if (!this.isDrawing) return;

    const rect = this.canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(currentX, currentY);
    this.ctx.stroke();

    this.lastX = currentX;
    this.lastY = currentY;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  clearCanvas() {
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.setupCanvas();
  }

  async saveDrawing() {
    if (!this.currentCharacter) {
      this.showNotification("Please select a character first!", "error");
      return;
    }

    // Convert canvas to data URL
    const dataURL = this.canvas.toDataURL("image/png");

    const payload = {
      character: this.currentCharacter.character,
      category: this.currentCategory,
      name: this.currentCharacter.name,
      image: dataURL,
    };

    try {
      const response = await fetch("/save_drawing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification(
          "Saved successfully! Please select the next character.",
          "success"
        );
        this.clearCanvas();
        // Update progress after saving
        await this.updateProgress();
      } else {
        this.showNotification("Error saving: " + result.message, "error");
      }
    } catch (error) {
      this.showNotification("Network error: " + error.message, "error");
    }
  }

  showNotification(message, type) {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
      notification.classList.remove("show");
    }, 3000);
  }

  async updateProgress() {
    try {
      const response = await fetch("/get_global_progress");
      const progress = await response.json();

      const progressFill = document.getElementById("progressFill");
      const progressText = document.getElementById("progressText");
      const detailProgressText = document.getElementById("detailProgressText");

      progressFill.style.width = `${progress.percentage}%`;
      progressText.textContent = `Overall Progress: ${progress.percentage}%`;
      detailProgressText.textContent =
        `Characters with 50+ samples: ${progress.chars_with_50_samples}/${progress.total_characters} | ` +
        `Total samples collected: ${progress.total_samples_collected}/${progress.target_samples}`;

      // Update character grid with latest progress
      const progressResponse = await fetch("/get_character_progress");
      this.progressData = await progressResponse.json();

      // Refresh character grid to show updated counts
      this.populateCharacterGrid();

      // Update samples needed display if a character is selected
      if (this.currentCharacter) {
        const charKey = `${this.currentCategory}_${this.currentCharacter.character}`;
        const currentCount = this.progressData[charKey] || 0;
        document.getElementById(
          "samplesNeeded"
        ).textContent = `Samples collected: ${currentCount}/50 ${
          currentCount >= 50 ? "✅" : "❌"
        }`;
      }
    } catch (error) {
      console.error("Error updating progress:", error);
    }
  }

  // --- NEW: Text-to-Speech (TTS) Functionality ---

  async playCharacterAudio() {
    if (!this.currentCharacter || !this.currentCharacter.character) {
      this.showNotification("No character selected to play audio.", "error");
      return;
    }

    const characterToSpeak = this.currentCharacter.character;
    this.listenButton.disabled = true; // Disable button during playback
    this.loadingSpinner.style.display = 'block'; // Show spinner

    try {
      // Construct the payload for the Gemini TTS API
      const payload = {
        contents: [{
          parts: [{ text: `Say the Telugu character: ${characterToSpeak}` }]
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" } // A clear voice for pronunciation
            }
          }
        },
        model: "gemini-2.5-flash-preview-tts"
      };

      const apiKey = ""; // Canvas will automatically provide this at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

      let response;
      let retries = 0;
      const maxRetries = 5;
      const initialDelay = 1000; // 1 second

      // Implement exponential backoff for API calls
      while (retries < maxRetries) {
        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            break; // Success! Exit loop
          } else {
            console.warn(`API call failed (status: ${response.status}). Retrying...`);
            retries++;
            await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, retries - 1)));
          }
        } catch (error) {
          console.error(`Network error during API call: ${error}. Retrying...`);
          retries++;
          await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, retries - 1)));
        }
      }

      if (!response || !response.ok) {
        throw new Error(`Failed to fetch audio after ${maxRetries} retries.`);
      }

      const result = await response.json();
      const part = result?.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;

      if (audioData && mimeType && mimeType.startsWith("audio/L16")) {
        // The API returns signed PCM 16-bit audio data (audio/L16).
        // We need to convert it to a playable WAV format.
        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000; // Default to 16kHz if not found

        const pcmData = this.base64ToArrayBuffer(audioData);
        const pcm16 = new Int16Array(pcmData); // PCM 16-bit is signed

        const wavBlob = this.pcmToWav(pcm16, sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);

        this.audioPlayer.src = audioUrl;
        this.audioPlayer.play();

        this.audioPlayer.onended = () => {
            URL.revokeObjectURL(audioUrl); // Clean up the object URL after playback
        };

      } else {
        this.showNotification("Failed to get audio data or unsupported format.", "error");
        console.error("API response structure unexpected or audio data missing:", result);
      }
    } catch (error) {
      this.showNotification("Error playing audio: " + error.message, "error");
      console.error("TTS Error:", error);
    } finally {
      this.listenButton.disabled = false; // Re-enable button
      this.loadingSpinner.style.display = 'none'; // Hide spinner
    }
  }

  // Helper function to convert base64 to ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Helper function to convert PCM data to WAV Blob
  pcmToWav(pcm16, sampleRate) {
    const numChannels = 1; // Mono audio
    const bytesPerSample = 2; // 16-bit PCM

    const dataLength = pcm16.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // RIFF identifier
    this.writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    this.writeString(view, 8, 'WAVE');
    // format chunk identifier
    this.writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw PCM)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    // block align (channels * bytes per sample)
    view.setUint16(32, numChannels * bytesPerSample, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    this.writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataLength, true);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += bytesPerSample) {
        view.setInt16(offset, pcm16[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  // Helper for pcmToWav
  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.collector = new TeluguCollector();
});
