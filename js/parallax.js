/* ============================================================
   parallax.js — mouse-driven layered parallax (CSS-var only)
   We never touch element.style.transform: instead we publish two
   custom properties (--px, --py) and let each block compose them
   with its own layout transforms via CSS.

   Each element opts in with:  data-parallax="<depth-in-px>"
   ============================================================ */

(function () {
    "use strict";

    const target  = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let elements  = [];

    function collect() {
        elements = Array.from(document.querySelectorAll("[data-parallax]")).map((el) => ({
            el,
            depth: parseFloat(el.dataset.parallax) || 0,
        }));
    }

    function onMouseMove(ev) {
        const cx = window.innerWidth  / 2;
        const cy = window.innerHeight / 2;
        target.x = (ev.clientX - cx) / cx; // -1..1
        target.y = (ev.clientY - cy) / cy;
    }

    function onOrient(ev) {
        if (ev.gamma == null || ev.beta == null) return;
        target.x = Math.max(-1, Math.min(1, (ev.gamma || 0) / 30));
        target.y = Math.max(-1, Math.min(1, (ev.beta  || 0) / 30));
    }

    function tick() {
        current.x += (target.x - current.x) * 0.08;
        current.y += (target.y - current.y) * 0.08;

        for (let i = 0; i < elements.length; i++) {
            const { el, depth } = elements[i];
            // Read the *current* depth attribute — sprites.js may rewrite
            // this for NPCs as they shuffle their stack position.
            const d = parseFloat(el.dataset.parallax);
            const eff = Number.isFinite(d) ? d : depth;
            el.style.setProperty("--px", (-current.x * eff).toFixed(2) + "px");
            el.style.setProperty("--py", (-current.y * eff).toFixed(2) + "px");
        }

        requestAnimationFrame(tick);
    }

    function init() {
        collect();
        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("deviceorientation", onOrient);

        // Pick up new sprites/NPCs that mount later
        const observer = new MutationObserver((muts) => {
            let dirty = false;
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType === 1) {
                        if ((n.hasAttribute && n.hasAttribute("data-parallax"))
                            || (n.querySelector && n.querySelector("[data-parallax]"))) {
                            dirty = true; break;
                        }
                    }
                }
                if (dirty) break;
            }
            if (dirty) collect();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        requestAnimationFrame(tick);
    }

    window.parallax = Object.assign(window.parallax || {}, {
        refresh: collect,
        init,
    });
})();
