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
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.collector = new TeluguCollector();
});
