/* ============================================================
   mini.js — Reigns-style card mini-game

   Usage from a Twine passage:

     mini.config({
         bars: [
             { id: "hp",          icon: "❤", label: "связь",   value: 100 },
             { id: "trust",       icon: "✦", label: "доверие", value: 60  },
             { id: "companion",   icon: "✚", label: "друг",    value: 80  },
             { id: "aggression",  icon: "✸", label: "духи",    value: 30  },
         ],
         cards: [
             {
                 id: "wolf_trap",
                 art: "🐺",                  // emoji OR url
                 text: "Дух волка попал в капкан…",
                 left:  { label: "Освободить", delta: { hp:-15, trust:+10 }, reaction: "…" },
                 right: { label: "Оставить",   delta: {           trust:-5 }, reaction: "…" },
                 when:  (s) => s.hp >= 30,
             },
         ],
         onComplete: () => { },
         onBarZero:  (barId) => { },
     });

     mini.start();
     mini.stop();
   ============================================================ */

(function () {
    "use strict";

    const STATE = {
        running: false,
        bars: [],
        deck: [],
        currentCard: null,
        currentSide: null,
        config: null,

        // Drag bookkeeping
        dragging: false,
        startX: 0,
        startY: 0,
        dx: 0,
        dy: 0,
    };

    let root = null,
        barsEl = null,
        cardEl = null,
        artEl = null,
        textEl = null,
        leftEl = null,
        rightEl = null,
        reactionEl = null;

    let listenersBound = false;

    function init() {
        root       = document.querySelector("[data-mini]");
        barsEl     = document.querySelector("[data-mini-bars]");
        cardEl     = document.querySelector("[data-mini-card]");
        artEl      = document.querySelector("[data-mini-card-art]");
        textEl     = document.querySelector("[data-mini-card-text]");
        leftEl     = document.querySelector('[data-mini-side="left"]');
        rightEl    = document.querySelector('[data-mini-side="right"]');
        reactionEl = document.querySelector("[data-mini-reaction]");

        bindCardListeners();
    }

    /* ============================================================
       CONFIG / LIFECYCLE
       ============================================================ */
    function config(cfg) {
        STATE.config = cfg;
        STATE.bars = (cfg.bars || []).map((b) => ({
            id: b.id, icon: b.icon || "✦", label: b.label || b.id,
            value: clamp(b.value ?? 100, 0, 100),
            min: 0, max: 100,
        }));
        STATE.deck = (cfg.cards || []).slice();
    }

    function start() {
        if (!STATE.config) {
            console.warn("[mini.start] no config. Call mini.config() first.");
            return;
        }
        STATE.running = true;
        renderBars();
        if (root) root.classList.remove("mini--hidden");
        dealNext();
    }

    function stop() {
        STATE.running = false;
        if (root) root.classList.add("mini--hidden");
        STATE.currentCard = null;
        STATE.currentSide = null;
        STATE.dragging = false;
        clearBarHints();
        if (leftEl)  leftEl.classList.remove("is-active");
        if (rightEl) rightEl.classList.remove("is-active");
    }

    /* ============================================================
       BARS
       ============================================================ */
    function renderBars() {
        if (!barsEl) return;
        barsEl.innerHTML = "";
        STATE.bars.forEach((b) => {
            const wrap = document.createElement("div");
            wrap.className = "stat";
            wrap.dataset.barId = b.id;
            wrap.innerHTML = `
                <div class="stat__arrow"></div>
                <div class="stat__icon">${b.icon}</div>
                <div class="stat__bar"><div class="stat__fill"></div></div>
                <div class="stat__label">${b.label}</div>
            `;
            barsEl.appendChild(wrap);
            updateBarVisual(b.id);
        });
    }

    function updateBarVisual(id) {
        const b = STATE.bars.find((x) => x.id === id);
        if (!b || !barsEl) return;
        const el = barsEl.querySelector(`[data-bar-id="${id}"] .stat__fill`);
        if (el) el.style.width = (b.value / b.max * 100) + "%";
        if (id === "hp" && window.hp) window.hp.set(b.value);
    }

    function setBarHints(delta) {
        if (!barsEl) return;
        STATE.bars.forEach((b) => {
            const el = barsEl.querySelector(`[data-bar-id="${b.id}"]`);
            if (!el) return;
            const d = delta && delta[b.id];
            el.classList.remove("is-up", "is-down");
            if (typeof d === "number" && d !== 0) {
                el.classList.add(d > 0 ? "is-up" : "is-down");
            }
        });
    }
    function clearBarHints() {
        if (!barsEl) return;
        barsEl.querySelectorAll(".stat").forEach((el) =>
            el.classList.remove("is-up", "is-down"));
    }

    function applyDelta(delta) {
        if (!delta) return;
        Object.entries(delta).forEach(([id, d]) => {
            const b = STATE.bars.find((x) => x.id === id);
            if (!b) return;
            const prev = b.value;
            b.value = clamp(b.value + d, b.min, b.max);
            updateBarVisual(id);
            if (prev > 0 && b.value === 0 && STATE.config.onBarZero) {
                try { STATE.config.onBarZero(id); } catch (e) { console.error(e); }
            }
        });
    }

    /* ============================================================
       DECK
       ============================================================ */
    function snapshotState() {
        const out = {};
        STATE.bars.forEach((b) => { out[b.id] = b.value; });
        return out;
    }

    function pickNextCard() {
        const s = snapshotState();
        for (let i = 0; i < STATE.deck.length; i++) {
            const c = STATE.deck[i];
            const ok = typeof c.when === "function" ? !!c.when(s) : true;
            if (ok) {
                STATE.deck.splice(i, 1);
                return c;
            }
        }
        return null;
    }

    function dealNext() {
        const card = pickNextCard();
        if (!card) {
            STATE.currentCard = null;
            if (STATE.config && typeof STATE.config.onComplete === "function") {
                STATE.config.onComplete();
            }
            return;
        }
        STATE.currentCard = card;
        mountCard(card);
    }

    /* ============================================================
       CARD MOUNT — snap to entering state without animation, then
       animate to default in next frame.
       ============================================================ */
    function mountCard(card) {
        if (!cardEl) return;

        // 1. SNAP without transitions
        cardEl.style.transition = "none";
        cardEl.classList.remove("is-flying-left", "is-flying-right");
        cardEl.classList.add("is-entering");
        cardEl.style.transform = "";
        cardEl.style.opacity   = "";
        // force reflow so the snap takes effect before we re-enable transitions
        void cardEl.offsetWidth;
        cardEl.style.transition = "";

        // 2. Fill content
        if (artEl) {
            if (card.art && /^(https?:|data:|assets\/|img\/|\/)/.test(card.art)) {
                artEl.style.backgroundImage = `url("${card.art}")`;
                artEl.style.display = "";
                artEl.style.placeItems = "";
                artEl.style.fontSize = "";
                artEl.textContent = "";
            } else {
                artEl.style.backgroundImage = "";
                artEl.style.display = "grid";
                artEl.style.placeItems = "center";
                artEl.style.fontSize = "64px";
                artEl.textContent = card.art || "✦";
            }
        }
        if (textEl) textEl.textContent = card.text || "";

        if (leftEl)  leftEl.textContent  = (card.left  && card.left.label)  || "";
        if (rightEl) rightEl.textContent = (card.right && card.right.label) || "";

        // 3. Drop the entering state — animates to default rest pose
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEl.classList.remove("is-entering");
            });
        });
    }

    /* ============================================================
       DRAG / TILT — bound ONCE, read STATE.currentCard
       ============================================================ */
    function bindCardListeners() {
        if (listenersBound || !cardEl) return;
        listenersBound = true;

        // Idle tilt: only while not dragging and a card is mounted
        cardEl.addEventListener("mousemove", (ev) => {
            if (STATE.dragging) return;
            if (!STATE.currentCard) return;
            if (cardEl.classList.contains("is-entering")) return;
            const rect = cardEl.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top  + rect.height / 2;
            const nx = (ev.clientX - cx) / (rect.width / 2);
            const ny = (ev.clientY - cy) / (rect.height / 2);
            const rx = (-ny * 8).toFixed(2);
            const ry = ( nx * 10).toFixed(2);
            cardEl.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
        });
        cardEl.addEventListener("mouseleave", () => {
            if (STATE.dragging) return;
            cardEl.style.transform = "";
        });

        // Drag start
        const onDown = (ev) => {
            if (!STATE.currentCard) return;
            if (cardEl.classList.contains("is-flying-left") ||
                cardEl.classList.contains("is-flying-right")) return;
            ev.preventDefault();
            const p = pointer(ev);
            STATE.dragging = true;
            STATE.startX = p.x; STATE.startY = p.y;
            STATE.dx = 0; STATE.dy = 0;
            cardEl.classList.add("is-dragging");
        };
        cardEl.addEventListener("mousedown",  onDown);
        cardEl.addEventListener("touchstart", onDown, { passive: false });

        // Drag move + end on the window (so we keep tracking outside the card)
        const onMove = (ev) => {
            if (!STATE.dragging) return;
            ev.preventDefault();
            const p = pointer(ev);
            STATE.dx = p.x - STATE.startX;
            STATE.dy = p.y - STATE.startY;

            const dx = STATE.dx;
            const dy = STATE.dy;
            const rot = (dx / 14).toFixed(2);
            cardEl.style.transform = `translateX(${dx}px) translateY(${dy * 0.2}px) rotate(${rot}deg)`;

            const card = STATE.currentCard;
            const threshold = 30;
            const side = dx >  threshold ? "right"
                       : dx < -threshold ? "left"
                       : null;
            if (side !== STATE.currentSide) {
                STATE.currentSide = side;
                if (leftEl)  leftEl.classList.toggle("is-active",  side === "left");
                if (rightEl) rightEl.classList.toggle("is-active", side === "right");

                if (side === "left"  && card.left)  setBarHints(card.left.delta);
                else if (side === "right" && card.right) setBarHints(card.right.delta);
                else clearBarHints();
            }
        };
        const onUp = () => {
            if (!STATE.dragging) return;
            STATE.dragging = false;
            cardEl.classList.remove("is-dragging");

            const card = STATE.currentCard;
            const COMMIT = 130;
            if (card && STATE.dx >  COMMIT && card.right) commitSwipe(card, "right");
            else if (card && STATE.dx < -COMMIT && card.left) commitSwipe(card, "left");
            else {
                // snap back
                cardEl.style.transform = "";
                if (leftEl)  leftEl.classList.remove("is-active");
                if (rightEl) rightEl.classList.remove("is-active");
                clearBarHints();
                STATE.currentSide = null;
            }
        };
        window.addEventListener("mousemove", onMove, { passive: false });
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("mouseup",   onUp);
        window.addEventListener("touchend",  onUp);
        window.addEventListener("touchcancel", onUp);
    }

    function commitSwipe(card, side) {
        const choice = card[side];
        if (!choice) return;

        cardEl.classList.add(side === "left" ? "is-flying-left" : "is-flying-right");

        applyDelta(choice.delta);
        clearBarHints();
        if (leftEl)  leftEl.classList.remove("is-active");
        if (rightEl) rightEl.classList.remove("is-active");
        STATE.currentSide = null;
        STATE.currentCard = null; // protect from stray drag during flight

        showReaction(choice.reaction || "");

        setTimeout(() => {
            if (!STATE.running) return;
            dealNext();
        }, 720);
    }

    function showReaction(text) {
        if (!reactionEl) return;
        reactionEl.textContent = text || "";
        clearTimeout(showReaction._t);
        if (text) {
            reactionEl.classList.add("is-visible");
            showReaction._t = setTimeout(() => {
                reactionEl.classList.remove("is-visible");
            }, 1900);
        } else {
            reactionEl.classList.remove("is-visible");
        }
    }

    /* ============================================================
       UTILS
       ============================================================ */
    function pointer(ev) {
        if (ev.touches && ev.touches[0])
            return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
        if (ev.changedTouches && ev.changedTouches[0])
            return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
        return { x: ev.clientX, y: ev.clientY };
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    document.addEventListener("DOMContentLoaded", init);

    window.mini = Object.assign(window.mini || {}, {
        config,
        start,
        stop,
        setBar(id, v) {
            const b = STATE.bars.find((x) => x.id === id);
            if (b) { b.value = clamp(v, b.min, b.max); updateBarVisual(id); }
        },
        getState: snapshotState,
        isRunning: () => STATE.running,
    });
})();
