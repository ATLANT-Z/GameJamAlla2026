/* ============================================================
   dialog.js — render passage payload (multi-line replies)
       dialog.render({ lines: [{ speaker, html }, ...], choices })

   Behaviour:
       • Each line is typed out via typewriter.
       • While typing, a click on the dialog skips to end.
       • After a line finishes typing, "▾" hint pulses.
       • A click advances to the next line.
       • On the LAST line, choices are rendered above the dialog
         (fade-up). Clicking the dialog there does nothing.
       • Inline links inside the last line (.inline-link) are
         clickable directly without ever needing the choices row.
   ============================================================ */

(function () {
    "use strict";

    let typing = false;
    let skipRequested = false;
    let renderToken = 0;

    // Current playback state
    let currentLines = [];
    let currentIndex = 0;
    let currentChoices = [];
    let awaitingClick = false;

    // Always-fresh lookups — DOM may be remounted between passages.
    const $ = (sel) => document.querySelector(sel);
    const refs = () => ({
        footer:  $("[data-footer]"),
        dialog:  $("[data-dialog]"),
        text:    $("[data-dialog-text]"),
        speaker: $("[data-dialog-speaker]"),
        hint:    $("[data-dialog-hint]"),
        choices: $("[data-choices]"),
    });

    function cfg() {
        return (window.Game && window.Game.config) || {};
    }

    function onDialogClick(ev) {
        const dlg = ev.target.closest && ev.target.closest("[data-dialog]");
        if (!dlg) return;
        // Don't intercept clicks on choices or inline links — they have own handlers
        if (ev.target.closest(".choice")) return;
        if (ev.target.closest(".inline-link")) return;

        if (typing && cfg().skipOnClick) {
            skipRequested = true;
            return;
        }
        if (awaitingClick) {
            advance();
        }
    }

    /* ============================================================
       PUBLIC: render
       Accepts both the new multi-line shape and the legacy
       { speaker, html, choices } shape for back-compat.
       ============================================================ */
    async function render(payload) {
        const token = ++renderToken;
        awaitingClick = false;

        // Normalise payload
        let lines, choices;
        if (Array.isArray(payload.lines)) {
            lines = payload.lines.slice();
            choices = payload.choices || [];
        } else {
            lines = [{ speaker: payload.speaker || "", html: payload.html || "" }];
            choices = payload.choices || [];
        }
        currentLines = lines;
        currentChoices = choices;
        currentIndex = 0;

        await leave();
        if (token !== renderToken) return;

        if (!lines.length) {
            // Empty payload — just render choices if any
            if (choices.length) renderChoices(choices);
            return;
        }

        await playLine(token);
    }

    async function playLine(token) {
        if (token !== renderToken) return;
        const line = currentLines[currentIndex];
        if (!line) return;

        // Notify subscribers (speakers.js auto-shows NPCs etc.)
        try {
            window.dispatchEvent(new CustomEvent("dialog:line", { detail: {
                speaker: line.speaker || "",
                mood:    line.mood    || "",
                html:    line.html    || "",
                index:   currentIndex,
                total:   currentLines.length,
            }}));
        } catch (e) {}

        const { speaker, hint, text } = refs();
        if (speaker) speaker.textContent = line.speaker || "";
        if (hint)    hint.classList.remove("is-visible");

        await typewrite(line.html || "", token);
        if (token !== renderToken) return;

        const isLast = currentIndex >= currentLines.length - 1;
        const r = refs();

        if (isLast) {
            if (currentChoices && currentChoices.length) {
                renderChoices(currentChoices);
            }
            const hasInline = r.text && r.text.querySelector(".inline-link");
            const hasChoices = currentChoices && currentChoices.length;
            if (r.hint && !hasChoices && !hasInline) {
                r.hint.classList.add("is-visible");
            }
            awaitingClick = false;
        } else {
            if (r.hint) r.hint.classList.add("is-visible");
            awaitingClick = true;
        }
    }

    function advance() {
        awaitingClick = false;
        currentIndex++;
        if (currentIndex >= currentLines.length) return;
        playLine(renderToken);
    }

    /* ============================================================
       LEAVE — old choices + text fade out
       ============================================================ */
    function leave() {
        return new Promise((resolve) => {
            const outMs = cfg().passageOutMs || 220;
            const { choices, text } = refs();

            if (choices) {
                choices.querySelectorAll(".choice").forEach((b) => {
                    b.style.animation = "none";
                    b.classList.add("is-leaving");
                });
            }
            if (text) text.classList.add("is-leaving");

            setTimeout(() => {
                const r = refs();
                if (r.choices) r.choices.innerHTML = "";
                if (r.text) {
                    r.text.classList.remove("is-leaving");
                    r.text.innerHTML = "";
                }
                resolve();
            }, outMs);
        });
    }

    /* ============================================================
       TYPEWRITER — preserves HTML structure (em, strong, span.inline-link)
       ============================================================ */
    function typewrite(html, token) {
        return new Promise((resolve) => {
            const elText = refs().text;
            if (!elText) { resolve(); return; }
            typing = true;
            skipRequested = false;
            elText.innerHTML = "";

            const sourceRoot = document.createElement("div");
            sourceRoot.innerHTML = html;

            // Inline-link clicks are handled globally by main.js via delegation
            // on `.inline-link[data-passage]` — no per-node listener wiring needed.

            const ops = [];
            (function walk(node) {
                node.childNodes.forEach((child) => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        for (const ch of child.textContent) ops.push({ type: "char", ch });
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        const tag = child.tagName.toLowerCase();
                        const attrs = {};
                        for (const a of child.attributes) attrs[a.name] = a.value;
                        ops.push({ type: "open", tag, attrs, source: child });
                        walk(child);
                        ops.push({ type: "close" });
                    }
                });
            })(sourceRoot);

            const caret = document.createElement("span");
            caret.className = "caret";
            caret.textContent = "▍";
            elText.appendChild(caret);

            let i = 0;
            let cursor = elText;
            const cursorStack = [];

            const cps = Math.max(1, cfg().typewriterCps || 48);
            const msPerChar = 1000 / cps;
            let lastTime = performance.now();
            let acc = 0;

            function step(now) {
                if (token !== renderToken) { typing = false; resolve(); return; }
                if (!typing) return;
                const dt = now - lastTime;
                lastTime = now;
                acc += dt;

                let budget = skipRequested ? Infinity : Math.floor(acc / msPerChar);
                if (budget !== Infinity) acc -= budget * msPerChar;

                while (i < ops.length && budget > 0) {
                    const op = ops[i];
                    if (op.type === "char") {
                        const t = document.createTextNode(op.ch);
                        cursor.insertBefore(t, caret.parentNode === cursor ? caret : null);
                        budget--;
                    } else if (op.type === "open") {
                        const el = document.createElement(op.tag);
                        for (const [k, v] of Object.entries(op.attrs)) el.setAttribute(k, v);
                        cursor.insertBefore(el, caret.parentNode === cursor ? caret : null);
                        cursorStack.push(cursor);
                        cursor = el;
                    } else if (op.type === "close") {
                        cursor = cursorStack.pop() || elText;
                    }
                    i++;
                }

                if (i < ops.length) {
                    if (caret.parentNode !== cursor) cursor.appendChild(caret);
                    requestAnimationFrame(step);
                } else {
                    caret.remove();
                    typing = false;
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    /* ============================================================
       CHOICES
       ============================================================ */
    function renderChoices(choices) {
        const elChoices = refs().choices;
        if (!elChoices) return;
        elChoices.innerHTML = "";
        choices.forEach((c, idx) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "choice";

            const sheen = document.createElement("span");
            sheen.className = "choice__sheen";
            btn.appendChild(sheen);

            const label = document.createElement("span");
            label.className = "choice__label";
            label.innerHTML = c.label;
            btn.appendChild(label);

            btn.style.setProperty("--choice-delay", (idx * 80) + "ms");
            btn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (typeof c.onClick === "function") c.onClick();
            });
            elChoices.appendChild(btn);
        });
    }

    function skip() { skipRequested = true; }
    function isTyping() { return typing; }

    let bound = false;
    function init() {
        if (bound) return { bound: true };
        document.addEventListener("click", onDialogClick);
        bound = true;
        return { bound: true };
    }

    window.dialog = Object.assign(window.dialog || {}, {
        render,
        skip,
        isTyping,
        setSpeed(cps) { if (cps > 0) cfg().typewriterCps = cps; },
        init,
    });
})();
