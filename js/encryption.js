/* ===================== Encryption (Caesar Wheel) ====================== */
/* Config */
// Hash of: "this is a test message"
const CORRECT_PLAINTEXT_HASH =
    "4e4aa09b6d80efbd684e80f54a70c1d8605625c3380f4cb012b32644a002b5be";
// Ciphertext created with shift 3
const CIPHERTEXT = "Wklv lv d whvw phvvdjh";

/* Elements */
const outerRing = document.getElementById("outerRing");
const innerRing = document.getElementById("innerRing");
const wheelWrap = document.getElementById("wheelWrap");

const shiftSlider = document.getElementById("shiftSlider");
const shiftDown = document.getElementById("shiftDown");
const shiftUp = document.getElementById("shiftUp");
const shiftValueEl = document.getElementById("shiftValue");

const cipherEl = document.getElementById("cipherText");
const liveOut = document.getElementById("liveOutput");
const finalAnswer = document.getElementById("finalAnswer");
const submitBtn = document.getElementById("submitBtn");
const feedback = document.getElementById("encFeedback");

/* Helpers */
function caesarDecrypt(text, shift) {
    return text
        .split("")
        .map((ch) => {
            const c = ch.charCodeAt(0);
            if (c >= 65 && c <= 90) return String.fromCharCode(((c - 65 - shift + 26) % 26) + 65);
            if (c >= 97 && c <= 122) return String.fromCharCode(((c - 97 - shift + 26) % 26) + 97);
            return ch;
        })
        .join("");
}

async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
/** Place letters evenly on a circle.
 * counterRotate=true keeps letters upright (for OUTER).
 * className is "outer" | "inner" for styling.
 */
function placeLetters(ring, letters, radius, counterRotate, className) {
    ring.innerHTML = "";
    const step = 360 / letters.length;

    letters.forEach((letter, i) => {
        // Base angle so index 0 ("A") is at the TOP (12 o'clock)
        const angle = i * step - 90; // -90° shifts 0° from +X axis to +Y axis (top)
        const span = document.createElement("span");
        span.className = `glyph ${className}`;
        span.textContent = letter;

        span.style.transform = counterRotate
            ? `rotate(${angle}deg) translate(${radius}px) rotate(${-angle}deg)`   // upright letters
            : `rotate(${angle}deg) translate(${radius}px)`;                      // rotate with ring
        ring.appendChild(span);
    });
}

/** Build both rings using the wrap size so glyphs hug the outlines without overlap. */
function populateRings() {
    const rect = wheelWrap.getBoundingClientRect();
    const wrapR = Math.floor(Math.min(rect.width, rect.height) / 2);

    // Keep glyphs a little inside each border (prevents overlap/clip)
    const OUTER_TEXT_RADIUS = wrapR - 20;         // sits just inside grey outline
    const INNER_RING_RATIO = 0.76;               // matches .wheel.inner size in CSS
    const innerRingR = Math.floor(wrapR * INNER_RING_RATIO);
    const INNER_TEXT_RADIUS = innerRingR - 12;    // sits just inside blue outline

    // Outer = plaintext A–Z (fixed, upright)
    placeLetters(
        outerRing,
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
        OUTER_TEXT_RADIUS,
        true,
        "outer"
    );

    // Inner = cipher a–z (rotates as a whole with the ring)
    placeLetters(
        innerRing,
        "abcdefghijklmnopqrstuvwxyz".split(""),
        INNER_TEXT_RADIUS,
        false,
        "inner"
    );
}


/** Update live decryption + rotate the inner ring smoothly around center */
function updateLive() {
    const shift = Number(shiftSlider.value) % 26;
    shiftValueEl.textContent = String(shift);

    // Rotate the whole inner ring by exact letter increments
    const degPerStep = 360 / 26;
    innerRing.style.transform = `rotate(${-(shift * degPerStep)}deg)`;

    liveOut.textContent = caesarDecrypt(CIPHERTEXT, shift);
    innerRing.setAttribute("aria-valuenow", String(shift));
}

/* Drag-to-rotate (snaps to letter steps) */
(function enableDragRotation() {
    let dragging = false;

    function setShiftFromPointer(e) {
        const rect = wheelWrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = clientX - cx;
        const y = clientY - cy;

        // Angle with 0° at top; positive clockwise
        let deg = (Math.atan2(y, x) * 180) / Math.PI; // -180..180 (0 at +X axis)
        deg = (deg + 90 + 360) % 360; // 0 at top

        const step = 360 / 26;
        const snapped = Math.round(deg / step) % 26;
        shiftSlider.value = String(snapped);
        updateLive();
    }

    innerRing.addEventListener("mousedown", (e) => {
        dragging = true;
        e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
        if (dragging) setShiftFromPointer(e);
    });
    window.addEventListener("mouseup", () => (dragging = false));

    innerRing.addEventListener(
        "touchstart",
        (e) => {
            dragging = true;
            e.preventDefault();
        },
        { passive: false }
    );
    window.addEventListener(
        "touchmove",
        (e) => {
            if (dragging) setShiftFromPointer(e);
        },
        { passive: false }
    );
    window.addEventListener("touchend", () => (dragging = false));
})();

/* Controls */
shiftSlider.addEventListener("input", updateLive);
shiftDown.addEventListener("click", () => {
    shiftSlider.value = String((Number(shiftSlider.value) + 25) % 26);
    updateLive();
});
shiftUp.addEventListener("click", () => {
    shiftSlider.value = String((Number(shiftSlider.value) + 1) % 26);
    updateLive();
});

/* Submit (hash-only check) */
submitBtn.addEventListener("click", async () => {
    const guess = (finalAnswer.value || "").trim().toLowerCase();
    if (!guess) return;

    const hash = await sha256Hex(guess);
    if (hash === CORRECT_PLAINTEXT_HASH) {
        feedback.textContent = "✅ Correct! Progress recorded.";
        feedback.style.color = "#09ff88";

        // Mark team progress
        try {
            const user = JSON.parse(localStorage.getItem("user"));
            if (user && user.username) {
                const key = `${user.username}_progress`;
                const prog =
                    JSON.parse(localStorage.getItem(key)) || {
                        phishing: false,
                        password: false,
                        encryption: false,
                        essential: false,
                    };
                prog.encryption = true;
                localStorage.setItem(key, JSON.stringify(prog));
            }
        } catch {
            /* ignore */
        }
    } else {
        feedback.textContent = "❌ Not quite. Adjust the shift and try again.";
        feedback.style.color = "#ff5555";
    }
});

/* Init */
function initWheel() {
    cipherEl.textContent = CIPHERTEXT;
    populateRings();
    updateLive();
}
window.addEventListener("resize", () => {
    populateRings();
    updateLive();
});
initWheel();

/* Enter = submit */
finalAnswer.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
    }
});
