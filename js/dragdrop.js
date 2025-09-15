// dragdrop.js — Essential Eight interactive puzzle (graded on submit, accessible, safe DOM)

// --- Visual palette for consistent pairing (cards ↔ slots) ---
const COLORS = [
    "#7aa2ff", "#ff9f7a", "#ffd166", "#7bd389",
    "#66d9e8", "#c792ea", "#ff6b6b", "#9be15d"
];

// --- Vulnerabilities (draggables) ---
const VULNS = [
    { id: "appControl", text: "Users running malware or unapproved apps" },
    { id: "patchApps", text: "Unpatched apps leave exploits open" },
    { id: "patchOS", text: "Out-of-date operating systems" },
    { id: "restrictMacros", text: "Malicious Office macros in documents" },
    { id: "userApps", text: "Too many people have admin rights" },
    { id: "mfa", text: "Stolen or reused passwords" },
    { id: "backup", text: "Ransomware encrypts or deletes files" },
    { id: "appHardening", text: "Default insecure settings in browsers/apps" }
];

// --- Mitigations (drop slots) — plain-English definitions for non-technical users ---
const MITIGATIONS = [
    {
        id: "appControl", label: "Application control",
        desc: "Only allow approved software to run. Blocks unknown apps and most malware."
    },
    {
        id: "patchApps", label: "Patch applications",
        desc: "Keep apps up to date so criminals can't use known bugs to break in."
    },
    {
        id: "patchOS", label: "Patch operating systems",
        desc: "Install OS updates quickly to fix serious security holes."
    },
    {
        id: "restrictMacros", label: "Configure Office macro settings",
        desc: "Stop hidden code in documents from running unless it's trusted."
    },
    {
        id: "userApps", label: "Restrict admin privileges",
        desc: "Limit powerful accounts so attackers can't change the whole system."
    },
    {
        id: "mfa", label: "Multi-factor authentication",
        desc: "Add a second check so a stolen password alone isn’t enough."
    },
    {
        id: "backup", label: "Regular backups",
        desc: "Keep safe copies so you can recover quickly after ransomware or mistakes."
    },
    {
        id: "appHardening", label: "User application hardening",
        desc: "Turn off risky features (e.g., Flash/Java/ads) to reduce attack paths."
    }
];

// --- State/refs ---
const arena = document.getElementById("essArena");
const vulnList = document.getElementById("vulnList");
const slotList = document.getElementById("mitigationList");
const wires = document.getElementById("essWires");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const feedback = document.getElementById("essFeedback");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");
const toggleWiresBtn = document.getElementById("toggleWiresBtn");
const autofillBtn = document.getElementById("autofillBtn");

let showWires = true;
let currentPick = null;            // keyboard "picked" card
const placedMap = new Map();       // slotId -> vulnId
const cardColor = new Map();       // vulnId -> color

// --- Utils ---
const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
const byId = id => document.getElementById(id);

// Build safe text node quickly
function textEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
}

// --- Build lists (safe, no innerHTML for dynamic text) ---
function buildLists() {
    // Color per vulnerability id
    VULNS.forEach((v, i) => cardColor.set(v.id, COLORS[i % COLORS.length]));

    // Vulnerabilities (left column) — shuffled
    vulnList.replaceChildren();
    shuffle(VULNS).forEach(v => {
        const li = document.createElement("li");
        li.className = "drag-card";
        li.draggable = true;
        li.tabIndex = 0;
        li.dataset.match = v.id;
        li.dataset.color = cardColor.get(v.id);

        const dot = textEl("span", "dot");
        dot.style.background = li.dataset.color;
        const txt = textEl("span", "", v.text);

        li.append(dot, txt);
        vulnList.appendChild(li);
    });

    // Mitigations (right column) — shuffled
    slotList.replaceChildren();
    shuffle(MITIGATIONS).forEach(m => {
        const li = document.createElement("li");
        li.className = "drop-slot";
        li.tabIndex = 0;
        li.dataset.accept = m.id;

        const head = textEl("div", "slot-head");
        const dot = textEl("span", "dot");
        const strong = textEl("strong", "", m.label);
        head.append(dot, strong);

        const desc = textEl("p", "slot-desc", m.desc);
        const bay = textEl("div", "slot-bay");
        bay.setAttribute("aria-label", "Drop here");

        li.append(head, desc, bay);
        slotList.appendChild(li);
    });

    wireUpDnD();
    updateProgress();
    drawWires();
}

// --- DnD & keyboard wiring ---
function wireUpDnD() {
    const cards = [...document.querySelectorAll(".drag-card")];
    const slots = [...document.querySelectorAll(".drop-slot")];

    // Mouse DnD: cards
    cards.forEach(card => {
        card.addEventListener("dragstart", e => {
            e.dataTransfer.setData("text/plain", card.dataset.match);
            e.dataTransfer.setData("color", card.dataset.color);
            card.classList.add("dragging");
        });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
    });

    // Keyboard: pick a card
    cards.forEach(card => {
        card.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (currentPick === card) {
                    // unpick if pressing again on same card
                    card.classList.remove("picked");
                    currentPick = null;
                    return;
                }
                if (currentPick) currentPick.classList.remove("picked");
                currentPick = card;
                card.classList.add("picked");
            }
        });
    });

    // Mouse + keyboard for slots
    slots.forEach(slot => {
        // Mouse
        slot.addEventListener("dragover", e => { e.preventDefault(); slot.classList.add("over"); });
        slot.addEventListener("dragleave", () => slot.classList.remove("over"));
        slot.addEventListener("drop", e => {
            e.preventDefault();
            slot.classList.remove("over");
            const id = e.dataTransfer.getData("text/plain");
            const color = e.dataTransfer.getData("color") || cardColor.get(id);
            placeInSlot(slot, id, color);
        });

        // Keyboard
        slot.addEventListener("keydown", e => {
            if ((e.key === "Enter" || e.key === " ") && currentPick) {
                e.preventDefault();
                placeInSlot(slot, currentPick.dataset.match, currentPick.dataset.color);
                currentPick.classList.remove("picked");
                currentPick = null;
            }
        });
    });
}

// --- Place card into a slot (no correctness check here) ---
function placeInSlot(slot, vulnId, color) {
    // Show tag in bay
    const bay = slot.querySelector(".slot-bay");
    bay.replaceChildren();

    const tag = textEl("span", "tag", vulnText(vulnId));
    tag.style.borderColor = color;
    tag.style.color = color;
    bay.appendChild(tag);

    // Dot color
    const dot = slot.querySelector(".slot-head .dot");
    if (dot) dot.style.background = color;

    slot.dataset.current = vulnId;
    placedMap.set(slot.dataset.accept, vulnId);

    // Clear correctness glow (grading only on submit)
    slot.classList.remove("correct", "incorrect");

    updateProgress();
    drawWires();
}

function vulnText(id) {
    return VULNS.find(v => v.id === id)?.text || id;
}

// --- Wires (SVG) — visual connectors between current card and slot ---
function drawWires() {
    if (!wires) return;
    if (!showWires) { wires.innerHTML = ""; return; }

    const arenaRect = arena.getBoundingClientRect();
    wires.setAttribute("viewBox", `0 0 ${arenaRect.width} ${arenaRect.height}`);
    wires.innerHTML = "";

    const cardById = Object.fromEntries([...document.querySelectorAll(".drag-card")].map(c => [c.dataset.match, c]));
    document.querySelectorAll(".drop-slot").forEach(slot => {
        const chosen = slot.dataset.current;
        if (!chosen) return;
        const card = cardById[chosen];
        if (!card) return;

        const b1 = card.getBoundingClientRect();
        const b2 = slot.getBoundingClientRect();

        const x1 = b1.left + b1.width - arenaRect.left;
        const y1 = b1.top + b1.height / 2 - arenaRect.top;
        const x2 = b2.left - arenaRect.left;
        const y2 = b2.top + b2.height / 2 - arenaRect.top;

        const color = cardColor.get(chosen) || "#58a6ff";
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const midX = (x1 + x2) / 2;

        path.setAttribute("d", `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
        path.setAttribute("class", "wire");
        path.setAttribute("stroke", color);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("opacity", "0.85");

        wires.appendChild(path);
    });
}

// --- Progress (placed count only) ---
function updateProgress() {
    const placed = [...document.querySelectorAll(".drop-slot[data-current]")].length;
    const total = MITIGATIONS.length;
    progressFill.style.width = `${(placed / total) * 100}%`;
    progressText.textContent = `${placed}/${total} placed`;
}

// --- Submit: grade without revealing answers explicitly ---
submitBtn?.addEventListener("click", () => {
    let correct = 0;
    const total = MITIGATIONS.length;

    document.querySelectorAll(".drop-slot").forEach(slot => {
        const want = slot.dataset.accept;
        const got = slot.dataset.current;
        slot.classList.remove("correct", "incorrect");

        if (got) {
            if (got === want) { correct++; slot.classList.add("correct"); }
            else { slot.classList.add("incorrect"); }
        }
    });

    if (correct === total) {
        feedback.textContent = "✅ Perfect! All 8 matched.";
        feedback.style.color = "#09ff88";

        // Persist progress if this is part of your game progression
        try {
            const user = JSON.parse(localStorage.getItem("user"));
            if (user?.username) {
                const key = `${user.username}_progress`;
                const prog = JSON.parse(localStorage.getItem(key)) || {
                    phishing: false, password: false, encryption: false, essential: false
                };
                prog.essential = true;
                localStorage.setItem(key, JSON.stringify(prog));
            }
        } catch { }
    } else {
        const placed = [...document.querySelectorAll(".drop-slot[data-current]")].length;
        const wrong = placed - correct;
        feedback.textContent = `You got ${correct}/${total} right, ${wrong} incorrect. Keep going!`;
        feedback.style.color = "#ffa657";
    }
});

// --- Clear selections ---
clearBtn?.addEventListener("click", () => {
    placedMap.clear();
    document.querySelectorAll(".drop-slot").forEach(slot => {
        slot.removeAttribute("data-current");
        slot.classList.remove("correct", "incorrect");
        const bay = slot.querySelector(".slot-bay");
        if (bay) bay.replaceChildren();
        const dot = slot.querySelector(".slot-head .dot");
        if (dot) dot.style.background = "var(--border)";
    });
    feedback.textContent = "";
    updateProgress();
    drawWires();
});

// --- Toggle wires ---
toggleWiresBtn?.addEventListener("click", () => {
    showWires = !showWires;
    toggleWiresBtn.textContent = showWires ? "Hide connections" : "Show connections";
    toggleWiresBtn.setAttribute("aria-pressed", String(showWires));
    drawWires();
});

// --- Auto-Fill (test) — fill all correctly (remove before real use) ---
autofillBtn?.addEventListener("click", () => {
    document.querySelectorAll(".drop-slot").forEach(slot => {
        const id = slot.dataset.accept;
        placeInSlot(slot, id, cardColor.get(id));
    });
    feedback.textContent = "Filled for testing.";
    feedback.style.color = "var(--muted)";
});

// --- Redraw connectors on resize/scroll to keep lines accurate ---
window.addEventListener("resize", drawWires);
document.addEventListener("scroll", drawWires, true);

// --- Init ---
buildLists();
