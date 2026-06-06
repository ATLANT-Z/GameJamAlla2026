/* ============================================================
   sprites.js — protagonist + NPC stage API

   GG (the protagonist, left side):
       gg.emj("sad")              // → "<protagonist>_sad"
       gg.emj("aurora_sad")       // exact id also works
       gg.show() / gg.hide()

   NPC (right side fan):
       npc.show("knight")                 // shows knight at default mood "neutral"
       npc.show("knight", "sad")          // show + set mood
       npc.emj("knight", "sad")           // change mood of an existing npc
       npc.speak("knight")                // mark as active speaker (scoots in)
       npc.hide("knight")
       npc.clear()

   Animations are detected from the registry: register a sprite
   with { anim: { frames, fps } } and it auto-loops as a spritesheet.
   ============================================================ */

(function () {
    "use strict";

    /* ---------- Helpers ---------- */

    function resolveFullId(family, suffix) {
        // "aurora_sad" passed as suffix → use as-is
        if (window.sprites.has(suffix)) return suffix;
        // Try the family literally, then case-folded (Game.config.protagonist
        // can be "Аврора"/"Aurora"/"aurora" — registry keys are lowercase).
        const variants = [
            `${family}_${suffix}`,
            `${family.toLowerCase()}_${suffix}`,
            `${family.toLowerCase()}_${suffix.toLowerCase()}`,
        ];
        for (const v of variants) if (window.sprites.has(v)) return v;
        // last-resort: return the most readable miss so the warn message is clear
        return `${family}_${suffix}`;
    }

    function makeInner(entry) {
        const inner = document.createElement("div");
        inner.className = "sprite__inner";
        inner.style.backgroundImage = `url("${entry.src}")`;

        const anim = entry.anim || entry.spritesheet;
        if (anim && anim.frames && anim.frames > 1) {
            const frames = anim.frames;
            const fps    = anim.fps || 8;
            inner.classList.add("is-spritesheet");
            inner.style.setProperty("--frames", String(frames));
            inner.style.setProperty("--fps",    String(fps));
            inner.style.backgroundSize = `${frames * 100}% 100%`;
            inner.style.backgroundPosition = "0% center";
            inner.style.backgroundRepeat   = "no-repeat";

            let frame = 0;
            const frameMs = 1000 / fps;
            let last = performance.now();
            (function tick(now) {
                if (!inner.isConnected) return;
                if (now - last >= frameMs) {
                    frame = (frame + 1) % frames;
                    inner.style.backgroundPositionX = `-${frame * 100}%`;
                    last = now;
                }
                requestAnimationFrame(tick);
            })(performance.now());
        } else {
            inner.style.backgroundSize = "contain";
        }
        return inner;
    }

    /* ============================================================
       GG (left side)
       ============================================================ */
    const gg = (function () {
        let currentId = null;
        let currentEl = null;
        let lastMood = null;   // remembered so we can re-mount after passage change

        // Always re-query: passage swaps replace [data-gg-slot] with a new
        // element, and the old reference becomes orphaned.
        function ensureSlot() {
            return document.querySelector("[data-gg-slot]");
        }

        function emj(suffix) {
            const root = ensureSlot();
            if (!root) return;
            lastMood = suffix;
            if (currentEl && currentEl.parentNode !== root) currentEl = null;
            const family = (window.Game && window.Game.config.protagonist) || "aurora";
            const fullId = resolveFullId(family, suffix);

            const entry = window.sprites.get(fullId);
            if (!entry) {
                console.warn("[gg.emj] unknown sprite id:", fullId);
                return;
            }
            currentId = fullId;

            const next = document.createElement("div");
            next.className = "sprite is-entering";
            next.appendChild(makeInner(entry));
            root.appendChild(next);

            requestAnimationFrame(() => {
                next.classList.add("is-active");
                next.classList.remove("is-entering");
            });

            if (currentEl) {
                const old = currentEl;
                old.classList.remove("is-active");
                setTimeout(() => old.remove(), 500);
            }
            currentEl = next;
        }

        function show() { if (currentEl) currentEl.classList.add("is-active"); }
        function hide() { if (currentEl) currentEl.classList.remove("is-active"); }

        function clear() {
            if (currentEl) { currentEl.remove(); currentEl = null; }
            currentId = null;
        }

        // Re-mount sprite into a freshly-rendered slot (after passage swap).
        function rehome() {
            const slot = ensureSlot();
            if (!slot) return;
            // already in current slot — nothing to do
            if (currentEl && currentEl.parentNode === slot) return;
            // slot reappeared but we lost our DOM element — re-mount last mood
            if (lastMood) {
                currentEl = null;
                emj(lastMood);
            }
        }

        return {
            emj,
            setEmj: emj,                 // legacy alias
            show, hide, clear,
            rehome,
            current: () => currentId,
        };
    })();

    /* ============================================================
       NPC stack (right side fan)
       ============================================================ */
    const npc = (function () {
        // Stack entries are kept ALIVE across passage swaps so we can re-mount
        // them into a freshly-rendered [data-npc-stack].
        let stack = [];     // [{ key, mood, el }]
        let activeKey = null;

        function ensureRoot() {
            // Always re-query — passage swaps replace the host element.
            return document.querySelector("[data-npc-stack]");
        }

        const PARALLAX_BY_STACK = [36, 22, 14, 8];

        function relayout() {
            if (!ensureRoot()) return;
            const others = stack.filter((s) => s.key !== activeKey);
            const orderedInactive = others.slice().reverse();

            stack.forEach((entry) => {
                let depth;
                if (entry.key === activeKey) {
                    depth = 0;
                    entry.el.classList.add("is-active");
                } else {
                    const i = orderedInactive.indexOf(entry);
                    depth = Math.min(3, i + 1);
                    entry.el.classList.remove("is-active");
                }
                entry.el.dataset.stack = String(depth);
                entry.el.dataset.parallax = String(PARALLAX_BY_STACK[depth]);
            });

            if (window.parallax) window.parallax.refresh();
        }

        /**
         * Show a character on the right stack.
         * @param {string} key   stable handle, e.g. "knight"
         * @param {string} [mood="neutral"]
         */
        function show(key, mood) {
            mood = mood || "neutral";
            const r = ensureRoot();
            if (!r) return;
            const fullId = resolveFullId(key, mood);
            const entry = window.sprites.get(fullId);
            if (!entry) {
                console.warn("[npc.show] unknown sprite id:", fullId);
                return;
            }

            let existing = stack.find((s) => s.key === key);
            if (existing) {
                // If our cached element is detached (passage swap), rebuild it
                // inside the freshly-rendered stack host.
                if (!existing.el || !existing.el.isConnected || existing.el.parentNode !== r) {
                    const el = document.createElement("div");
                    el.className = "npc";
                    el.dataset.npcKey = key;
                    el.appendChild(makeInner(entry));
                    r.appendChild(el);
                    existing.el = el;
                } else {
                    existing.el.innerHTML = "";
                    existing.el.appendChild(makeInner(entry));
                }
                existing.mood = mood;
            } else {
                const el = document.createElement("div");
                el.className = "npc is-entering";
                el.dataset.npcKey = key;
                el.appendChild(makeInner(entry));
                r.appendChild(el);
                requestAnimationFrame(() => el.classList.remove("is-entering"));
                stack.push({ key, mood, el });
            }

            // First-shown character becomes the speaker by default
            if (!activeKey) activeKey = key;
            relayout();
        }

        // Re-mount whole stack into a fresh host after passage swap.
        function rehome() {
            const r = ensureRoot();
            if (!r) return;
            stack.forEach((s) => {
                if (!s.el || !s.el.isConnected || s.el.parentNode !== r) {
                    const entry = window.sprites.get(resolveFullId(s.key, s.mood || "neutral"));
                    if (!entry) return;
                    const el = document.createElement("div");
                    el.className = "npc";
                    el.dataset.npcKey = s.key;
                    el.appendChild(makeInner(entry));
                    r.appendChild(el);
                    s.el = el;
                }
            });
            relayout();
        }

        /** Change the mood (emoji) of an already-shown NPC. */
        function emj(key, mood) {
            const existing = stack.find((s) => s.key === key);
            if (!existing) {
                show(key, mood);  // auto-mount if missing
                return;
            }
            show(key, mood);  // show() re-builds inner with new mood
        }

        /** Mark NPC as the active speaker (scoots in). */
        function speak(key) {
            if (!stack.find((s) => s.key === key)) return;
            activeKey = key;
            relayout();
        }

        function hide(key) {
            const idx = stack.findIndex((s) => s.key === key);
            if (idx === -1) return;
            const [entry] = stack.splice(idx, 1);
            entry.el.style.opacity = "0";
            entry.el.style.transition = "opacity 320ms ease, transform 320ms ease";
            entry.el.style.transform = "translateX(40%) scale(.8)";
            setTimeout(() => entry.el.remove(), 360);
            if (activeKey === key) activeKey = (stack[stack.length - 1] || {}).key || null;
            relayout();
        }

        function clear() {
            stack.forEach((s) => s.el.remove());
            stack = [];
            activeKey = null;
        }

        return {
            show, emj, speak, hide, clear, rehome,
            // legacy alias for setEmj({ key, speaker })
            setEmj(fullId, opts) {
                opts = opts || {};
                const key = opts.key || (fullId.split("_")[0]);
                const mood = fullId.includes("_") ? fullId.split("_").slice(1).join("_") : "neutral";
                show(key, mood);
                if (opts.speaker) speak(key);
            },
            setActive: speak,
            remove: hide,
            _stack: () => stack,
            active: () => activeKey,
        };
    })();

    window.gg  = Object.assign(window.gg  || {}, gg);
    window.npc = Object.assign(window.npc || {}, npc);
})();
