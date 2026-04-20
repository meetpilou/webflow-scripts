/**
 * Animated Grid Overlay — MAST-compatible JS
 *
 * Toggleable column overlay used as a layout/debug grid. Columns slide up from
 * below when opened and slide out above when closed, with a staggered motion.
 * State persists across reloads via localStorage.
 *
 * Data attributes consumed:
 *   [data-animated-grid]                 — Root overlay element (required)
 *   [data-animated-grid-col]             — Individual column element (required, repeatable)
 *   [data-animated-grid-toggle]          — Button/element that toggles the overlay (optional, repeatable)
 *   [data-animated-grid-shortcut="g"]    — Keyboard shortcut letter, used with Shift (optional, default "g")
 *   [data-animated-grid-start-open="true"] — Force the grid open on first load (optional)
 *
 * Dependencies: GSAP (optional — falls back to CSS transitions when absent)
 */

(function () {
  "use strict";

  // Early exit if the overlay is not on the page
  const grid = document.querySelector("[data-animated-grid]");
  if (!grid) {
    return;
  }

  const STORAGE_KEY = "animated-grid-state";

  function initAnimatedGrid() {
    const cols = grid.querySelectorAll("[data-animated-grid-col]");
    const toggles = document.querySelectorAll("[data-animated-grid-toggle]");

    if (!cols.length) {
      return;
    }

    // Reduced motion preference
    let prefersReducedMotion = false;
    try {
      const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      prefersReducedMotion = reducedMotionQuery.matches;
      reducedMotionQuery.addEventListener("change", (e) => {
        prefersReducedMotion = e.matches;
      });
    } catch (e) {
      prefersReducedMotion = false;
    }

    // Resolve initial state: stored value wins, otherwise fall back to the
    // data-animated-grid-start-open flag, otherwise closed.
    const startOpen = grid.getAttribute("data-animated-grid-start-open") === "true";
    let isOpen = startOpen;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "open") {
        isOpen = true;
      } else if (stored === "closed") {
        isOpen = false;
      }
    } catch (e) {
      // localStorage unavailable (privacy mode, quota) — fall back to start attr
    }

    // Resolve keyboard shortcut letter
    const shortcutAttr = grid.getAttribute("data-animated-grid-shortcut");
    const shortcutKey = (shortcutAttr && shortcutAttr.length === 1)
      ? shortcutAttr.toLowerCase()
      : "g";

    // Apply initial position without animation
    if (typeof gsap !== "undefined") {
      gsap.set(grid, { display: "block" });
      gsap.set(cols, { yPercent: isOpen ? 0 : 100 });
    } else {
      grid.style.display = "block";
      cols.forEach((col) => {
        col.style.transform = `translateY(${isOpen ? 0 : 100}%)`;
      });
    }

    // Apply initial ARIA state
    grid.setAttribute("aria-hidden", isOpen ? "false" : "true");
    updateTogglesState();

    function persistState() {
      try {
        localStorage.setItem(STORAGE_KEY, isOpen ? "open" : "closed");
      } catch (e) {
        // Silently ignore — overlay still works for the current session
      }
    }

    function updateTogglesState() {
      toggles.forEach((toggle) => {
        toggle.setAttribute("aria-pressed", isOpen ? "true" : "false");
        toggle.setAttribute(
          "aria-label",
          isOpen ? "Hide layout grid" : "Show layout grid"
        );
      });
    }

    function openGrid() {
      isOpen = true;
      persistState();
      grid.setAttribute("aria-hidden", "false");
      updateTogglesState();

      if (prefersReducedMotion) {
        if (typeof gsap !== "undefined") {
          gsap.set(cols, { yPercent: 0 });
        } else {
          cols.forEach((col) => {
            col.style.transition = "";
            col.style.transform = "translateY(0%)";
          });
        }
        return;
      }

      if (typeof gsap !== "undefined") {
        gsap.fromTo(
          cols,
          { yPercent: 100 },
          {
            yPercent: 0,
            duration: 1,
            ease: "expo.inOut",
            stagger: { each: 0.03, from: "start" },
            overwrite: true,
          }
        );
      } else {
        cols.forEach((col, i) => {
          col.style.transition = "none";
          col.style.transform = "translateY(100%)";
          // Force reflow so the starting position is committed
          void col.offsetHeight;
          col.style.transition = `transform 1s cubic-bezier(0.87, 0, 0.13, 1) ${i * 0.03}s`;
          col.style.transform = "translateY(0%)";
        });
      }
    }

    function closeGrid() {
      isOpen = false;
      persistState();
      grid.setAttribute("aria-hidden", "true");
      updateTogglesState();

      if (prefersReducedMotion) {
        if (typeof gsap !== "undefined") {
          gsap.set(cols, { yPercent: -100 });
        } else {
          cols.forEach((col) => {
            col.style.transition = "";
            col.style.transform = "translateY(-100%)";
          });
        }
        return;
      }

      if (typeof gsap !== "undefined") {
        gsap.fromTo(
          cols,
          { yPercent: 0 },
          {
            yPercent: -100,
            duration: 1,
            ease: "expo.inOut",
            stagger: { each: 0.03, from: "start" },
            overwrite: true,
          }
        );
      } else {
        cols.forEach((col, i) => {
          col.style.transition = `transform 1s cubic-bezier(0.87, 0, 0.13, 1) ${i * 0.03}s`;
          col.style.transform = "translateY(-100%)";
        });
      }
    }

    function toggleGrid() {
      if (isOpen) {
        closeGrid();
      } else {
        openGrid();
      }
    }

    function isTypingContext(e) {
      const el = e.target;
      if (!el) {
        return false;
      }
      const tag = (el.tagName || "").toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
      );
    }

    // Wire up toggle buttons
    toggles.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleGrid();
      });
    });

    // Wire up keyboard shortcut (Shift + configured letter)
    window.addEventListener("keydown", (e) => {
      if (isTypingContext(e)) {
        return;
      }
      if (!e.shiftKey) {
        return;
      }
      if ((e.key || "").toLowerCase() !== shortcutKey) {
        return;
      }
      e.preventDefault();
      toggleGrid();
    });
  }

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAnimatedGrid);
  } else {
    initAnimatedGrid();
  }
})();