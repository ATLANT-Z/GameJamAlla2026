/* ============================================================
   menu.js — лёгкий boot главного меню.
   Делает четыре вещи:
     1. Прячет лоадер, когда window догрузил CSS / JS / картинки
        (window.load fires после всех link[rel=stylesheet] и img).
     2. Будит параллакс (window.parallax.init из того же модуля,
        что и в основной игре).
     3. Кнопки: "Играть" → index.html, "Титры" → оверлей, "Назад".
     4. Слушает pageshow с event.persisted (возврат через back-button
        из bfcache — JS не перезапускается, и стандартный path не
        срабатывает; pageshow единственное, что приходит).

   Публичное API (window.menu):
       menu.check()      — насильно проверить готовность и спрятать
                           лоадер прямо сейчас. Безопасен к повторным
                           вызовам.
       menu.hideLoader() — алиас для check(), если так понятнее.
   ============================================================ */
(function () {
    "use strict";

    const $ = (sel) => document.querySelector(sel);

    /* ---------- LOADER ---------- */
    let loaderHidden = false;

    // Если лоадер вдруг снова появился в DOM (например bfcache
    // восстановил старое состояние страницы), сбросим флаг — чтоб
    // hideLoader смог его опять снять.
    function resetIfReappeared() {
        if (loaderHidden && document.querySelector("[data-loader]")) {
            loaderHidden = false;
        }
    }

    function hideLoader() {
        resetIfReappeared();
        if (loaderHidden) return;
        const l = $("[data-loader]");
        if (!l) {
            // лоадера и так нет — считаем что готово
            loaderHidden = true;
            return;
        }
        loaderHidden = true;
        l.classList.add("is-done");
        // снять ноду после фейда (transition 600ms)
        setTimeout(() => {
            if (l && l.parentNode) l.parentNode.removeChild(l);
        }, 700);
    }

    // Публичный хэндл — вызывай руками из <script>menu.check();</script>
    // если автоматика не сработала (например на bfcache restore).
    // Безопасен к повторам — внутри стоит idempotent-гард.
    function check() {
        hideLoader();
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

    // bfcache: пользователь нажал "назад" из end.html / index.html, и
    // браузер восстановил menu.html из кэша. JS не перезапускается,
    // `load` не фурычит — а лоадер мог восстановиться видимым.
    // pageshow с event.persisted === true — единственный сигнал.
    window.addEventListener("pageshow", (ev) => {
        if (ev.persisted) hideLoader();
    });

    /* ---------- EXPOSE ---------- */
    window.menu = Object.assign(window.menu || {}, {
        check,
        hideLoader: check,   // алиас, чтоб не путаться
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
