/* ============================================================
   mini.js — Reigns-style card mini-game

   API:
       mini.register("tutorial1", { bars, cards, onComplete?, onBarZero? })
       mini.start("tutorial1")           // ← lookup by id
       mini.start({ bars, cards, ... })  // ← inline config
       mini.stop()
       mini.isRunning()

   Events (window):
       "mini:start"     { detail: { id } }
       "mini:complete"  { detail: { id, reason: "deck"|"barZero", barId? } }

   Side hint inversion:
       Swiping the card RIGHT  → hint text appears on the LEFT  (so
       the card doesn't cover it). Same for the reverse.
   ============================================================ */

(function () {
    "use strict";

    const REGISTRY = Object.create(null);

    const STATE = {
        running: false,
        currentId: null,
        bars: [],
        deck: [],
        currentCard: null,
        currentSide: null,
        config: null,

        dragging: false,
        startX: 0,
        startY: 0,
        dx: 0,
        dy: 0,
    };

    // No cached DOM. We re-resolve every time the mini-game starts (and the
    // card listeners get re-bound to whatever [data-mini-card] is live now).
    let root, barsEl, cardEl, artEl, textEl, leftEl, rightEl, reactionEl;
    let boundCardEl = null;   // the cardEl we currently have drag listeners on

    function resolveRefs() {
        root       = document.querySelector("[data-mini]");
        barsEl     = document.querySelector("[data-mini-bars]");
        cardEl     = document.querySelector("[data-mini-card]");
        artEl      = document.querySelector("[data-mini-card-art]");
        textEl     = document.querySelector("[data-mini-card-text]");
        leftEl     = document.querySelector('[data-mini-side="left"]');
        rightEl    = document.querySelector('[data-mini-side="right"]');
        reactionEl = document.querySelector("[data-mini-reaction]");
    }

    /* ============================================================
       LIFECYCLE
       ============================================================ */
    function register(id, cfg) {
        if (!id) return;
        REGISTRY[id] = cfg;
    }

    function start(idOrCfg) {
        let cfg, id;
        if (typeof idOrCfg === "string") {
            id = idOrCfg;
            cfg = REGISTRY[idOrCfg];
            if (!cfg) {
                console.warn("[mini.start] unknown id:", idOrCfg);
                return;
            }
        } else if (idOrCfg && typeof idOrCfg === "object") {
            cfg = idOrCfg;
            id = idOrCfg.id || null;
        } else {
            console.warn("[mini.start] needs an id or config");
            return;
        }

        // Deep copy cards/bars so we don't mutate the registered config
        const cardsCopy = (cfg.cards || []).map((c) => Object.assign({}, c));
        const barsCopy = (cfg.bars || []).map((b) => Object.assign({}, b));

        STATE.config = Object.assign({}, cfg, { bars: barsCopy, cards: cardsCopy });
        STATE.currentId = id;
        STATE.bars = barsCopy.map((b) => ({
            id: b.id, icon: b.icon || "✦", label: b.label || b.id,
            value: clamp(b.value ?? 100, 0, 100),
            min: 0, max: 100,
        }));
        STATE.deck = cardsCopy.slice();

        STATE.running = true;
        resolveRefs();
        bindCardListeners();    // re-bind drag to the current cardEl
        renderBars();
        if (root) root.classList.remove("mini--hidden");
        if (reactionEl) reactionEl.classList.remove("is-visible");

        dispatchEvt("mini:start", { id });
        dealNext();
    }

    function stop(reason, extra) {
        if (!STATE.running) return;
        const id = STATE.currentId;
        STATE.running = false;
        STATE.currentId = null;
        STATE.currentCard = null;
        STATE.currentSide = null;
        STATE.dragging = false;
        if (root) root.classList.add("mini--hidden");
        clearBarHints();
        if (leftEl)  leftEl.classList.remove("is-active");
        if (rightEl) rightEl.classList.remove("is-active");

        dispatchEvt("mini:complete", Object.assign({ id, reason: reason || "stop" }, extra || {}));
    }

    function dispatchEvt(name, detail) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); }
        catch (e) { console.error(e); }
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
            // Per-config callback first
            if (STATE.config && typeof STATE.config.onComplete === "function") {
                try { STATE.config.onComplete(); } catch (e) { console.error(e); }
            }
            // Then close the screen + global event
            const id = STATE.currentId;
            STATE.running = false;
            STATE.currentId = null;
            if (root) root.classList.add("mini--hidden");
            dispatchEvt("mini:complete", { id, reason: "deck" });
            return;
        }
        STATE.currentCard = card;
        mountCard(card);
    }

    /* ============================================================
       MOUNT — snap-then-animate to dodge transition pile-ups
       ============================================================ */
    function mountCard(card) {
        if (!cardEl) return;

        cardEl.style.transition = "none";
        cardEl.classList.remove("is-flying-left", "is-flying-right");
        cardEl.classList.add("is-entering");
        cardEl.style.transform = "";
        cardEl.style.opacity   = "";
        void cardEl.offsetWidth;
        cardEl.style.transition = "";

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

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEl.classList.remove("is-entering");
            });
        });
    }

    /* ============================================================
       DRAG / TILT (bound once)
       Side hints: swiping RIGHT → show LEFT hint (so the card
       doesn't cover the text), and vice-versa.
       ============================================================ */
    // Stored window-level listeners — bound once on first start.
    let windowDragBound = false;

    function bindCardListeners() {
        if (!cardEl) return;
        // Already bound to THIS exact element? skip.
        if (boundCardEl === cardEl) return;
        boundCardEl = cardEl;

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
            const swipeDirection = dx >  threshold ? "right"
                                 : dx < -threshold ? "left"
                                 : null;

            if (swipeDirection !== STATE.currentSide) {
                STATE.currentSide = swipeDirection;
                // INVERTED — swiping right shows the LEFT hint
                if (leftEl)  leftEl.classList.toggle("is-active",  swipeDirection === "right");
                if (rightEl) rightEl.classList.toggle("is-active", swipeDirection === "left");

                if (swipeDirection === "right" && card.right) setBarHints(card.right.delta);
                else if (swipeDirection === "left" && card.left) setBarHints(card.left.delta);
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
                cardEl.style.transform = "";
                if (leftEl)  leftEl.classList.remove("is-active");
                if (rightEl) rightEl.classList.remove("is-active");
                clearBarHints();
                STATE.currentSide = null;
            }
        };
        // Window-level move/up — must bind only ONCE no matter how many
        // times the card element gets remounted across passages.
        if (!windowDragBound) {
            windowDragBound = true;
            window.addEventListener("mousemove", onMove, { passive: false });
            window.addEventListener("touchmove", onMove, { passive: false });
            window.addEventListener("mouseup",   onUp);
            window.addEventListener("touchend",  onUp);
            window.addEventListener("touchcancel", onUp);
        }
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
        STATE.currentCard = null;

        showReaction(choice.reaction || "");

        setTimeout(() => {
            if (!STATE.running) return;
            dealNext();
        }, 720);
    }

    function showReaction(text) {
        if (!reactionEl) return;
        clearTimeout(showReaction._t);
        if (!text) {
            reactionEl.classList.remove("is-visible");
            return;
        }
        const protagonist = (window.Game && window.Game.config.protagonist) || "Аврора";
        const speakerName = protagonist.charAt(0).toUpperCase() + protagonist.slice(1);
        reactionEl.innerHTML =
            `<div class="thought__speaker">${speakerName}</div>` +
            `<div class="thought__body">${escapeHtml(text)}</div>`;
        reactionEl.classList.add("is-visible");
        showReaction._t = setTimeout(() => {
            reactionEl.classList.remove("is-visible");
        }, 2400);
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
    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, (c) => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
        ));
    }

    window.mini = Object.assign(window.mini || {}, {
        register,
        start,
        stop,
        setBar(id, v) {
            const b = STATE.bars.find((x) => x.id === id);
            if (b) { b.value = clamp(v, b.min, b.max); updateBarVisual(id); }
        },
        getState: snapshotState,
        isRunning: () => STATE.running,
        _registry: REGISTRY,
    });
})();
