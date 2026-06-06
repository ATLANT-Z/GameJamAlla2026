/* ============================================================
   main.js — watches the passage element configured by Game.config
   and pipes its contents into our custom dialog UI.

   Passage authoring contract:
     • Any HTML is fine; <em>, <strong>, etc. survive the typewriter.
     • Leading "@Speaker: …" sets the speaker banner.
     • Links — <a data-passage>, <tw-link data-passage>, <button data-passage>,
       OR Twine [[Label|Target]] (we parse it ourselves as a fallback) —
       are extracted into the choices row above the dialog.
   ============================================================ */

(function () {
    "use strict";

    let twEl = null;
    let observer = null;
    let lastContent = "";

    function init() {
        attachWatcher();
    }

    function attachWatcher() {
        const sel = (window.Game && window.Game.config.passageSelector) || "tw-passage";
        twEl = document.querySelector(sel);
        if (!twEl) {
            // Try again on the next frame — Twine sometimes mounts late.
            requestAnimationFrame(attachWatcher);
            return;
        }

        // Initial render if there's already content
        if (twEl.innerHTML.trim()) syncFromPassage();

        observer && observer.disconnect();
        observer = new MutationObserver(() => syncFromPassage());
        observer.observe(twEl, { childList: true, subtree: true, characterData: true });
    }

    function syncFromPassage() {
        if (!twEl) return;
        const raw = twEl.innerHTML;
        if (raw === lastContent) return;
        lastContent = raw;

        // Sandbox to strip scripts (Twine already executed them)
        const sandbox = document.createElement("div");
        sandbox.innerHTML = raw;
        sandbox.querySelectorAll("script").forEach((s) => s.remove());

        // Convert [[Label|Target]] / [[Target]] left in the text into <a> elements
        // (in real Twine they're already <a data-passage>, but we keep this as a safety net)
        convertBracketLinks(sandbox);

        // Collect choices, remove from body
        const choices = [];
        sandbox.querySelectorAll(
            "a[data-passage], tw-link[data-passage], button[data-passage]"
        ).forEach((node) => {
            const target = node.dataset.passage;
            const label  = node.innerHTML.trim();
            choices.push({
                label,
                onClick: () => navigateTo(target),
            });
            node.remove();
        });

        // Speaker extraction
        const { speaker, html } = extractSpeaker(sandbox.innerHTML);

        window.dialog.render({ speaker, html, choices });
    }

    function convertBracketLinks(rootEl) {
        // Walk text nodes and replace [[Label|Target]] / [[Target]] occurrences
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
        const targets = [];
        let n;
        while ((n = walker.nextNode())) {
            if (/\[\[[^\]]+\]\]/.test(n.textContent)) targets.push(n);
        }
        targets.forEach((node) => {
            const parent = node.parentNode;
            if (!parent) return;
            const frag = document.createDocumentFragment();
            const re = /\[\[([^\]]+?)\]\]/g;
            let cursor = 0;
            let m;
            while ((m = re.exec(node.textContent))) {
                if (m.index > cursor) {
                    frag.appendChild(document.createTextNode(
                        node.textContent.slice(cursor, m.index)));
                }
                const body = m[1];
                const [labelPart, targetPart] = body.includes("|")
                    ? body.split("|")
                    : [body, body];
                const a = document.createElement("a");
                a.dataset.passage = targetPart.trim();
                a.textContent = labelPart.trim();
                frag.appendChild(a);
                cursor = m.index + m[0].length;
            }
            if (cursor < node.textContent.length) {
                frag.appendChild(document.createTextNode(node.textContent.slice(cursor)));
            }
            parent.replaceChild(frag, node);
        });
    }

    function extractSpeaker(html) {
        const trimmed = html.replace(/^\s+/, "");
        const m = trimmed.match(/^@([^:\n<]+):\s*([\s\S]*)$/);
        if (m) return { speaker: m[1].trim(), html: m[2] };
        return { speaker: "", html: trimmed };
    }

    function navigateTo(target) {
        // Dev / custom override wins
        if (window.Game && typeof window.Game.onNavigate === "function") {
            window.Game.onNavigate(target);
            return;
        }
        // Real Twine: simulate a click on the original link inside <tw-passage>
        const sel = (window.Game && window.Game.config.passageSelector) || "tw-passage";
        const original = document.querySelector(
            `${sel} [data-passage="${cssEscape(target)}"]`
        );
        if (original) { original.click(); return; }
        console.info("[main] navigate request:", target,
            "— no handler. Set Game.onNavigate or wire a real Twine link.");
    }

    function cssEscape(s) {
        if (window.CSS && CSS.escape) return CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    document.addEventListener("DOMContentLoaded", init);

    /* Expose a re-attach hook in case the user mounts a different element later */
    window.Game = window.Game || {};
    window.Game.rewatch = attachWatcher;
})();
