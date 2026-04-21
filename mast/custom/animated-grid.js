/**
 * Grid Overlay — MAST-compatible JS
 *
 * Column overlay that can be toggled on/off as a layout reference. Columns
 * slide in from below and exit upward, staggered from the center outward.
 * The open/closed state is persisted between sessions.
 *
 * Data attributes consumed:
 *   [data-grid-overlay]                       — Root element (required)
 *   [data-grid-overlay-column]                — Column, repeatable (required)
 *   [data-grid-overlay-toggle]                — Trigger element, repeatable (optional)
 *   [data-grid-overlay-shortcut="g"]          — Shortcut letter used with Shift (default "g")
 *   [data-grid-overlay-start-open="true"]     — Default to open when no stored state
 *   [data-grid-overlay-persist="false"]       — Disable localStorage persistence
 *
 * Dependencies: GSAP (optional — the script falls back to CSS transitions)
 */
(function () {
  "use strict";

  const root = document.querySelector("[data-grid-overlay]");
  if (!root) {
    return;
  }

  const DURATION = 1;
  const STAGGER = 0.03;
  const EASE_CSS = "cubic-bezier(.165, .84, .44, 1)";
  const EASE_GSAP = "power4.out";
  const STORAGE_KEY = "grid-overlay-state";

  function init() {
    const columns = Array.from(root.querySelectorAll("[data-grid-overlay-column]"));
    if (!columns.length) {
      return;
    }

    const toggles = Array.from(document.querySelectorAll("[data-grid-overlay-toggle]"));

    const persistEnabled = root.getAttribute("data-grid-overlay-persist") !== "false";
    const shortcutAttr = root.getAttribute("data-grid-overlay-shortcut");
    const shortcutKey = shortcutAttr && shortcutAttr.length === 1
      ? shortcutAttr.toLowerCase()
      : "g";

    // Stagger delays — computed once from the center outward so closures below
    // don't redo the math on every toggle.
    const staggerDelays = buildCenterOutDelays(columns.length, STAGGER);

    // Reduced motion — read once, update live
    let reducedMotion = false;
    try {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      reducedMotion = mql.matches;
      mql.addEventListener("change", (ev) => {
        reducedMotion = ev.matches;
      });
    } catch (e) {
      reducedMotion = false;
    }

    const hasGSAP = typeof gsap !== "undefined";

    // Initial state resolution
    let opened = resolveInitialState();
    paint(opened ? 0 : 100, /* animated */ false);
    root.setAttribute("aria-hidden", opened ? "false" : "true");
    syncToggles();

    // Wire up interactions
    toggles.forEach((toggle) => {
      toggle.addEventListener("click", onToggleClick);
    });
    document.addEventListener("keydown", onKeydown);

    // ——— State ——————————————————————————————————————————————

    function resolveInitialState() {
      if (persistEnabled) {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored === "open") return true;
          if (stored === "closed") return false;
        } catch (e) {
          // Storage blocked — fall through to the default flag
        }
      }
      return root.getAttribute("data-grid-overlay-start-open") === "true";
    }

    function saveState() {
      if (!persistEnabled) return;
      try {
        localStorage.setItem(STORAGE_KEY, opened ? "open" : "closed");
      } catch (e) {
        // Storage blocked — current session still behaves correctly
      }
    }

    function syncToggles() {
      const label = opened ? "Hide layout grid" : "Show layout grid";
      toggles.forEach((toggle) => {
        toggle.setAttribute("aria-pressed", opened ? "true" : "false");
        toggle.setAttribute("aria-label", label);
      });
    }

    // ——— Painting / animation —————————————————————————————————

    // Place columns at a given yPercent. When `animated` is true, columns
    // transition from their current position to the target; when false, the
    // position is set instantly. `fromPercent` is only relevant for the
    // animated path because GSAP / CSS transitions need a known start.
    function paint(toPercent, animated, fromPercent) {
      if (!animated || reducedMotion) {
        if (hasGSAP) {
          gsap.set(root, { display: "block" });
          gsap.set(columns, { yPercent: toPercent });
        } else {
          root.style.display = "block";
          columns.forEach((col) => {
            col.style.transition = "";
            col.style.willChange = "";
            col.style.transform = `translateY(${toPercent}%)`;
          });
        }
        return;
      }

      if (hasGSAP) {
        gsap.set(root, { display: "block" });
        gsap.fromTo(
          columns,
          { yPercent: fromPercent },
          {
            yPercent: toPercent,
            duration: DURATION,
            ease: EASE_GSAP,
            stagger: { each: STAGGER, from: "center" },
            overwrite: true,
          }
        );
        return;
      }

      // CSS fallback — mirror the GSAP behavior as closely as possible.
      root.style.display = "block";
      columns.forEach((col, i) => {
        // Prime the starting position without a transition
        col.style.transition = "none";
        col.style.willChange = "transform";
        col.style.transform = `translateY(${fromPercent}%)`;
      });

      // Commit the starting position before we arm the transition
      void root.offsetHeight;

      columns.forEach((col, i) => {
        col.style.transition = `transform ${DURATION}s ${EASE_CSS} ${staggerDelays[i]}s`;
        col.style.transform = `translateY(${toPercent}%)`;
      });

      // Clear will-change after the longest animation completes
      const maxDelay = Math.max.apply(null, staggerDelays);
      const totalMs = (DURATION + maxDelay) * 1000 + 50;
      setTimeout(() => {
        columns.forEach((col) => {
          col.style.willChange = "";
        });
      }, totalMs);
    }

    function setOpened(next) {
      if (opened === next) return;
      opened = next;

      const from = next ? 100 : 0;
      const to = next ? 0 : -100;

      saveState();
      root.setAttribute("aria-hidden", next ? "false" : "true");
      syncToggles();
      paint(to, true, from);
    }

    // ——— Event handlers ——————————————————————————————————————

    function onToggleClick(ev) {
      ev.preventDefault();
      setOpened(!opened);
    }

    function onKeydown(ev) {
      if (!ev.shiftKey) return;
      if (isTypingContext(ev.target)) return;
      if ((ev.key || "").toLowerCase() !== shortcutKey) return;

      ev.preventDefault();
      setOpened(!opened);
    }
  }

  // ——— Pure helpers ————————————————————————————————————————

  // Build per-index delays so the middle column(s) start first and the edges
  // start last. Matches GSAP's `stagger.from: "center"`.
  function buildCenterOutDelays(count, each) {
    const mid = (count - 1) / 2;
    const delays = new Array(count);
    for (let i = 0; i < count; i++) {
      delays[i] = Math.abs(i - mid) * each;
    }
    return delays;
  }

  function isTypingContext(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return !!el.isContentEditable;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();