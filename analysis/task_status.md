# Task Completion Audit

The following checklist captures which user-requested items remain missing from the current codebase. Each entry cites the relevant files that demonstrate the gap.

## Outstanding (not implemented)

- **Phishing slideshow layout adjustments** – The Previous/Next controls remain in the left “Tools” sidebar instead of being moved under the image stage, and the canvas is still fixed at 800×600px within a scrollable box, so the image can overflow the visible frame.【F:phishing.html†L59-L133】
- **Visual progress for completed phishing examples** – While each example writes a `phish_done_*` flag, there is no UI that marks finished examples; the slideshow UI only highlights the current item.【F:js/phishing.js†L104-L143】【F:js/phishing.js†L515-L520】
- **Embedded password-strength tester / service.vic workaround** – The password puzzle still links out to the external tester instead of embedding or replacing it, so the original framing issue is unresolved.【F:password.html†L53-L105】
- **Password success feedback without emoji and clearer completion cue** – The success and failure messages still use emoji-only badges, contrary to the request for a clearer, non-emoji confirmation.【F:js/password.js†L330-L346】
- **Binary challenge expansion (table, XOR, multiplication) and vault digit derivation** – The binary puzzle is still a simple decoder text area with no table, XOR explanation, or multiplication step to drive the lock digit.【F:binary.html†L48-L59】【F:js/binary.js†L1-L34】
- **Admin access to team points history** – Admin cards only show puzzle counts and average times; there is no interface for reviewing per-team point logs or deductions.【F:js/admin.js†L73-L136】
- **Admin layout tweaks (Data Sync & Controls side-by-side under analytics, non-white notes box)** – Data Sync and Controls remain stacked in the left column, separate from the analytics panel, and the notes panel is still the standard card styling.【F:admin.html†L62-L143】
- **Admin-triggered podium / celebration screen** – Admin controls provide confetti and spotlight toggles but no podium element or celebratory screen to show rankings.【F:js/admin.js†L284-L319】
- **Remove “Admin” from public navigation** – Every header still renders an Admin link (hidden for teams via JS), instead of removing it entirely as requested.【F:index.html†L32-L78】【F:game.html†L40-L123】
- **Combine the puzzles/progress boxes on the game hub** – The game page still renders separate “Puzzles”, “Team Points”, and “Progress” cards rather than merging them into a single consolidated module.【F:game.html†L56-L123】
- **Derive vault digits via binary multiplication** – The lock digit continues to come from the decoded text’s trailing digit instead of the requested multiplication puzzle, so the new number source is missing.【F:js/binary.js†L16-L24】

## Implemented (for context)

These items are present in the current build and are not flagged above:

- Points system with hint/penalty deductions in the password puzzle.【F:js/password.js†L214-L347】
- Rotating password scenarios so the answer is not always “password”.【F:js/password.js†L18-L104】
- Caesar wheel restored with letters and index numbers.【F:js/caesar.js†L32-L96】
- Binary puzzle digit stored for the vault lock and surfaced as a fifth digit.【F:js/binary.js†L16-L24】【F:game.html†L141-L160】
- Essential Eight page includes decorative connector lines and progress tracking.【F:essential.html†L20-L120】
- Game page explains how each vault digit is obtained.【F:game.html†L157-L165】

