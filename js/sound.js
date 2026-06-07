/* ============================================================
   sound.js — звуковой модуль.

   ============================================================
   РЕГИСТРАЦИЯ — в GameConfig.sounds (см. boot.js):

       sounds: {
           thunder: { src: "audio/thunder.mp3", volume: .8 },
           ambient: { src: "audio/forest.mp3", volume: .3, loop: true },
           step:    "audio/step.wav"  // короткая форма — только src
       }

   ============================================================
   API:

       sound.play("thunder")                 // одиночный
       sound.play(["a", "b", "c"])           // по очереди
       sound.play("ambient", {loop: true})   // зациклить
       sound.play("ambient", {volume: .5})   // громкость на этот раз

       sound.stop("ambient")                 // остановить ВСЕ экземпляры id
       sound.stopAll()                       // глушим всё
       sound.isPlaying("ambient") → boolean
       sound.setVolume(0.5)                  // мастер-громкость 0..1

   ============================================================
   ВЫЗОВ ИЗ СЦЕНАРИЯ Twine:

       ЗВУК: thunder @@@                    // одна реплика — играем и идём дальше
       ЗВУК: thunder, lightning @@@         // несколько — по очереди

       (Реплика-«звук» не показывается в диалоге, а сразу
       вызывается sound.play() и парсер переходит к следующей.)

   ============================================================
   ДЕТАЛИ ПОВЕДЕНИЯ:
     • Один и тот же id можно играть параллельно — это нужно для SFX
       (например пять шагов подряд). Каждый play() создаёт новый Audio.
     • loop: true — ограничен ОДНИМ экземпляром на id (бессмысленно
       крутить две одинаковые музыки). Повторный play() с loop в это
       время — no-op.
     • Браузеры блокируют autoplay до первого user-клика. Если play()
       отклонён — просто warn в консоль, остальная логика не падает.
     • Громкость = entry.volume * masterVolume. masterVolume по умолч. 1.
   ============================================================ */
(function () {
    "use strict";

    const REGISTRY = Object.create(null); // id → { src, volume, loop }
    const ACTIVE   = Object.create(null); // id → Set<HTMLAudioElement>

    let masterVolume = 1.0;

    /* ============================================================
       REGISTER
       ============================================================ */
    function register(id, cfg) {
        if (!id) {
            console.warn("[sound.register] id обязателен");
            return;
        }
        // Короткая форма: register("step", "audio/step.wav")
        if (typeof cfg === "string") cfg = { src: cfg };
        if (!cfg || !cfg.src) {
            console.warn("[sound.register] нужен src:", id, cfg);
            return;
        }
        REGISTRY[id] = {
            src:    cfg.src,
            volume: (cfg.volume !== undefined) ? clamp01(+cfg.volume) : 1.0,
            loop:   !!cfg.loop,
        };
    }

    /* ============================================================
       PLAY — одиночный или очередь
       ============================================================ */
    function play(idOrArr, opts) {
        opts = opts || {};
        if (Array.isArray(idOrArr)) {
            return playQueue(idOrArr.slice(), opts);
        }
        return playOne(idOrArr, opts);
    }

    function playOne(id, opts) {
        const entry = REGISTRY[id];
        if (!entry) {
            console.warn("[sound] неизвестный id:", id);
            return null;
        }

        const loop = (opts.loop !== undefined) ? !!opts.loop : entry.loop;
        const baseVol = (opts.volume !== undefined) ? +opts.volume : entry.volume;
        const vol = clamp01(baseVol * masterVolume);

        // Зацикленный — один экземпляр на id. Если уже крутится — ничего не делаем.
        if (loop && ACTIVE[id] && ACTIVE[id].size > 0) {
            return ACTIVE[id].values().next().value;
        }

        const audio = new Audio(entry.src);
        audio.volume = vol;
        audio.loop = loop;
        // Сохраняем "базовую" громкость инстанса (без master), чтобы
        // setVolume() мог пропорционально пересчитать.
        audio.__baseVolume = clamp01(baseVol);

        if (!ACTIVE[id]) ACTIVE[id] = new Set();
        ACTIVE[id].add(audio);

        audio.addEventListener("ended", () => {
            ACTIVE[id].delete(audio);
        });
        audio.addEventListener("error", (e) => {
            ACTIVE[id].delete(audio);
            console.warn("[sound] ошибка воспроизведения:", id, e);
        });

        const p = audio.play();
        if (p && p.catch) {
            p.catch((err) => {
                // Обычно autoplay-блок. Не валим логику.
                console.warn(
                    "[sound] play('" + id + "') отклонён браузером:",
                    err && err.message ? err.message : err
                );
            });
        }
        return audio;
    }

    /* ============================================================
       QUEUE — следующий стартует на 'ended' предыдущего.
       Опции (loop/volume) применяются КО ВСЕМ элементам очереди.
       ============================================================ */
    function playQueue(ids, opts) {
        if (!ids.length) return null;
        const id = ids.shift();
        const audio = playOne(id, opts);
        if (!audio) {
            // Если упало — пробуем следующий, не блокируем цепочку.
            return playQueue(ids, opts);
        }
        if (ids.length) {
            audio.addEventListener("ended", () => playQueue(ids, opts), { once: true });
        }
        return audio;
    }

    /* ============================================================
       STOP
       ============================================================ */
    function stop(id) {
        const set = ACTIVE[id];
        if (!set) return;
        for (const a of set) {
            try { a.pause(); a.currentTime = 0; } catch (e) { /* пофиг */ }
        }
        set.clear();
    }
    function stopAll() {
        Object.keys(ACTIVE).forEach(stop);
    }

    /* ============================================================
       INTROSPECTION
       ============================================================ */
    function isPlaying(id) {
        return !!(ACTIVE[id] && ACTIVE[id].size > 0);
    }

    /* ============================================================
       VOLUME
       ============================================================ */
    function setVolume(v) {
        masterVolume = clamp01(+v);
        // Перепроставляем громкость у уже играющих, пропорционально базе.
        Object.values(ACTIVE).forEach((set) => {
            set.forEach((a) => {
                const base = (a.__baseVolume !== undefined) ? a.__baseVolume : 1;
                a.volume = clamp01(base * masterVolume);
            });
        });
    }

    function clamp01(v) {
        v = +v;
        if (!isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
    }

    /* ============================================================
       EXPOSE
       ============================================================ */
    window.sound = Object.assign(window.sound || {}, {
        register,
        play,
        stop,
        stopAll,
        isPlaying,
        setVolume,
        masterVolume: () => masterVolume,
        _registry: REGISTRY,
        init() {
            return { registered: Object.keys(REGISTRY) };
        },
    });
})();
