/* ============================================================
   menu.js — лёгкий boot главного меню.
   Делает три вещи:
     1. Прячет лоадер, когда window догрузил CSS / JS / картинки
        (window.load fires после всех link[rel=stylesheet] и img).
     2. Будит параллакс (window.parallax.init из того же модуля,
        что и в основной игре).
     3. Кнопки: "Играть" → index.html, "Титры" → оверлей, "Назад".
   ============================================================ */
(function () {
    "use strict";

    const $ = (sel) => document.querySelector(sel);

    /* ---------- LOADER ---------- */
    let loaderHidden = false;
    function hideLoader() {
        if (loaderHidden) return;
        loaderHidden = true;
        const l = $("[data-loader]");
        if (!l) return;
        l.classList.add("is-done");
        // снять ноду после фейда (transition 600ms)
        setTimeout(() => l.remove(), 700);
    }

    /* ---------- CREDITS ---------- */
    function setCredits(visible) {
        const c = $("[data-credits]");
        if (!c) return;
        c.classList.toggle("is-visible", visible);
        c.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    /* ---------- NAV ---------- */
    function onClick(ev) {
        const target = ev.target.closest("[data-action]");
        if (!target) return;
        switch (target.dataset.action) {
            case "play":
                // основной игре нужна index.html
                // location.href = "index.html";
                break;
            case "credits":
                setCredits(true);
                break;
            case "credits-back":
                setCredits(false);
                break;
            default:
                console.warn("[menu] неизвестное action:", target.dataset.action);
        }
    }

    function onKey(ev) {
        // Escape закрывает титры
        if (ev.key === "Escape") setCredits(false);
    }

    /* ---------- BOOT ---------- */
    function boot() {
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);

        // Параллакс — собирает все [data-parallax] и катает --px/--py.
        if (window.parallax && typeof window.parallax.init === "function") {
            try { window.parallax.init(); }
            catch (e) { console.warn("[menu] parallax.init упал:", e); }
        } else {
            console.warn("[menu] window.parallax не найден — забыл подключить parallax.js?");
        }

        // Лоадер: ждём window.load (после всех CSS/JS/картинок).
        // Если уже complete — снимаем сразу.
        if (document.readyState === "complete") {
            hideLoader();
        } else {
            window.addEventListener("load", hideLoader);
            // safety net: если что-то застряло, снимем через 6 секунд
            setTimeout(hideLoader, 6000);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
