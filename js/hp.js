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

    const STATE = { value: 100, max: 100, hidden: false, listeners: [] };

    function stateBox() { return document.querySelector("[data-state]"); }
    function fillEl()   { return document.querySelector("[data-hp-fill]"); }

    function clamp(v) { return Math.max(0, Math.min(STATE.max, v)); }

    function render() {
        const fill = fillEl();
        const box = stateBox();
        if (box) box.classList.toggle("state--hidden", STATE.hidden);

        if (fill) {
            const pct = (STATE.value / STATE.max) * 100;
            fill.style.width = pct + "%";
            if      (pct <= 15) fill.dataset.mood = "critical";
            else if (pct <= 40) fill.dataset.mood = "low";
            else                delete fill.dataset.mood;
        }

        const pct = (STATE.value / STATE.max) * 100;
        document.documentElement.style.setProperty(
            "--gg-opacity",
            (0.35 + (pct / 100) * 0.65).toFixed(3)
        );
    }

    // Called from main.js after a passage:ready when [data-state] reappears.
    function rehome() { render(); }

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

    function show() { STATE.hidden = false; render(); }
    function hide() {
        STATE.hidden = true;
        render();
    }
    function toggle(v) {
        if (v === undefined) STATE.hidden = !STATE.hidden;
        else STATE.hidden = !v;
        render();
    }

    function onZero(fn) { if (typeof fn === "function") STATE.listeners.push(fn); }
    function emitZero() {
        STATE.listeners.slice().forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    }

    window.hp = Object.assign(window.hp || {}, {
        set, add, remove, reset, show, hide, toggle, onZero,
        rehome,
        value: () => STATE.value,
        max:   () => STATE.max,
        init() {
            return { value: STATE.value, max: STATE.max, hidden: STATE.hidden };
        },
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
