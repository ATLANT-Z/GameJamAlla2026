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

    /* ============================================================
       Авторский контракт:
       Весь текст пассажа автор кладёт в <section>…</section>.
       Этот файл следит за этим <section>, парсит его и кормит
       dialog.render(). Всё остальное (шапки, меню, no-header,
       rehome и прочее) — не дело этого модуля.
       ============================================================ */

    let lastSection = null;     // последний <section>, который мы наблюдали
    let lastContent = "";       // его innerHTML на момент прошлой синхры
    let pendingPayload = null;  // payload, придерживаемый пока работает мини-игра
    let globalObserver = null;

    function init() {
        startWatching();
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

    /* ------------------------------------------------------------
       Один глобальный observer на tw-story (или body как fallback).
       Слушает ВСЁ: childList, subtree, characterData. На каждую
       мутацию находим текущий <section> в tw-passage и пересинкаем.
       ------------------------------------------------------------ */
    function startWatching() {
        const host = document.querySelector("tw-story") || document.body;
        globalObserver && globalObserver.disconnect();
        globalObserver = new MutationObserver(scheduleSync);
        globalObserver.observe(host, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        // Первая синхра сразу (после возможного начального рендера)
        scheduleSync();
    }

    // Дебаунс — Twine может прислать целый шторм мутаций пока строит
    // пассаж. Ждём пока он успокоится 40 мс — и тогда уже парсим.
    let syncTimer = 0;
    function scheduleSync() {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            syncTimer = 0;
            syncFromSection();
        }, 40);
    }

    function currentSection() {
        // <section> может лежать где угодно внутри tw-passage; берём первый.
        const passage = document.querySelector("tw-passage");
        if (!passage) return null;
        return passage.querySelector("section");
    }

    function syncFromSection() {
        const section = currentSection();
        if (!section) {
            // Меню / hide_header / пассаж ещё не зарендерился — пропускаем.
            return;
        }
        // Если <section> пересоздан (новая нода) — обнуляем кэш контента.
        if (section !== lastSection) {
            lastSection = section;
            lastContent = "";
        }
        const raw = section.innerHTML;
        if (raw === lastContent) return;
        lastContent = raw;

        const payload = parsePassage(raw, section);
        // Пропустить пустой результат — может быть промежуточная мутация.
        if (!payload.lines.length && !payload.choices.length) return;

        // Мини-игра занята экраном — придержим payload до её завершения.
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
    // Если скрипт грузится после DOMContentLoaded — стартуем сразу.
    if (document.readyState !== "loading") init();

    window.Game = window.Game || {};
    window.Game.rewatch  = startWatching;
    window.Game.navigate = navigate;
    window.Game.resync   = syncFromSection;   // ручной триггер для отладки
})();
