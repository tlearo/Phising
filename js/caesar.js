// Caesar cipher decryption
function caesarDecrypt(text, shift) {
    return text
        .split("")
        .map(function (char) {
            const code = char.charCodeAt(0);

            // Uppercase A-Z
            if (code >= 65 && code <= 90) {
                return String.fromCharCode(((code - 65 - shift + 26) % 26) + 65);
            }
            // Lowercase a-z
            if (code >= 97 && code <= 122) {
                return String.fromCharCode(((code - 97 - shift + 26) % 26) + 97);
            }
            // Non-letters unchanged
            return char;
        })
        .join("");
}

// Inject Caesar puzzle into game container
function loadEncryptionPuzzle() {
    puzzleContainer.innerHTML = `
    <h2>Encryption Puzzle</h2>
    <p>Use the Caesar cipher wheel to decode the message.</p>

    <div class="puzzle-box">
      <p><strong>Encrypted Message:</strong> Wklv lv d whvw phvvdjh</p>

      <label for="shiftInput">Shift:</label>
      <input type="number" id="shiftInput" min="1" max="25" value="3" />
      <button onclick="runDecryption()">Decrypt</button>

      <p><strong>Decrypted Output:</strong></p>
      <p id="decryptedOutput" style="font-weight:bold; color:#58a6ff;"></p>

      <input type="text" id="finalAnswer" placeholder="Enter final answer" />
      <button onclick="checkDecryption()">Submit Answer</button>
      <p id="decryptionFeedback"></p>
    </div>
  `;
}

// Run Caesar decryption
function runDecryption() {
    const shift = parseInt(document.getElementById("shiftInput").value, 10) || 0;
    const encrypted = "Wklv lv d whvw phvvdjh";
    const output = caesarDecrypt(encrypted, shift);
    document.getElementById("decryptedOutput").textContent = output;
}

// Check final answer
function checkDecryption() {
    const answer = document.getElementById("finalAnswer").value.trim().toLowerCase();
    const feedback = document.getElementById("decryptionFeedback");

    if (answer === "this is a test message") {
        feedback.textContent = "✓ Correct!";
        if (typeof completePuzzle === "function") {
            completePuzzle("encryption");
        }
    } else {
        feedback.textContent = "✗ Try again.";
    }
}
