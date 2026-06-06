/* ============================================================
   background.js — bg.set(id)
   Crossfades the two layers (far + near) using opacity.
   The actual <img> URLs come from registry.js / bg.register().
   ============================================================ */

(function () {
    "use strict";

    let elFar  = null;
    let elNear = null;
    let currentId = null;

    function init() {
        elFar  = document.querySelector("[data-bg-far]");
        elNear = document.querySelector("[data-bg-near]");
    }

    function applyLayer(el, url) {
        if (!el) return;
        if (!url) {
            el.style.backgroundImage = "";
            return;
        }
        // Crossfade trick: snap fade-out, swap, snap fade-in
        el.classList.add("is-fading-out");
        setTimeout(() => {
            el.style.backgroundImage = `url("${url}")`;
            // force reflow then fade in
            void el.offsetWidth;
            el.classList.remove("is-fading-out");
        }, 280);
    }

    /**
     * Set the active scene by registry id.
     * @param {string} id
     */
    function set(id) {
        if (!id) return;
        if (currentId === id) return;
        const entry = window.bg.get(id);
        if (!entry) {
            console.warn("[bg] unknown id:", id);
            return;
        }
        currentId = id;
        applyLayer(elFar,  entry.far  || null);
        applyLayer(elNear, entry.near || null);
    }

    function clear() {
        currentId = null;
        if (elFar)  elFar.style.backgroundImage  = "";
        if (elNear) elNear.style.backgroundImage = "";
    }

    document.addEventListener("DOMContentLoaded", init);

    // Merge with the registry-exposed object (registry created window.bg first)
    window.bg = Object.assign(window.bg || {}, {
        set:     set,
        current: () => currentId,
        clear:   clear,
    });
})();
