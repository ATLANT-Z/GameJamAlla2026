/* ============================================================
   main.js — watches <tw-passage>, parses Harlowe content, drives
   the custom UI.

   Passage authoring contract:
     • Replies separated by "@@@".
     • "ИМЯ: текст…@@@" — speaker banner shows "ИМЯ".
     • "МИР: текст…@@@" — narration, no speaker banner.
     • Inside a reply, write "INLINE: <link>" to make that link
       appear as a glowing inline span in the dialog body.
     • Plain Harlowe <tw-link> (no INLINE marker) become buttons
       above the dialog.

   When the passage starts a mini-game (mini.start("id") inside a
   <tw-collapsed><script>… block), the footer fades out, the
   parsed reply queue is held until "mini:complete" fires, then
   the queue is rendered.
   ============================================================ */

(function () {
    "use strict";

    let twEl = null;
    let observer = null;
    let storyObserver = null;
    let lastContent = "";
    let pendingPayload = null;

    function init() {
        attachWatcher();
        attachStoryWatcher();   // re-attach when Twine replaces <tw-passage>
        // When a passage's mini-game completes, flush the held payload
        window.addEventListener("mini:complete", () => {
            if (pendingPayload) {
                const p = pendingPayload;
                pendingPayload = null;
                showFooter().then(() => window.dialog.render(p));
            } else {
                showFooter();
            }
        });
    }

    function attachStoryWatcher() {
        const story = document.querySelector("tw-story");
        if (!story) { requestAnimationFrame(attachStoryWatcher); return; }
        storyObserver && storyObserver.disconnect();
        storyObserver = new MutationObserver((muts) => {
            const sel = (window.Game && window.Game.config.passageSelector) || "tw-passage";
            const live = document.querySelector(sel);
            // Tags-attribute change on tw-story → force a re-sync even if
            // the passage HTML happens to be byte-identical.
            const tagsChanged = muts.some((m) => m.type === "attributes" && m.attributeName === "tags");
            if (tagsChanged) lastContent = "\0";
            if (live && live !== twEl) {
                twEl = live;
                lastContent = "";
                observer && observer.disconnect();
                observer = new MutationObserver(() => syncFromPassage());
                observer.observe(twEl, { childList: true, subtree: true, characterData: true });
            }
            syncFromPassage();
        });
        // Watch both childList (passage swaps) AND attributes (tags="hide_header")
        storyObserver.observe(story, {
            childList: true,
            attributes: true,
            attributeFilter: ["tags"],
        });
    }

    function attachWatcher() {
        const sel = (window.Game && window.Game.config.passageSelector) || "tw-passage";
        twEl = document.querySelector(sel);
        if (!twEl) {
            requestAnimationFrame(attachWatcher);
            return;
        }
        if (extractStoryHtml(twEl).trim()) syncFromPassage();
        observer && observer.disconnect();
        observer = new MutationObserver(() => syncFromPassage());
        // Watch the WHOLE passage subtree, but compare only the story tail —
        // so we don't re-parse every time a tw-open-button blinks in a header.
        observer.observe(twEl, { childList: true, subtree: true, characterData: true });
    }

    /* ------------------------------------------------------------
       extractStoryHtml — slice the passage at the LAST <tw-include>.
       Everything before that block is "headers" (footer-dialog, mini,
       cast, bg, starfield) — already mounted in the live DOM. Story
       text always sits after them.
       ------------------------------------------------------------ */
    function extractStoryHtml(rootEl) {
        if (!rootEl) return "";
        const kids = Array.from(rootEl.childNodes);
        // find the last child that is a <tw-include> (header block)
        let lastIncludeIdx = -1;
        for (let i = kids.length - 1; i >= 0; i--) {
            if (kids[i].nodeType === Node.ELEMENT_NODE &&
                kids[i].tagName === "TW-INCLUDE") { lastIncludeIdx = i; break; }
        }
        const tail = kids.slice(lastIncludeIdx + 1);
        const wrap = document.createElement("div");
        tail.forEach((n) => wrap.appendChild(n.cloneNode(true)));
        return wrap.innerHTML;
    }

    function hasHeader() {
        // Headers are the [data-footer] (dialog), [data-mini] (cards),
        // [data-cast] (sprites), etc. If footer is absent we treat the
        // passage as "menu/no-header" — Twine renders its raw text directly.
        return !!document.querySelector("[data-footer]");
    }

    // Twine puts the CURRENT passage's tags onto <tw-story tags="…">.
    // So "hide_header" lives there, not on <tw-passage>.
    function isHiddenHeaderPassage() {
        const story = document.querySelector("tw-story");
        if (!story) return false;
        const tags = (story.getAttribute("tags") || "").split(/\s+/);
        return tags.indexOf("hide_header") !== -1;
    }

    function announcePassageReady(menu) {
        document.body.classList.toggle("no-header", !!menu);
        try {
            window.dispatchEvent(new CustomEvent("passage:ready", { detail: { menu } }));
        } catch (e) {}
        // Push remembered state back into freshly-mounted hosts.
        if (!menu) {
            if (window.bg  && window.bg.rehome)  window.bg.rehome();
            if (window.hp  && window.hp.rehome)  window.hp.rehome();
            if (window.gg  && window.gg.rehome)  window.gg.rehome();
            if (window.npc && window.npc.rehome) window.npc.rehome();
        }
    }

    function syncFromPassage() {
        if (!twEl) return;
        const raw = extractStoryHtml(twEl);
        if (raw === lastContent) return;
        lastContent = raw;

        const menu = isHiddenHeaderPassage() || !hasHeader();

        // Menu / hide_header — let Twine render its own text/links inside
        // <tw-passage> directly. We just announce the state and bail.
        if (menu) {
            announcePassageReady(true);
            return;
        }

        announcePassageReady(false);
        const payload = parsePassage(raw, twEl);

        // If a mini-game was just started by THIS passage's <tw-collapsed>
        // script (or the user fired mini.start in any other way before us),
        // hide the footer and queue the payload until completion.
        if (window.mini && window.mini.isRunning()) {
            pendingPayload = payload;
            hideFooter();
            return;
        }
        window.dialog.render(payload);
    }

    /* ============================================================
       PARSE PASSAGE — Harlowe-flavoured
       ============================================================ */
    function parsePassage(rawHtml, sourceEl) {
        // Sandbox copy so we can strip non-content nodes safely
        const sandbox = document.createElement("div");
        sandbox.innerHTML = rawHtml;

        // Drop ALL Twine machinery that isn't story content.
        // tw-include = header block (already mounted live, must NOT appear in dialog).
        // tw-collapsed = collapsed/script block (already ran).
        // tw-sidebar / script / style = irrelevant.
        sandbox.querySelectorAll(
            "tw-sidebar, script, style, tw-include, tw-collapsed"
        ).forEach((n) => n.remove());

        // Normalise: <tw-consecutive-br> and stray <br> at top become " "
        sandbox.querySelectorAll("tw-consecutive-br").forEach((n) => n.replaceWith(" "));

        // Convert raw [[Label|Target]] (when Twine left them un-rendered) into <a>
        convertBracketLinks(sandbox);

        let html = sandbox.innerHTML;
        // Split into replies on @@@ (also tolerate \n@@@\n)
        let chunks = html.split(/@@@/g).map((s) => s.trim()).filter((s) => s.length > 0);

        // If no @@@ at all — treat the whole thing as one reply
        if (chunks.length === 0 && html.trim()) chunks = [html.trim()];

        const lines = [];
        const choices = [];  // collected from ALL non-inline tw-links

        chunks.forEach((chunkHtml) => {
            const line = parseChunk(chunkHtml, sourceEl);
            if (line.choices && line.choices.length) {
                choices.push(...line.choices);
            }
            // Skip lines that are pure choices with no text
            if (line.html.trim() || line.speaker) {
                lines.push({ speaker: line.speaker, html: line.html });
            }
        });

        return { lines, choices };
    }

    /* ------------------------------------------------------------
       parseChunk — one segment between @@@ delimiters.
       Returns { speaker, html, choices[] }
       ------------------------------------------------------------ */
    function parseChunk(chunkHtml, sourceEl) {
        // 1. Speaker prefix: "ИМЯ: ..." at the start. Strip leading <br>s
        //    and whitespace first — Harlowe loves emitting them between replies.
        let cleaned = chunkHtml.replace(/^(?:\s|<br\s*\/?\s*>|&nbsp;)+/i, "");
        let speaker = "";
        let body = cleaned;
        const speakerMatch = cleaned.match(/^([А-ЯЁA-Z][А-ЯЁA-Z0-9\s\-]+?)\s*:\s*([\s\S]*)$/);
        if (speakerMatch) {
            const name = speakerMatch[1].trim();
            // "МИР" = narration, no banner
            if (name !== "МИР" && name !== "WORLD") speaker = name;
            body = speakerMatch[2];
        }

        // 2. Build a DOM subtree to work with for link extraction
        const subtree = document.createElement("div");
        subtree.innerHTML = body;

        // Drop leading <br>s (Harlowe loves emitting them)
        while (subtree.firstChild &&
               subtree.firstChild.nodeName === "BR") {
            subtree.firstChild.remove();
        }

        const choices = [];

        // 3. INLINE links — find "INLINE:" markers followed by <tw-expression>...</tw-expression>
        //    or <a data-passage>.  Replace each with a glowing inline span.
        replaceInlineLinks(subtree, sourceEl);

        // 4. Remaining <tw-link> and <a data-passage> become CHOICES (collected, removed from body)
        const remaining = subtree.querySelectorAll(
            "tw-link:not([data-inline]), a[data-passage]:not([data-inline]), tw-expression:not([data-inline]) tw-link"
        );
        remaining.forEach((node) => {
            // Inside tw-expression — clicking the inner tw-link triggers Twine
            const isInsideExpression = node.closest("tw-expression");
            const label = node.textContent.trim();
            if (!label) return;
            const originalLink = pickOriginalLink(node, sourceEl);
            choices.push({
                label,
                onClick: () => clickOriginal(originalLink),
            });
            // Remove the expression entirely from body so we don't leave its open-button etc.
            const removalTarget = isInsideExpression || node;
            removalTarget.remove();
        });

        // 5. Tidy: remove now-empty tw-expression wrappers
        subtree.querySelectorAll("tw-expression").forEach((e) => {
            if (!e.textContent.trim()) e.remove();
        });

        // 6. Strip <tw-open-button> (debug widgets)
        subtree.querySelectorAll("tw-open-button").forEach((e) => e.remove());

        return { speaker, html: subtree.innerHTML, choices };
    }

    function extractTargetFromCarrier(carrier) {
        // 1. Explicit data-passage on the carrier or any descendant
        if (carrier.dataset && carrier.dataset.passage) return carrier.dataset.passage;
        const inner = carrier.querySelector && carrier.querySelector("[data-passage]");
        if (inner) return inner.dataset.passage;
        // 2. Harlowe link-goto: <tw-expression title="[[Label|Target]]" name="link-goto">
        const title = (carrier.getAttribute && carrier.getAttribute("title")) ||
                      (inner && inner.closest && inner.closest("tw-expression") &&
                       inner.closest("tw-expression").getAttribute("title"));
        if (title) {
            const m = title.match(/\[\[([^\]]+?)\]\]/);
            if (m) {
                const body = m[1];
                const parts = body.includes("|") ? body.split("|") : [body, body];
                return parts[1].trim();
            }
        }
        return null;
    }

    function replaceInlineLinks(subtree, sourceEl) {
        // Pattern: an "INLINE:" text node followed by <tw-expression> or <a data-passage>.
        // We walk text nodes, find the marker, then grab the next sibling element.
        const walker = document.createTreeWalker(subtree, NodeFilter.SHOW_TEXT, null);
        const markers = [];
        let n;
        while ((n = walker.nextNode())) {
            if (/INLINE\s*:/.test(n.textContent)) markers.push(n);
        }

        markers.forEach((textNode) => {
            const txt = textNode.textContent;
            const m = txt.match(/^([\s\S]*?)INLINE\s*:\s*([\s\S]*)$/);
            if (!m) return;
            const before = m[1];
            const after = m[2];

            const parent = textNode.parentNode;
            if (!parent) return;

            // Insert "before" text back
            if (before) parent.insertBefore(document.createTextNode(before), textNode);
            // Insert "after" text in place of the marker (may be empty)
            const afterNode = document.createTextNode(after);
            parent.insertBefore(afterNode, textNode);
            textNode.remove();

            // Now find the inline target: the next element sibling after `afterNode`
            // (the <tw-expression> usually sits there); or if `after` already contains
            // a link inline-style, look inside.
            let candidate = afterNode.nextSibling;
            while (candidate && candidate.nodeType === Node.TEXT_NODE && !candidate.textContent.trim()) {
                candidate = candidate.nextSibling;
            }
            if (!candidate) return;

            let twLink = null;
            if (candidate.nodeName === "TW-EXPRESSION") {
                twLink = candidate.querySelector("tw-link");
            } else if (candidate.nodeName === "TW-LINK") {
                twLink = candidate;
            } else if (candidate.nodeType === Node.ELEMENT_NODE && candidate.matches("a[data-passage]")) {
                twLink = candidate;
            }
            if (!twLink) return;

            const label = twLink.textContent.trim();
            const carrier = candidate.nodeName === "TW-EXPRESSION" ? candidate : twLink;
            const target = extractTargetFromCarrier(carrier) ||
                           extractTargetFromCarrier(twLink) ||
                           label;

            const span = document.createElement("span");
            span.className = "inline-link";
            span.dataset.inline = "true";
            if (target) span.dataset.passage = target;
            span.textContent = label;

            // Replace the carrier element with our span
            carrier.parentNode.replaceChild(span, carrier);
        });
    }

    function pickOriginalLink(node, sourceEl) {
        // We can't reliably reuse `node` across passage swaps because tw-passage
        // may rerender. Easiest fix: find the SAME label inside the LIVE
        // sourceEl right now and call .click() on the live element.
        // But cloning the click handler costs us nothing extra here, since the
        // user can also target by data-passage.
        const passageAttr = node.dataset && node.dataset.passage;
        if (passageAttr) {
            return sourceEl.querySelector(`[data-passage="${cssEscape(passageAttr)}"]`) || node;
        }
        // Try resolving by visible label text
        const label = node.textContent.trim();
        const all = sourceEl.querySelectorAll("tw-link, a[data-passage]");
        for (const l of all) {
            if (l.textContent.trim() === label) return l;
        }
        return node;
    }

    function clickOriginal(el) {
        if (!el) return;
        try { el.click(); }
        catch (e) { console.error(e); }
    }

    function convertBracketLinks(rootEl) {
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
                if (m.index > cursor)
                    frag.appendChild(document.createTextNode(node.textContent.slice(cursor, m.index)));
                const body = m[1];
                const [labelPart, targetPart] = body.includes("|") ? body.split("|") : [body, body];
                const a = document.createElement("a");
                a.dataset.passage = targetPart.trim();
                a.textContent = labelPart.trim();
                frag.appendChild(a);
                cursor = m.index + m[0].length;
            }
            if (cursor < node.textContent.length)
                frag.appendChild(document.createTextNode(node.textContent.slice(cursor)));
            parent.replaceChild(frag, node);
        });
    }

    function cssEscape(s) {
        if (window.CSS && CSS.escape) return CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    /* ============================================================
       Footer show/hide (while mini-game owns the screen)
       ============================================================ */
    function hideFooter() {
        const f = document.querySelector("[data-footer]");
        if (!f) return Promise.resolve();
        f.classList.add("is-leaving");
        return new Promise((r) => setTimeout(r, 280));
    }
    function showFooter() {
        const f = document.querySelector("[data-footer]");
        if (!f) return Promise.resolve();
        f.classList.remove("is-leaving");
        return new Promise((r) => setTimeout(r, 280));
    }

    /* ============================================================
       PUBLIC: Game.navigate(target)
       Single source of truth for "go to a passage": dev override
       wins, then we try to click the live tw-link / a[data-passage]
       inside the watched passage element.
       ============================================================ */
    function navigate(target) {
        if (!target) return;
        if (window.Game && typeof window.Game.onNavigate === "function") {
            window.Game.onNavigate(target);
            return;
        }
        const sel = (window.Game && window.Game.config.passageSelector) || "tw-passage";
        const root = document.querySelector(sel);
        if (!root) return;

        // 1. Element with data-passage="target"
        const direct = root.querySelector(`[data-passage="${cssEscape(target)}"]`);
        if (direct) { direct.click(); return; }

        // 2. Harlowe link-goto: tw-expression with title containing [[…|target]]
        for (const e of root.querySelectorAll("tw-expression")) {
            const title = e.getAttribute("title") || "";
            if (title.endsWith(`|${target}]]`) || title === `[[${target}]]`) {
                const inner = e.querySelector("tw-link");
                (inner || e).click();
                return;
            }
        }
        console.info("[main] navigate:", target, "— no matching link found.");
    }

    // Global delegated click for inline-links anywhere in the document
    document.addEventListener("click", (ev) => {
        const link = ev.target.closest && ev.target.closest(".inline-link[data-passage]");
        if (!link) return;
        ev.preventDefault();
        ev.stopPropagation();
        navigate(link.dataset.passage);
    });

    document.addEventListener("DOMContentLoaded", init);

    window.Game = window.Game || {};
    window.Game.rewatch = attachWatcher;
    window.Game.navigate = navigate;
})();
