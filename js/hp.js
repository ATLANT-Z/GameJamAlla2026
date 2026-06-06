/* ============================================================
   hp.js — "thread to the body" (a.k.a. curse strength)
       hp.show() / hp.hide() / hp.toggle()
       hp.set(value)              // 0..100
       hp.add(p) / hp.remove(p)
       hp.reset(max?)
       hp.onZero(fn)

   drops.fill(idx) / drops.reset()
   ============================================================ */

(function () {
    "use strict";

    const STATE = { value: 100, max: 100, listeners: [] };

    let stateBox = null;   // .state container (hides whole row)
    let fillEl   = null;

    function init() {
        stateBox = document.querySelector("[data-state]");
        fillEl   = document.querySelector("[data-hp-fill]");
        render();
    }

    function clamp(v) { return Math.max(0, Math.min(STATE.max, v)); }

    function render() {
        if (!fillEl) return;
        const pct = (STATE.value / STATE.max) * 100;
        fillEl.style.width = pct + "%";

        if      (pct <= 15) fillEl.dataset.mood = "critical";
        else if (pct <= 40) fillEl.dataset.mood = "low";
        else                delete fillEl.dataset.mood;

        document.documentElement.style.setProperty(
            "--gg-opacity",
            (0.35 + (pct / 100) * 0.65).toFixed(3)
        );
    }

    function set(v) {
        const prev = STATE.value;
        STATE.value = clamp(v);
        render();
        if (STATE.value === 0 && prev !== 0) emitZero();
    }
    function add(p)    { set(STATE.value + p); }
    function remove(p) { set(STATE.value - p); }
    function reset(max) {
        if (typeof max === "number") STATE.max = max;
        STATE.value = STATE.max;
        render();
    }

    function show() { stateBox && stateBox.classList.remove("state--hidden"); }
    function hide() { stateBox && stateBox.classList.add("state--hidden"); }
    function toggle(v) {
        if (!stateBox) return;
        if (v === undefined) stateBox.classList.toggle("state--hidden");
        else if (v) show();
        else hide();
    }

    function onZero(fn) { if (typeof fn === "function") STATE.listeners.push(fn); }
    function emitZero() {
        STATE.listeners.slice().forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    }

    document.addEventListener("DOMContentLoaded", init);

    window.hp = Object.assign(window.hp || {}, {
        set, add, remove, reset, show, hide, toggle, onZero,
        value: () => STATE.value,
        max:   () => STATE.max,
    });

    /* ---------- drops ---------- */
    function dropFill(idx) {
        const el = document.querySelector(`[data-drop-index="${idx}"]`);
        if (el) el.classList.add("is-filled");
    }
    function dropReset() {
        document.querySelectorAll("[data-drop-index]").forEach((el) =>
            el.classList.remove("is-filled"));
    }
    window.drops = Object.assign(window.drops || {}, {
        fill:  dropFill,
        reset: dropReset,
    });
})();
