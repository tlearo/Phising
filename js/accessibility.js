// accessibility.js
// - Focus ring toggle: show outlines only when navigating by keyboard (Tab)
// - Skip-link support: jump to main content and move focus there

(function () {
    const TAB_CLASS = "user-is-tabbing";

    // Show focus rings when user presses Tab (or Shift+Tab)
    function handleFirstTab(e) {
        if (e.key === "Tab") {
            document.body.classList.add(TAB_CLASS);
        }
    }

    // Hide focus rings again when using mouse / touch / pointer
    function handlePointerIntent() {
        document.body.classList.remove(TAB_CLASS);
    }

    document.addEventListener("keydown", handleFirstTab, { passive: true });
    document.addEventListener("mousedown", handlePointerIntent, { passive: true });
    document.addEventListener("pointerdown", handlePointerIntent, { passive: true });
    document.addEventListener("touchstart", handlePointerIntent, { passive: true });

    // --- Skip-to-content behavior ---
    // Works with links like: <a class="skip-link" href="#main">Skip to content</a>
    function focusSectionById(id) {
        if (!id) return;
        const target =
            document.getElementById(id) ||
            document.querySelector(`#${CSS.escape(id)}`) ||
            document.querySelector("main, [role='main']");
        if (!target) return;

        // Ensure focusable, then focus and scroll
        const prevTabIndex = target.getAttribute("tabindex");
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: "smooth", block: "start" });

        // Clean up tabindex if it wasn't there before
        if (prevTabIndex === null) {
            target.addEventListener(
                "blur",
                () => target.removeAttribute("tabindex"),
                { once: true }
            );
        }
    }

    // Click handler for any .skip-link
    document.addEventListener("click", (e) => {
        const a = e.target.closest("a.skip-link");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (!href.startsWith("#")) return;
        e.preventDefault();
        focusSectionById(href.slice(1));
    });

    // Allow activating skip link via keyboard without scrolling the page first
    document.addEventListener("keydown", (e) => {
        const a = document.activeElement;
        if (!a || !a.classList || !a.classList.contains("skip-link")) return;
        if (e.key === "Enter" || e.key === " ") {
            const href = a.getAttribute("href") || "";
            if (href.startsWith("#")) {
                e.preventDefault();
                focusSectionById(href.slice(1));
            }
        }
    });

    // If the page loads with a hash, respect it for focus as well
    window.addEventListener("load", () => {
        if (location.hash && location.hash.length > 1) {
            focusSectionById(location.hash.slice(1));
        }
    });
})();
