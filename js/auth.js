/* js/auth.js
   Login that works both from a local file:// open (no server)
   and from http(s). It verifies passwords using PBKDF2 (salt+iterations),
   supports per-user lockouts, and stores a minimal session in localStorage.
*/

(() => {
    const form = document.getElementById('loginForm');
    const userEl = document.getElementById('username');
    const passEl = document.getElementById('password');
    const msgEl = document.getElementById('errorMsg');

    // --- Config ---
    const MAX_ATTEMPTS = 5;
    const LOCK_MINUTES = 10;
    const DEBOUNCE_MS = 400;

    // Simple debounce to avoid double-submit
    let lastSubmit = 0;

    // Embedded fallback (used when fetch to data/teams.json fails on file://)
    const EMBEDDED_USERS = {
        "users": [
            { "username": "admin", "role": "admin", "iterations": 200000, "salt_b64": "UuZKHcI4TqrDqStZvEkjdA==", "hash_b64": "U1QaarmfJfqHfk/kvmhLLxZJvlbscctGyM9QLgFA12o=" },
            { "username": "team1", "role": "team", "iterations": 200000, "salt_b64": "UWIlOXsObRzvhkTrvj2Nqw==", "hash_b64": "CT13ifLJbV1Sf9ctryT5NUuJiVzM5S5WLPbq+z2Go8w=" },
            { "username": "team2", "role": "team", "iterations": 200000, "salt_b64": "4/+zrwH8H52SynqMX41TPQ==", "hash_b64": "0gH9FlCNmkcSDRdC9fUh4TGRdASH0Q8TwumqBm7pmAk=" },
            { "username": "team3", "role": "team", "iterations": 200000, "salt_b64": "8nN2UppGeyz/vpyb/UbaRg==", "hash_b64": "AQT1B+0zk9X+joOaw+d6eIAmZ46UFJP8wGx6GSA92oQ=" },
            { "username": "team4", "role": "team", "iterations": 200000, "salt_b64": "kv9/9vWxAfHLkiL3qy2N7w==", "hash_b64": "GL7j9QOqDsz7HXMg2j1t4ztw/lVjrfsc8ZPxQh2fP6I=" },
            { "username": "team5", "role": "team", "iterations": 200000, "salt_b64": "e7DCP2u6dKHw2AH+o9TEFQ==", "hash_b64": "eDWEv0yo7VLrO/BQdIwsaeFJ6h0wTsMEVC7wUPqiuJo=" }
        ]
    };

    // Utility: base64 ↔ bytes
    const b64ToBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bytesToB64 = (buf) => {
        const u8 = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return btoa(s);
    };

    async function pbkdf2Hash(password, saltBytes, iterations) {
        const enc = new TextEncoder().encode(password);
        const key = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
            key,
            256
        );
        return new Uint8Array(bits); // 32 bytes
    }

    function sanitizeUsername(v) {
        // Allow letters, numbers, underscore, hyphen; trim spaces
        return (v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    }

    // Per-user lock state in localStorage
    function getLock(username) {
        try {
            return JSON.parse(localStorage.getItem(`lock:${username}`)) || { attempts: 0, until: 0 };
        } catch { return { attempts: 0, until: 0 }; }
    }
    function setLock(username, obj) {
        try { localStorage.setItem(`lock:${username}`, JSON.stringify(obj)); } catch { }
    }
    function clearLock(username) {
        try { localStorage.removeItem(`lock:${username}`); } catch { }
    }

    function showMsg(text, type = 'error') {
        if (!msgEl) return;
        msgEl.textContent = text || '';
        msgEl.className = type === 'error' ? 'error' : (type === 'ok' ? 'ok' : '');
    }

    async function loadCreds() {
        // Try network first
        try {
            const res = await fetch('data/teams.json?ts=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            return json;
        } catch (e) {
            // Fallback when opened via file:// (CORS) or no server
            return EMBEDDED_USERS;
        }
    }

    async function verify(username, password) {
        const data = await loadCreds();
        const users = Array.isArray(data?.users) ? data.users : [];
        const rec = users.find(u => u.username === username);
        if (!rec) return false;

        const salt = b64ToBytes(rec.salt_b64);
        const iter = Number(rec.iterations) || 200000;
        const calc = await pbkdf2Hash(password, salt, iter);
        const calcB64 = bytesToB64(calc);
        return calcB64 === rec.hash_b64;
    }

    async function handleLogin(e) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastSubmit < DEBOUNCE_MS) return;
        lastSubmit = now;

        const username = sanitizeUsername(userEl.value);
        const password = passEl.value || '';

        if (!username || !password) {
            showMsg('Please enter both username and password.');
            return;
        }

        // Lockout check
        const lock = getLock(username);
        if (lock.until && now < lock.until) {
            const secs = Math.ceil((lock.until - now) / 1000);
            showMsg(`Too many attempts. Try again in ${secs}s.`);
            return;
        }

        showMsg(''); // clear
        try {
            const ok = await verify(username, password);
            if (!ok) {
                const attempts = (lock.attempts || 0) + 1;
                if (attempts >= MAX_ATTEMPTS) {
                    setLock(username, { attempts, until: now + LOCK_MINUTES * 60 * 1000 });
                    showMsg(`Locked after ${MAX_ATTEMPTS} attempts. Try again in ${LOCK_MINUTES} minutes.`);
                } else {
                    setLock(username, { attempts, until: 0 });
                    showMsg(`Invalid credentials. Attempts: ${attempts}/${MAX_ATTEMPTS}.`);
                }
                return;
            }

            // Success
            clearLock(username);

            // Load role (from same source we verified against)
            const roster = await loadCreds();
            const rec = roster.users.find(u => u.username === username);
            const role = rec?.role === 'admin' ? 'admin' : 'team';

            // Minimal session
            try {
                localStorage.setItem('user', JSON.stringify({ username, role, t: Date.now() }));
            } catch { }

            // Redirect
            window.location.href = role === 'admin' ? 'admin.html' : 'game.html';
        } catch (err) {
            console.error('[auth] unexpected error:', err);
            showMsg('Unable to verify credentials right now.');
        }
    }

    function handleClear() {
        showMsg('');
        form?.reset();
        userEl?.focus();
    }

    // Wire up
    if (form) {
        form.addEventListener('submit', handleLogin);
        const clearBtn = form.querySelector('[data-action="clear"]');
        if (clearBtn) clearBtn.addEventListener('click', (e) => { e.preventDefault(); handleClear(); });
    }

    // Optional: clear any old demo sessions on load (comment out if you prefer)
    // try { localStorage.removeItem('user'); } catch {}

})();
