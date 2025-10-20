# Task Completion Audit

The following checklist captures which user-requested items remain missing from the current codebase. Each entry cites the relevant files that demonstrate the gap.

## Outstanding (not implemented)

- _None at this time._

## Implemented (for context)

These items are present in the current build and are not flagged above:

- Points system with hint/penalty deductions in the password puzzle.【F:js/password.js†L214-L347】
- Rotating password scenarios so the answer is not always “password”.【F:js/password.js†L18-L104】
- Caesar wheel restored with letters and index numbers.【F:js/caesar.js†L32-L96】
- Binary puzzle digit stored for the vault lock and surfaced as a fifth digit.【F:js/binary.js†L16-L24】【F:game.html†L141-L160】
- Essential Eight page includes decorative connector lines and progress tracking.【F:essential.html†L20-L120】
- Game page explains how each vault digit is obtained.【F:game.html†L157-L165】
- Password puzzle embeds a local strength tester with improved heuristics.【F:password.html†L61-L140】【F:tools/password-strength.html†L1-L210】
- Each challenge screen now opens with a status HUD (points, progress), contextual hints with point costs, resource links, and forward/back navigation to the next puzzle.【F:phishing.html†L59-L196】【F:password.html†L60-L186】【F:encryption.html†L60-L184】【F:essential.html†L60-L214】【F:binary.html†L60-L228】
- Mission Hub consolidates puzzle links, current objective, score summary, and progress into a single tracker view with a start button.【F:game.html†L40-L210】
- Admin dashboard includes manual puzzle toggles, live podium controls, and reacts to score/progress changes via storage events.【F:admin.html†L120-L226】【F:js/admin.js†L140-L926】
