// Pool of candidate passwords (NO PLAINTEXT in code).
// Each item has: hash (SHA-256, hex) and an array of clue strings.
const PUZZLES = [
    {
        hash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92", // 123456
        clues: [
            "Digits only.",
            "Extremely short.",
            "Commonly ranked #1 on most-used lists.",
            "Consecutive ascending numbers.",
            "This exact choice is often used as a sample in tutorials."
        ]
    },
    {
        hash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", // password
        clues: [
            "All lowercase letters.",
            "A real word found in the dictionary.",
            "Ironically the most obvious choice.",
            "Seen in countless leaked credential dumps.",
            "It literally describes itself."
        ]
    },
    {
        hash: "65e84be33532fb784c48129675f9eff3a682b27168c0ea744b2cf58ee02337c5", // qwerty
        clues: [
            "Letters only.",
            "A keyboard pattern.",
            "Starts on the top row of many keyboards.",
            "Often extended with numbers to the right.",
            "Left-to-right sweep with one hand."
        ]
    },
    {
        hash: "6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090", // abc123
        clues: [
            "Mix of letters and numbers.",
            "Alphabet sequence followed by digits.",
            "Six characters total.",
            "Appears on top-10 lists frequently.",
            "Basic training-wheels combo."
        ]
    },
    {
        hash: "19513fdc9da4fb72a4a05eb66917548d3c90ff94d5419e1f2363eea89dfee1dd", // Password1
        clues: [
            "Looks like it meets 'one uppercase + numbers' rules.",
            "A capital letter starts it.",
            "Ends with a single digit.",
            "Still very weak despite 'complexity'.",
            "Common policy-compliant bad choice."
        ]
    },
    {
        hash: "1c8bfe8f801d79745c4631d09fff36c82aa37fc4cce4fc946683d7b336b63032", // letmein
        clues: [
            "All lowercase letters.",
            "A short phrase.",
            "A plea typed by impatient users.",
            "Two words merged together.",
            "Seven characters long."
        ]
    }
];

// --- Utility: SHA-256 (browser WebCrypto) ---------------------------------
async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- Elements --------------------------------------------------------------
const clueList = document.getElementById("clueList");
const nextClueBtn = document.getElementById("nextClueBtn");
const resetCluesBtn = document.getElementById("resetCluesBtn");
const submitGuessBtn = document.getElementById("submitGuessBtn");
const clearGuessBtn = document.getElementById("clearGuessBtn");
const feedback = document.getElementById("pwFeedback");
const input = document.getElementById("pwGuess");

// --- Pick one puzzle per visit --------------------------------------------
const chosen = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
let revealed = 0;

function renderClues() {
    if (!clueList) return;
    clueList.innerHTML = "";
    for (let i = 0; i < revealed; i++) {
        const li = document.createElement("li");
        li.textContent = chosen.clues[i];
        clueList.appendChild(li);
    }
}

function revealNextClue() {
    if (revealed < chosen.clues.length) {
        revealed++;
        renderClues();
    }
}

function resetClues() {
    revealed = 0;
    renderClues();
    if (feedback) feedback.textContent = "";
}

nextClueBtn?.addEventListener("click", revealNextClue);
resetCluesBtn?.addEventListener("click", resetClues);

// Show the first clue on load
revealNextClue();

// --- Guess submission ------------------------------------------------------
submitGuessBtn?.addEventListener("click", async () => {
    const guess = (input?.value || "").trim();
    if (!guess) return;

    const hash = await sha256Hex(guess);
    if (hash === chosen.hash) {
        if (feedback) {
            feedback.textContent = "✅ Correct! Nicely done.";
            feedback.style.color = "#09ff88";
        }

        // mark progress for this team
        try {
            const user = JSON.parse(localStorage.getItem("user"));
            if (user && user.username) {
                const key = `${user.username}_progress`;
                const prog = JSON.parse(localStorage.getItem(key)) || {
                    phishing: false, password: false, encryption: false, essential: false
                };
                prog.password = true;
                localStorage.setItem(key, JSON.stringify(prog));
            }
        } catch { }

    } else {
        if (feedback) {
            feedback.textContent = "❌ Not quite. Check the clues and try again.";
            feedback.style.color = "#ff5555";
        }
    }
});

clearGuessBtn?.addEventListener("click", () => {
    if (input) input.value = "";
    if (feedback) feedback.textContent = "";
    input?.focus();
});

// Enter to submit
input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitGuessBtn?.click();
    }
});
