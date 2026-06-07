/* ============================================================
   end.js — финальный экран.

   ДОГОВОР:
     • Интерфейс (заголовок «Конец / спасибо что играли», кнопка,
       звёзды, виньетка) живёт в HTML — не трогаем.
     • Карусель фонов — ЕДИНСТВЕННОЕ, что генерим из JS.
       Слайды вставляем в пустой контейнер [data-end-bg].
     • Каждый слайд состоит из ДВУХ слоёв (far + near) — как
       настоящий бэкграунд игры. На каждом слое свой параллакс.

   ВЫЗОВ ИЗ TWINE (в живой игре):
       <<script>>
           end();              // карусель ВСЕХ зареганных bg-фонов
       <</script>>

       <<script>>
           end({ ids: ["castle", "spirit_field"] });   // только эти
       <</script>>

       <<script>>
           end.stop();
       <</script>>

   ВЫЗОВ ИЗ standalone end.html:
       end({
           slides: [
               { far: "url-far.jpg", near: "url-near.png" },
               { far: "url2-far.jpg" }
           ]
       });

   ИСТОЧНИК ФОНОВ (приоритет):
     opts.slides — массив { far, near } или строк (URL → trakts как { far })
     opts.ids    — массив id из bg-registry
     иначе       — ВСЕ ключи window.bg._all (живая игра)
   ============================================================ */
(function () {
    "use strict";

    const CFG = {
        intervalMs: 6500,
        loaderSafetyMs: 6000,
        // Глубины параллакса для слоёв сцены.
        parallaxFar:  6,
        parallaxNear: 18,
    };

    let carouselT    = 0;
    let loaderHidden = false;

    /* ============================================================
       Сбор сцен. Возвращает массив { far, near } объектов.
       ============================================================ */
    function collectScenes(opts) {
        opts = opts || {};

        // 1) Явные slides
        if (Array.isArray(opts.slides) && opts.slides.length) {
            return opts.slides.map(normScene).filter(Boolean);
        }

        // 2) ID из bg-registry или ВСЕ зареганные
        const bg = window.bg;
        if (!bg || !bg._all) {
            console.warn("[end] window.bg не готов — фонов нет.");
            return [];
        }

        const wantIds = Array.isArray(opts.ids) && opts.ids.length
            ? opts.ids
            : Object.keys(bg._all);

        const scenes = [];
        for (const id of wantIds) {
            const entry = bg._all[id];
            if (!entry) {
                console.warn("[end] неизвестный bg id:", id);
                continue;
            }
            if (!entry.far && !entry.near) continue;
            scenes.push({ far: entry.far || null, near: entry.near || null });
        }
        return scenes;
    }

    function normScene(s) {
        if (!s) return null;
        if (typeof s === "string") return { far: s, near: null };
        if (typeof s === "object") {
            if (!s.far && !s.near) return null;
            return { far: s.far || null, near: s.near || null };
        }
        return null;
    }

    /* ============================================================
       Рисуем слайды внутри [data-end-bg]. На каждый слайд — два
       слоя с собственным data-parallax (чтобы параллакс на far и
       near был разной глубины).
       ============================================================ */
    function mountScenes(scenes) {
        const slot = document.querySelector("[data-end-bg]");
        if (!slot) {
            console.error(
                "[end] не нашёл [data-end-bg] внутри [data-end]. " +
                'Проверь end.html — должен быть <div class="end-bg" data-end-bg></div>.'
            );
            return [];
        }
        slot.innerHTML = "";

        if (!scenes.length) {
            console.warn("[end] список фонов пустой — карусель не запустится.");
            const empty = document.createElement("div");
            empty.className = "end-bg__slide end-bg__slide--empty is-active";
            slot.appendChild(empty);
            return [empty];
        }

        return scenes.map((scn, i) => {
            const slide = document.createElement("div");
            slide.className = "end-bg__slide" + (i === 0 ? " is-active" : "");

            if (scn.far) {
                const far = document.createElement("div");
                far.className = "end-bg__layer end-bg__layer--far";
                far.setAttribute("data-parallax", String(CFG.parallaxFar));
                far.style.backgroundImage = `url("${escapeUrl(scn.far)}")`;
                slide.appendChild(far);
            }
            if (scn.near) {
                const near = document.createElement("div");
                near.className = "end-bg__layer end-bg__layer--near";
                near.setAttribute("data-parallax", String(CFG.parallaxNear));
                near.style.backgroundImage = `url("${escapeUrl(scn.near)}")`;
                slide.appendChild(near);
            }

            slot.appendChild(slide);
            return slide;
        });
    }

    function escapeUrl(s) {
        return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    /* ============================================================
       Карусель — переключает .is-active по кругу.
       ============================================================ */
    function startCarousel(slides, intervalMs) {
        if (!slides || slides.length < 2) return;

        let idx = slides.findIndex((s) => s.classList.contains("is-active"));
        if (idx < 0) idx = 0;

        if (carouselT) clearInterval(carouselT);
        carouselT = setInterval(() => {
            const next = (idx + 1) % slides.length;
            slides[idx].classList.remove("is-active");
            slides[next].classList.add("is-active");
            idx = next;
        }, intervalMs);
    }

    /* ============================================================
       LIFECYCLE
       ============================================================ */
    function start(opts) {
        opts = opts || {};

        const root = document.querySelector("[data-end]");
        if (!root) {
            console.error(
                "[end] не нашёл [data-end] в DOM. Вёрстка финала должна быть в HTML."
            );
            return;
        }
        // Если оверлей был спрятан hidden — показываем.
        root.removeAttribute("hidden");

        // Гасим мини-игру, если шла.
        if (window.mini && typeof window.mini.stop === "function" &&
            window.mini.isRunning && window.mini.isRunning()) {
            try { window.mini.stop("end"); } catch (e) { /* пофиг */ }
        }

        // 1. Сцены → DOM.
        const scenes = collectScenes(opts);
        const slides = mountScenes(scenes);

        // 2. Параллакс (он идемпотентный, ре-инит подберёт новые [data-parallax]).
        if (window.parallax && typeof window.parallax.init === "function") {
            try { window.parallax.init(); }
            catch (e) { console.warn("[end] parallax.init упал:", e); }
        }

        // 3. Карусель.
        startCarousel(slides, opts.intervalMs || CFG.intervalMs);

        // 4. Лоадер (только в standalone end.html).
        hideLoaderWhenReady();
    }

    function stop() {
        if (carouselT) { clearInterval(carouselT); carouselT = 0; }
        const slot = document.querySelector("[data-end-bg]");
        if (slot) slot.innerHTML = "";
        const root = document.querySelector("[data-end]");
        if (root) root.setAttribute("hidden", "");
    }

    /* ============================================================
       LOADER
       ============================================================ */
    function hideLoader() {
        if (loaderHidden) return;
        loaderHidden = true;
        const l = document.querySelector("[data-loader]");
        if (!l) return;
        l.classList.add("is-done");
        setTimeout(() => l.remove(), 700);
    }
    function hideLoaderWhenReady() {
        if (!document.querySelector("[data-loader]")) return;
        if (document.readyState === "complete") {
            hideLoader();
        } else {
            window.addEventListener("load", hideLoader, { once: true });
            setTimeout(hideLoader, CFG.loaderSafetyMs);
        }
    }

    /* ============================================================
       EXPOSE
       ============================================================ */
    function endCallable(opts) { start(opts); }
    endCallable.start  = start;
    endCallable.stop   = stop;
    endCallable.config = CFG;
    endCallable.init = function () {
        return { ready: true };
    };

    window.end = endCallable;
})();
