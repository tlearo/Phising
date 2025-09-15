// Auth guard & element refs
const user = JSON.parse(localStorage.getItem("user"));
const teamWelcome = document.getElementById("teamWelcome");
const progressStatus = document.getElementById("progressStatus");

// Only teams can access the game
if (!user || user.role !== "team") {
    window.location.href = "index.html";
} else {
    if (teamWelcome) {
        teamWelcome.textContent = `Welcome, ${user.username.toUpperCase()}`;
    }

    // Load/seed progress for this team
    let progress =
        JSON.parse(localStorage.getItem(`${user.username}_progress`)) || {
            phishing: false,
            password: false,
            encryption: false,
            essential: false
        };

    function saveProgress() {
        localStorage.setItem(`${user.username}_progress`, JSON.stringify(progress));
    }

    function updateJourneyBadges() {
        const map = {
            phishing: document.getElementById("step-phishing"),
            password: document.getElementById("step-password"),
            encryption: document.getElementById("step-encryption"),
            essential: document.getElementById("step-essential")
        };
        Object.entries(progress).forEach(([key, done]) => {
            if (map[key]) map[key].classList.toggle("step-done", !!done);
        });
    }

    function updateProgressDisplay() {
        const completed = Object.values(progress).filter(Boolean).length;
        if (progressStatus) {
            progressStatus.textContent = `${completed}/4 puzzles completed`;
        }
        saveProgress();
        updateJourneyBadges();
    }

    // Initial render
    updateProgressDisplay();

    // --- Lock panel toggle + autofocus -------------------------------------
    const openBtn = document.getElementById("openLockPanel");
    const lockPanel = document.getElementById("lockPanel");

    if (openBtn && lockPanel) {
        openBtn.addEventListener("click", () => {
            const willOpen = lockPanel.classList.contains("hidden");
            lockPanel.classList.toggle("hidden", !willOpen);
            openBtn.setAttribute("aria-expanded", String(willOpen));
            if (willOpen) {
                const first = lockPanel.querySelector(".lock-digit");
                if (first) first.focus();
            }
        });
    }

    // --- Auto-advance across 4 digits --------------------------------------
    const digits = document.querySelectorAll(".lock-digit");
    digits.forEach((inp, idx, list) => {
        inp.addEventListener("input", () => {
            // numeric only; single char
            inp.value = inp.value.replace(/[^0-9]/g, "").slice(0, 1);
            if (inp.value && idx < list.length - 1) list[idx + 1].focus();
        });
        inp.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && !inp.value && idx > 0) {
                list[idx - 1].focus();
            }
        });
    });
}

// --- Hash helper to avoid shipping plaintext code --------------------------
async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// IMPORTANT: replace with the real hash of your 4-digit code.
// Example: for code "4312", compute the hash and paste here.
const CORRECT_CODE_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

// Called by the Unlock button
async function checkCode() {
    const feedback = document.getElementById("lockFeedback");
    const chest = document.getElementById("vaultChest");
    const digits = Array.from(document.querySelectorAll(".lock-digit"))
        .map(el => (el.value || "").trim())
        .join("");

    if (!feedback) return;

    if (digits.length !== 4) {
        feedback.textContent = "Enter all 4 digits.";
        feedback.style.color = "#ff5555";
        return;
    }

    const hash = await sha256(digits);
    if (hash === CORRECT_CODE_HASH) {
        feedback.textContent = "Vault unlocked! You've escaped!";
        feedback.style.color = "#09ff88";
        chest?.classList.add("open");
    } else {
        feedback.textContent = "✗ Incorrect code. Try again.";
        feedback.style.color = "#ff5555";
    }
}

// Expose for buttons
function logout() {
    localStorage.clear();
    window.location.href = "index.html";
}
