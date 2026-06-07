/* ============================================================
   hp.js — "thread to the body" (a.k.a. curse strength)
       hp.show() / hp.hide() / hp.toggle()
       hp.set(value)              // 0..100
       hp.add(p) / hp.remove(p)
       hp.reset(max?)
       hp.onZero(fn)

   drops.fill(idx) / drops.reset()
   drops.show() / drops.hide() / drops.toggle()  — НЕЗАВИСИМО от hp.
       Логика:
         hp.hide()    → прячется весь блок (hp + капли).
         drops.hide() → только капли. hp остаётся.
   ============================================================ */

(function () {
    "use strict";

    const STATE = { value: 100, max: 100, hidden: false, dropsHidden: false, listeners: [] };

    function stateBox() { return document.querySelector("[data-state]"); }
    function fillEl()   { return document.querySelector("[data-hp-fill]"); }
    function dropsEl()  { return document.querySelector("[data-drops]"); }

    function clamp(v) { return Math.max(0, Math.min(STATE.max, v)); }

    function render() {
        const fill = fillEl();
        const box = stateBox();
        const drops = dropsEl();
        if (box)   box.classList.toggle("state--hidden", STATE.hidden);
        if (drops) drops.classList.toggle("drops--hidden", STATE.dropsHidden);

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

    /* ---------- drops ----------
       Видимость капель — НЕЗАВИСИМАЯ от hp. Это значит:
         hp.hide()    прячет весь блок state (и hp, и капли).
         drops.hide() прячет ТОЛЬКО капли, hp остаётся видимым.
       Поэтому флаг живёт в общем STATE, а render() ставит
       .drops--hidden на [data-drops] поверх state--hidden от hp. */
    // Имена капель в порядке их индексов в HTML ([data-drop-index="0|1|2"]).
    // Используются в API и условных секциях: drops.knight, drops.maid и т.д.
    // Можно переопределить через drops.configure({ names: [...] }).
    let DROP_NAMES = ["knight", "maid", "cat"];
    // Set заполненных ИНДЕКСОВ (а не имён) — чтобы переименование не
    // ломало уже накопленный прогресс.
    const DROPS_FILLED = new Set();

    function resolveDropIndex(key) {
        if (typeof key === "number" && key >= 0) return key;
        if (typeof key === "string") {
            if (/^\d+$/.test(key)) return parseInt(key, 10);
            const idx = DROP_NAMES.indexOf(key);
            if (idx !== -1) return idx;
            console.warn("[drops] неизвестное имя капли:", key,
                "— ожидаемые:", DROP_NAMES.join(", "));
            return null;
        }
        return null;
    }

    function dropFill(key) {
        const idx = resolveDropIndex(key);
        if (idx == null) return;
        DROPS_FILLED.add(idx);
        const el = document.querySelector(`[data-drop-index="${idx}"]`);
        if (el) el.classList.add("is-filled");
    }
    function dropReset() {
        DROPS_FILLED.clear();
        document.querySelectorAll("[data-drop-index]").forEach((el) =>
            el.classList.remove("is-filled"));
    }
    function dropsHas(key) {
        const idx = resolveDropIndex(key);
        return idx != null && DROPS_FILLED.has(idx);
    }
    function dropsCount() { return DROPS_FILLED.size; }

    // Плоский снимок для условных <section data-if="...">.
    // Возвращает { count, knight, maid, cat, ... } — булевы флаги.
    function dropsSnapshot() {
        const out = { count: DROPS_FILLED.size };
        DROP_NAMES.forEach((name, idx) => {
            if (name) out[name] = DROPS_FILLED.has(idx);
        });
        return out;
    }

    function dropsConfigure(opts) {
        if (opts && Array.isArray(opts.names)) DROP_NAMES = opts.names.slice();
    }

    function dropsShow() { STATE.dropsHidden = false; render(); }
    function dropsHide() { STATE.dropsHidden = true;  render(); }
    function dropsToggle(v) {
        if (v === undefined) STATE.dropsHidden = !STATE.dropsHidden;
        else STATE.dropsHidden = !v;
        render();
    }
    window.drops = Object.assign(window.drops || {}, {
        fill:      dropFill,
        reset:     dropReset,
        has:       dropsHas,
        count:     dropsCount,
        snapshot:  dropsSnapshot,
        configure: dropsConfigure,
        show:      dropsShow,
        hide:      dropsHide,
        toggle:    dropsToggle,
        hidden:    () => STATE.dropsHidden,
    });
})();
