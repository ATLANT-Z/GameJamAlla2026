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

    let inited = false;
    function init() {
        startWatching();
        if (inited) return;
        inited = true;
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
        const host = document.body; // document.querySelector("tw-story") || document.body;
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
        // Если пассаж содержит несколько <section> с data-if / data-else-if /
        // data-else — резолвим цепочку и прячем проигравших через hidden.
        resolveConditionalSections(passage);
        return passage.querySelector("section:not([hidden])");
    }

    /* ------------------------------------------------------------
       Условные секции: <section data-if="..."> / data-else-if /
       data-else. Автор пишет несколько секций подряд внутри пассажа,
       мы выбираем первую истинную и прячем остальные через
       hidden-атрибут. В выражении доступны:
           state — снимок шкал мини-игр (mini.getState()):
                   state.hp, state.wisdom, state.pride, ...
           hp    — текущее значение hp полоски (window.hp.value()).
       Любое валидное JS-выражение: &&, ||, ?:, скобки и т.д.
       ------------------------------------------------------------ */
    function buildCondCtx() {
        const state = (window.mini && typeof window.mini.getState === "function")
            ? window.mini.getState()
            : {};
        const hp = (window.hp && typeof window.hp.value === "function")
            ? window.hp.value()
            : null;
        const drops = (window.drops && typeof window.drops.snapshot === "function")
            ? window.drops.snapshot()
            : { count: 0 };
        return { state, hp, drops };
    }

    // Кешируем скомпилированные выражения по строке — иначе на каждом
    // ре-синке пересоздаём Function() заново.
    const CONDS = Object.create(null);
    function compileCond(expr) {
        if (CONDS[expr]) return CONDS[expr];
        try {
            // eslint-disable-next-line no-new-func
            CONDS[expr] = new Function("state", "hp", "drops", "return (" + expr + ");");
        } catch (e) {
            console.error("[main] data-if: не парсится выражение:", expr, e);
            CONDS[expr] = () => false;
        }
        return CONDS[expr];
    }
    function evalCond(expr) {
        const ctx = buildCondCtx();
        try {
            return !!compileCond(expr)(ctx.state, ctx.hp, ctx.drops);
        } catch (e) {
            console.error("[main] data-if: ошибка выполнения:", expr, e);
            return false;
        }
    }

    function resolveConditionalSections(passage) {
        // Берём ТОЛЬКО прямых детей passage-tag, чтобы не лезть в чужие
        // вложенные <section> (если такие вдруг будут в HTML спрайтов и т.д.).
        const sections = [];
        for (const ch of passage.children) {
            if (ch.tagName === "SECTION") sections.push(ch);
        }
        if (sections.length < 2) return;       // одна секция — нечего решать

        let chainActive   = false;             // мы внутри if/else-if/else цепочки
        let chainResolved = false;             // в текущей цепочке уже есть победитель

        for (const sec of sections) {
            const hasIf     = sec.hasAttribute("data-if");
            const hasElseIf = sec.hasAttribute("data-else-if");
            const hasElse   = sec.hasAttribute("data-else");

            // Безусловная секция рядом с условными — это смесь, кричим.
            if (!hasIf && !hasElseIf && !hasElse) {
                console.warn(
                    "[main] <section> без data-if/else-if/else соседствует " +
                    "с условными. Это сломает цепочку — раздели на отдельные пассажи " +
                    "или оберни всё в условия."
                );
                sec.removeAttribute("hidden");
                chainActive = false;
                chainResolved = false;
                continue;
            }

            if (hasIf) {
                // Новая цепочка.
                chainActive = true;
                chainResolved = false;
            } else if (!chainActive) {
                // else-if / else без предыдущего if — мусор.
                console.warn(
                    "[main] data-else-if/data-else без предшествующего data-if — скрываю секцию."
                );
                sec.setAttribute("hidden", "");
                continue;
            }

            if (chainResolved) {
                sec.setAttribute("hidden", "");
                if (hasElse) chainActive = false;
                continue;
            }

            let win;
            if (hasElse) {
                win = true;
            } else {
                const expr = sec.getAttribute(hasIf ? "data-if" : "data-else-if");
                win = evalCond(expr);
            }

            if (win) {
                sec.removeAttribute("hidden");
                chainResolved = true;
            } else {
                sec.setAttribute("hidden", "");
            }
            if (hasElse) chainActive = false;
        }
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

        // rehome больше не нужен: интерфейс теперь не пересоздаётся при
        // смене пассажей, шапка всегда есть. Аврора показывается один раз
        // при загрузке через gg.init().

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
                lines.push({
                    speaker: line.speaker,
                    mood:    line.mood || "",
                    html:    line.html,
                });
            }
        });

        return { lines, choices };
    }

    /* ------------------------------------------------------------
       parseChunk — one segment between @@@ delimiters.
       Returns { speaker, html, choices[] }
       ------------------------------------------------------------ */
    function parseChunk(chunkHtml, sourceEl) {
        // 1. Speaker prefix: "ИМЯ@mood: ..." или "ИМЯ: ..." at the start.
        //    Strip leading <br>s and whitespace first — Harlowe loves emitting
        //    them between replies.
        //    [скобки] не используем — Twine ест их как хук-синтаксис.
        let cleaned = chunkHtml.replace(/^(?:\s|<br\s*\/?\s*>|&nbsp;)+/i, "");
        let speaker = "";
        let mood = "";
        let body = cleaned;
        // Group 1: name (ALL-CAPS, latin or cyrillic, spaces/dashes allowed)
        // Group 2: optional @mood — латиница нижнего регистра, как в реестре
        // Group 3: rest of the body
        const speakerMatch = cleaned.match(
            /^([А-ЯЁA-Z][А-ЯЁA-Z0-9\s\-]+?)\s*(?:@([a-z_][a-z0-9_]*))?\s*:\s*([\s\S]*)$/
        );
        if (speakerMatch) {
            const name = speakerMatch[1].trim();
            mood = (speakerMatch[2] || "").trim();
            // "МИР" = narration, no banner (но mood для нарратора всё равно
            // игнорим — некому показывать).
            if (name !== "МИР" && name !== "WORLD") speaker = name;
            body = speakerMatch[3];
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
        const seen = new Set();
        remaining.forEach((node) => {
            const isInsideExpression = node.closest("tw-expression");
            const carrier = isInsideExpression || node;
            if (seen.has(carrier)) return;
            seen.add(carrier);
            const label = node.textContent.trim();
            if (!label) return;
            const meta = readLinkMeta(node);
            choices.push({
                label,
                onClick: () => clickLiveLink(meta),
            });
            carrier.remove();
        });

        // 5. Tidy: remove now-empty tw-expression wrappers
        subtree.querySelectorAll("tw-expression").forEach((e) => {
            if (!e.textContent.trim()) e.remove();
        });

        // 6. Strip <tw-open-button> (debug widgets)
        subtree.querySelectorAll("tw-open-button").forEach((e) => e.remove());

        return { speaker, mood, html: subtree.innerHTML, choices };
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
            const meta = readLinkMeta(twLink);
            // если у tw-link нет ни passage-name ни data-passage —
            // вытащим из carrier (tw-expression title="[[..|..]]").
            const target = meta.passage ||
                           (readLinkMeta(carrier).passage) ||
                           label;

            const span = document.createElement("span");
            span.className = "inline-link";
            span.dataset.inline = "true";
            span.dataset.passage = target;       // для нашего делегата-клика
            span.dataset.label   = label;
            span.textContent     = label;

            // Replace the carrier element with our span
            carrier.parentNode.replaceChild(span, carrier);
        });
    }

    /**
     * Найти в ЖИВОМ <section> tw-link/a[data-passage], соответствующий
     * элементу из sandbox-копии. Ищем:
     *   1. по passage-name (Harlowe-аттрибут на tw-link)
     *   2. по data-passage
     *   3. по тексту метки
     * Возвращает live-элемент или null.
     */
    function findLiveLink({ passage, label }) {
        // Контракт: ВЕСЬ авторский контент пассажа лежит в <section>.
        // Если section нет — это ошибка автора, кричим в консоль.
        // :not([hidden]) — на случай условных секций (data-if и т.д.).
        const section = document.querySelector("tw-passage section:not([hidden])");
        if (!section) {
            console.error(
                "[main] findLiveLink: внутри <tw-passage> нет видимого <section>! " +
                "Заверни весь авторский текст пассажа в <section>…</section>, " +
                "а если используешь data-if — убедись, что хотя бы одна ветка " +
                "истинна (или добавь <section data-else>)."
            );
            return null;
        }
        if (passage) {
            const esc = cssEscape(passage);
            const byAttr = section.querySelector(
                `tw-link[passage-name="${esc}"], [data-passage="${esc}"]`
            );
            if (byAttr) return byAttr;
        }
        if (label) {
            for (const l of section.querySelectorAll("tw-link, a[data-passage]")) {
                if (l.textContent.trim() === label) return l;
            }
        }
        return null;
    }

    function clickLiveLink(meta) {
        const live = findLiveLink(meta);
        if (!live) {
            console.warn(
                "[main] клик: не нашли live tw-link для",
                meta,
                "— проверь, что в пассаже есть [[" + (meta.label || "…") +
                "|" + (meta.passage || "…") + "]] или соответствующая tw-link " +
                "внутри <tw-passage>."
            );
            return;
        }
        try { live.click(); }
        catch (e) { console.error(e); }
    }

    function readLinkMeta(twLinkOrCarrier) {
        // passage-name на tw-link
        const pn = twLinkOrCarrier.getAttribute && twLinkOrCarrier.getAttribute("passage-name");
        // data-passage (на <a> от convertBracketLinks или на самой tw-expression)
        const dp = twLinkOrCarrier.dataset && twLinkOrCarrier.dataset.passage;
        // фолбэк — из заголовка tw-expression: title="[[Label|Target]]"
        let title = null;
        if (!pn && !dp) {
            const expr = twLinkOrCarrier.closest && twLinkOrCarrier.closest("tw-expression");
            const t = (expr && expr.getAttribute("title")) ||
                      (twLinkOrCarrier.getAttribute && twLinkOrCarrier.getAttribute("title"));
            if (t) {
                const m = t.match(/\[\[([^\]]+?)\]\]/);
                if (m) {
                    const body = m[1];
                    const parts = body.includes("|") ? body.split("|") : [body, body];
                    title = parts[1].trim();
                }
            }
        }
        return {
            passage: pn || dp || title || null,
            label:   twLinkOrCarrier.textContent.trim(),
        };
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

    // Global delegated click for inline-links anywhere in the document.
    // Триггерит .click() на соответствующем live tw-link внутри section.
    let inlineBound = false;
    function bindInlineClick() {
        if (inlineBound) return;
        document.addEventListener("click", (ev) => {
            const link = ev.target.closest && ev.target.closest(".inline-link");
            if (!link) return;
            ev.preventDefault();
            ev.stopPropagation();
            clickLiveLink({
                passage: link.dataset.passage || null,
                label:   link.dataset.label   || link.textContent.trim(),
            });
        });
        inlineBound = true;
    }

    // Boot hook (вызывается из boot.js)
    function start() {
        bindInlineClick();
        init();
        return { watching: !!globalObserver };
    }

    window.Game = window.Game || {};
    window.Game.rewatch  = startWatching;
    window.Game.navigate = navigate;
    window.Game.resync   = syncFromSection;   // ручной триггер для отладки
    window.Game.start    = start;
})();
