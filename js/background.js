/* ============================================================
   background.js — bg.set(id)
   Crossfades the two layers (far + near) using opacity.
   The actual <img> URLs come from registry.js / bg.register().

   DOM-aware: passages can mount/unmount [data-bg-far|near]
   (e.g. menu passage has no headers). We:
     • re-query every set()
     • remember current id and re-apply when layers reappear
       (called from main.js on passage:ready).
   ============================================================ */

(function () {
    "use strict";

    let currentId = null;

    function farEl()  { return document.querySelector("[data-bg-far]"); }
    function nearEl() { return document.querySelector("[data-bg-near]"); }

    function applyLayer(el, url) {
        if (!el) return;
        if (!url) {
            el.style.backgroundImage = "";
            return;
        }
        el.classList.add("is-fading-out");
        setTimeout(() => {
            el.style.backgroundImage = `url("${url}")`;
            void el.offsetWidth;
            el.classList.remove("is-fading-out");
        }, 280);
        console.log("bg", url);
    }

    function paint(entry) {
        if (!entry) return;
        applyLayer(farEl(),  entry.far  || null);
        applyLayer(nearEl(), entry.near || null);
    }

    /**
     * Set the active scene by registry id.
     * @param {string} id
     */
    function set(id) {
        if (!id) return;
        const entry = window.bg.get(id);
        if (!entry) {
            console.warn("[bg] unknown id:", id);
            return;
        }
        currentId = id;
        paint(entry);
    }

    function clear() {
        currentId = null;
        const f = farEl(), n = nearEl();
        if (f) f.style.backgroundImage = "";
        if (n) n.style.backgroundImage = "";
    }

    // Re-apply current bg when the layers reappear after a header-less passage.
    function rehome() {
        if (!currentId) return;
        const entry = window.bg.get(currentId);
        if (entry) paint(entry);
    }

    // Merge with the registry-exposed object (registry created window.bg first)
    window.bg = Object.assign(window.bg || {}, {
        set:     set,
        current: () => currentId,
        clear:   clear,
        rehome:  rehome,
        init() {
            if (!farEl() || !nearEl()) {
                console.warn("[bg.init] DOM-слои [data-bg-far]/[data-bg-near] не найдены — они появятся когда смонтируется шапка.");
            }
            return { current: currentId };
        },
    });
})();
