/* ============================================================
   parallax.js — mouse / gyro-driven layered parallax (CSS-var only)
   We never touch element.style.transform: instead we publish two
   custom properties (--px, --py) and let each block compose them
   with its own layout transforms via CSS.

   Each element opts in with:  data-parallax="<depth-in-px>"

   Mobile rules:
     • На touch-устройствах мышь ИГНОРИРУЕМ полностью — клики/тапы
       синтезируют один mousemove в точке тапа и параллакс прыгал.
     • Из deviceorientation учитываем поворот экрана: в landscape
       beta/gamma надо менять местами и местами инвертировать,
       иначе наклон вверх-вниз воспринимается как лево-право.
   ============================================================ */

(function () {
    "use strict";

    const target  = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let elements  = [];

    // Touch device? Тогда мышиный обработчик не вешаем вообще, чтобы
    // синтетический mousemove от тапа не дёргал параллакс.
    const isTouch =
        (typeof window.matchMedia === "function" &&
            window.matchMedia("(pointer: coarse)").matches) ||
        ("ontouchstart" in window) ||
        (navigator.maxTouchPoints || 0) > 0;

    // Возврат к нулю, когда событий не было (пользователь убрал
    // палец / устройство неподвижно). Гасим target плавно.
    let lastInputTs = 0;
    const IDLE_DECAY_MS = 600;

    function collect() {
        elements = Array.from(document.querySelectorAll("[data-parallax]")).map((el) => ({
            el,
            depth: parseFloat(el.dataset.parallax) || 0,
        }));
    }

    function onMouseMove(ev) {
        const cx = window.innerWidth  / 2;
        const cy = window.innerHeight / 2;
        target.x = (ev.clientX - cx) / cx; // -1..1
        target.y = (ev.clientY - cy) / cy;
        lastInputTs = performance.now();
    }

    /* ============================================================
       Touch — палец двигается по экрану → параллакс едет за ним,
       как за мышью. Берём ПЕРВЫЙ касающийся палец, остальные
       (мультитач, пинч-зум) игнорируем. На touchend параллакс
       плавно возвращается к нулю через idle-decay в tick().

       passive: true — не блокируем нативные жесты (скролл, тап
       по кнопке, свайп карты в мини-игре).
       ============================================================ */
    function onTouchMove(ev) {
        if (!ev.touches || !ev.touches[0]) return;
        const t = ev.touches[0];
        const cx = window.innerWidth  / 2;
        const cy = window.innerHeight / 2;
        target.x = (t.clientX - cx) / cx;
        target.y = (t.clientY - cy) / cy;
        lastInputTs = performance.now();
    }

    /* ============================================================
       Возвращает текущий угол поворота экрана (0, 90, 180, -90/270).
       Современное API — screen.orientation.angle, легаси — window.orientation.
       ============================================================ */
    function screenAngle() {
        if (window.screen && screen.orientation && typeof screen.orientation.angle === "number") {
            return screen.orientation.angle;
        }
        if (typeof window.orientation === "number") {
            return window.orientation;
        }
        return 0;
    }

    /* ============================================================
       deviceorientation:
         ev.beta  — наклон вперёд/назад (вокруг X-оси устройства)
         ev.gamma — крен влево/вправо   (вокруг Y-оси устройства)
       Эти оси привязаны к корпусу телефона, а не к экрану. Если игра
       идёт в горизонтальной ориентации, пользователь видит экран
       повёрнутым на 90°, и beta для него — это «лево-право», а gamma —
       «вверх-вниз». Маппим по углу экрана.
       ============================================================ */
    function onOrient(ev) {
        if (ev == null) return;
        const beta  = ev.beta;
        const gamma = ev.gamma;
        if (beta == null || gamma == null) return;

        let inputX, inputY;
        switch (screenAngle()) {
            case 90:   // landscape, низ устройства смотрит влево
                inputX = beta;
                inputY = -gamma;
                break;
            case -90:
            case 270:  // landscape, низ устройства смотрит вправо
                inputX = -beta;
                inputY = gamma;
                break;
            case 180:  // portrait вверх ногами
                inputX = -gamma;
                inputY = -beta;
                break;
            case 0:
            default:   // portrait как есть
                inputX = gamma;
                inputY = beta;
        }

        // Нормируем в диапазон [-1..1]. 30° наклона ≈ предел.
        const TILT_MAX = 30;
        target.x = Math.max(-1, Math.min(1,  inputX / TILT_MAX));
        target.y = Math.max(-1, Math.min(1,  inputY / TILT_MAX));
        lastInputTs = performance.now();
    }

    function tick(now) {
        // Idle decay — ТОЛЬКО на touch-устройствах. На десктопе курсор
        // всегда висит где-то на экране, поэтому «возврат в центр» там
        // выглядит как самопроизвольное движение фона. На мобилке палец
        // отрывается → надо плавно вернуть параллакс к (0,0).
        if (isTouch && now - lastInputTs > IDLE_DECAY_MS) {
            target.x *= 0.92;
            target.y *= 0.92;
            if (Math.abs(target.x) < 0.001) target.x = 0;
            if (Math.abs(target.y) < 0.001) target.y = 0;
        }

        current.x += (target.x - current.x) * 0.08;
        current.y += (target.y - current.y) * 0.08;

        for (let i = 0; i < elements.length; i++) {
            const { el, depth } = elements[i];
            // Read the *current* depth attribute — sprites.js may rewrite
            // this for NPCs as they shuffle their stack position.
            const d = parseFloat(el.dataset.parallax);
            const eff = Number.isFinite(d) ? d : depth;
            el.style.setProperty("--px", (-current.x * eff).toFixed(2) + "px");
            el.style.setProperty("--py", (-current.y * eff).toFixed(2) + "px");
        }

        requestAnimationFrame(tick);
    }

    function init() {
        collect();

        // Мышь — ТОЛЬКО на не-touch. На мобилках синтетический mousemove от
        // тапа резко смещает target и параллакс «дёргается». Между сессиями
        // окно браузера может переключаться (devtools, симулятор), но
        // matchMedia("(pointer: coarse)") умеет отвечать «horse» там, где
        // реальная мышка есть.
        if (!isTouch) {
            window.addEventListener("mousemove", onMouseMove, { passive: true });
        } else {
            // На touch — параллакс едет за пальцем. passive:true критично:
            // иначе блокируем нативный скролл и свайп карты в мини-игре.
            window.addEventListener("touchmove",  onTouchMove,  { passive: true });
            window.addEventListener("touchstart", onTouchMove,  { passive: true });
            // touchend не сбрасываем target вручную — это сделает idle-decay
            // в tick(), плавно возвращая параллакс к (0,0) за ~0.6 сек покоя.
        }

        // Гироскоп — слушаем всегда. На iOS 13+ нужно явное разрешение
        // (DeviceOrientationEvent.requestPermission), но это требует
        // user-gesture: запрашиваем при первом tap-е, если API есть.
        if (typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function") {
            const requestGyro = () => {
                DeviceOrientationEvent.requestPermission()
                    .then((state) => {
                        if (state === "granted") {
                            window.addEventListener("deviceorientation", onOrient);
                        }
                    })
                    .catch(() => {});
                document.removeEventListener("touchend", requestGyro);
                document.removeEventListener("click",    requestGyro);
            };
            document.addEventListener("touchend", requestGyro, { once: true });
            document.addEventListener("click",    requestGyro, { once: true });
        } else {
            window.addEventListener("deviceorientation", onOrient);
        }

        // Pick up new sprites/NPCs that mount later
        const observer = new MutationObserver((muts) => {
            let dirty = false;
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType === 1) {
                        if ((n.hasAttribute && n.hasAttribute("data-parallax"))
                            || (n.querySelector && n.querySelector("[data-parallax]"))) {
                            dirty = true; break;
                        }
                    }
                }
                if (dirty) break;
            }
            if (dirty) collect();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        requestAnimationFrame(tick);
    }

    window.parallax = Object.assign(window.parallax || {}, {
        refresh: collect,
        init,
        // Для отладки на месте
        _isTouch: () => isTouch,
        _angle: screenAngle,
    });
})();
