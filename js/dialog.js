/* ============================================================
   dialog.js — render passage payload into the custom UI
       dialog.render({ speaker, html, choices })
       dialog.skip()             — finish typewriter instantly
       dialog.fadeOut() / fadeIn() — for passage transitions

   It does NOT touch <tw-passage>. main.js parses tw-passage and
   calls render() with cleaned content.
   ============================================================ */

(function () {
    "use strict";

    let elFooter   = null;
    let elDialog   = null;
    let elText     = null;
    let elSpeaker  = null;
    let elHint     = null;
    let elChoices  = null;

    let typing = false;
    let skipRequested = false;
    let currentRenderToken = 0;     // cancels stale typewriters on passage swap

    function init() {
        elFooter  = document.querySelector("[data-footer]");
        elDialog  = document.querySelector("[data-dialog]");
        elText    = document.querySelector("[data-dialog-text]");
        elSpeaker = document.querySelector("[data-dialog-speaker]");
        elHint    = document.querySelector("[data-dialog-hint]");
        elChoices = document.querySelector("[data-choices]");

        if (elDialog) {
            elDialog.addEventListener("click", (ev) => {
                if (!Game.config.skipOnClick) return;
                if (!typing) return;
                if (ev.target.closest(".choice")) return;
                skipRequested = true;
            });
        }
    }

    /* ============================================================
       render() — main entry
       Animates leave (choices + text), then types the new content,
       then fades the choices up.
       ============================================================ */
    async function render(payload) {
        const token = ++currentRenderToken;

        // 1. Leave: animate old choices out + fade text
        await leave();
        if (token !== currentRenderToken) return;

        // 2. Speaker label
        if (elSpeaker) elSpeaker.textContent = payload.speaker || "";

        // 3. Hint hidden until typing finishes
        if (elHint) elHint.classList.remove("is-visible");

        // 4. Typewriter (skips remain valid)
        await typewrite(payload.html || "", token);
        if (token !== currentRenderToken) return;

        // 5. Choices
        const hasChoices = payload.choices && payload.choices.length > 0;
        if (hasChoices) renderChoices(payload.choices);
        if (elHint && !hasChoices) elHint.classList.add("is-visible");
    }

    function leave() {
        return new Promise((resolve) => {
            const outMs = (Game.config.passageOutMs || 220);

            // Choices fade out
            if (elChoices) {
                const buttons = elChoices.querySelectorAll(".choice");
                buttons.forEach((b, i) => {
                    b.style.setProperty("animation", "none"); // cancel possibly-running fade-up
                    b.classList.add("is-leaving");
                });
            }
            // Text fade out
            if (elText) elText.classList.add("is-leaving");

            setTimeout(() => {
                if (elChoices) elChoices.innerHTML = "";
                if (elText) {
                    elText.classList.remove("is-leaving");
                    elText.innerHTML = "";
                }
                resolve();
            }, outMs);
        });
    }

    /* ============================================================
       Typewriter that preserves HTML structure
       ============================================================ */
    function typewrite(html, token) {
        return new Promise((resolve) => {
            if (!elText) { resolve(); return; }
            typing = true;
            skipRequested = false;
            elText.innerHTML = "";

            // Build ops list from html
            const sourceRoot = document.createElement("div");
            sourceRoot.innerHTML = html;

            const ops = [];
            (function walk(node) {
                node.childNodes.forEach((child) => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        for (const ch of child.textContent) ops.push({ type: "char", ch });
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        const tag = child.tagName.toLowerCase();
                        const attrs = {};
                        for (const a of child.attributes) attrs[a.name] = a.value;
                        ops.push({ type: "open", tag, attrs });
                        walk(child);
                        ops.push({ type: "close" });
                    }
                });
            })(sourceRoot);

            // Trailing caret
            const caret = document.createElement("span");
            caret.className = "caret";
            caret.textContent = "▍";
            elText.appendChild(caret);

            let i = 0;
            let cursor = elText;
            const cursorStack = [];

            const cps = Math.max(1, Game.config.typewriterCps || 48);
            const msPerChar = 1000 / cps;
            let lastTime = performance.now();
            let acc = 0;

            function step(now) {
                if (token !== currentRenderToken) { typing = false; resolve(); return; }
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
       Choices
       ============================================================ */
    function renderChoices(choices) {
        if (!elChoices) return;
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

    function isTyping() { return typing; }
    function skip() { skipRequested = true; }

    /* ============================================================
       Footer-wide fade (used on bigger transitions, e.g. mini-game)
       ============================================================ */
    function fadeOut() {
        return new Promise((resolve) => {
            if (!elFooter) return resolve();
            elFooter.classList.add("is-leaving");
            setTimeout(resolve, 280);
        });
    }
    function fadeIn() {
        return new Promise((resolve) => {
            if (!elFooter) return resolve();
            elFooter.classList.remove("is-leaving");
            setTimeout(resolve, 280);
        });
    }

    document.addEventListener("DOMContentLoaded", init);

    window.dialog = Object.assign(window.dialog || {}, {
        render,
        skip,
        isTyping,
        fadeOut,
        fadeIn,
        setSpeed(cps) { if (cps > 0) Game.config.typewriterCps = cps; },
    });
})();
