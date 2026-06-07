/* ============================================================
   sound.js — звуковой модуль (один на музыку + SFX).

   ============================================================
   РЕГИСТРАЦИЯ — в GameConfig.sounds (см. boot.js):

       sounds: {
           thunder: { src: "audio/thunder.mp3", volume: .8 },
           ambient: { src: "audio/forest.mp3",  volume: .3, loop: true },
           step:    "audio/step.wav"            // короткая форма
       }

   ============================================================
   API:

       --- SFX (одноразовые звуки, играют параллельно) ---
       sound.play("sword")                    // одиночный
       sound.play(["a","b","c"])              // очередь
       sound.play("amb", {loop: true})        // зациклить
       sound.play("amb", {volume: .5})
       sound.play("amb", {fadeIn: 800})       // плавный въезд (мс)

       sound.stop("amb")                      // мгновенно
       sound.stop("amb", {fadeMs: 600})       // с затуханием громкости
       sound.stopAll()
       sound.stopAll({fadeMs: 400})

       sound.isPlaying("amb") → boolean
       sound.setVolume(0.5)                   // мастер 0..1

       --- MUSIC (МНОГОСЛОТОВЫЙ, авто-crossfade в каждом слоте) ---
       sound.music("forest")                          // слот "main"
       sound.music("forest", "main")                  // эквивалент (shorthand)
       sound.music("wind",  { slot: "wind" })         // отдельный слот "wind"
       sound.music("battle")                          // crossfade в main (wind не трогаем)

       sound.music("forest", {fade: 1500})            // фейд 1.5 сек
       sound.music("forest", {fadeIn: 1200, fadeOut: 600})

       sound.stopMusic()                              // погасить "main"
       sound.stopMusic("wind")                        // погасить слот "wind"
       sound.stopAllMusic()                           // погасить ВСЕ слоты
       sound.stopMusic("wind", {fade: 0})             // мгновенно

       sound.currentMusic()       → "forest"          // что в "main"
       sound.currentMusic("wind") → "s_wind_leafs"
       sound.currentMusic("all")  → { main:"forest", wind:"s_wind_leafs" }

   ============================================================
   ВЫЗОВ ИЗ СЦЕНАРИЯ Twine:

       ЗВУК: thunder @@@                     // SFX (играет параллельно с музыкой)
       ЗВУК: a, b, c @@@                     // SFX по очереди

       МУЗЫКА: forest @@@                    // слот "main", crossfade
       МУЗЫКА.wind: s_wind_leafs @@@         // отдельный слот "wind"
       МУЗЫКА: stop @@@                      // погасить main с fade
       МУЗЫКА.wind: stop @@@                 // погасить wind
       МУЗЫКА: stop all @@@                  // погасить ВСЕ слоты
       МУЗЫКА: - @@@                         // алиас для stop

       (Реплики "ЗВУК:" / "МУЗЫКА:" не показываются в диалоге —
        это команды звуковому модулю, парсер сразу идёт дальше.)

   ============================================================
   ПОВЕДЕНИЕ:
     • Один id можно играть параллельно несколько раз (SFX).
     • loop: true — singleton на id (повторный play() = no-op).
     • Музыкальный слот — ОДИН. sound.music("a") → sound.music("b")
       автоматом делает crossfade: a fade-out + b fade-in.
     • Громкость = entry.volume * masterVolume.
     • При fadeOut объект Audio после нуля паузится и удаляется
       из ACTIVE. fadeIn стартует с 0 и доезжает до целевой громкости.
   ============================================================ */
(function () {
    "use strict";

    const REGISTRY = Object.create(null); // id → { src, volume, loop }
    const ACTIVE   = Object.create(null); // id → Set<HTMLAudioElement>

    let masterVolume = 1.0;
    // Многослотовый учёт музыки: имя слота → id текущего трека в нём.
    // По умолчанию работаем со слотом "main".
    const currentMusic = Object.create(null);

    const MUSIC_DEFAULT_FADE = 800;       // мс по умолчанию для crossfade
    const MUSIC_DEFAULT_SLOT = "main";

    /* ============================================================
       REGISTER
       ============================================================ */
    function register(id, cfg) {
        if (!id) {
            console.warn("[sound.register] id обязателен");
            return;
        }
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
       FADE — плавная анимация громкости через rAF.
       Сохраняем версию операции на инстансе, чтоб новый fade
       автоматически отменял предыдущий (без cancelAnimationFrame).
       ============================================================ */
    function fadeAudio(audio, toVol, durationMs, onDone) {
        if (!audio) return;
        const from = +audio.volume || 0;
        const to   = clamp01(toVol);
        if (durationMs <= 0 || Math.abs(to - from) < 0.001) {
            audio.volume = to;
            if (onDone) onDone();
            return;
        }
        const myToken = (audio.__fadeToken || 0) + 1;
        audio.__fadeToken = myToken;
        const startT = performance.now();
        function step(now) {
            if (audio.__fadeToken !== myToken) return; // отменили
            const t = Math.min(1, (now - startT) / durationMs);
            audio.volume = clamp01(from + (to - from) * t);
            if (t < 1) {
                requestAnimationFrame(step);
            } else if (onDone) {
                onDone();
            }
        }
        requestAnimationFrame(step);
    }

    /* ============================================================
       PLAY
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

        const loop    = (opts.loop !== undefined) ? !!opts.loop : entry.loop;
        const baseVol = (opts.volume !== undefined) ? +opts.volume : entry.volume;
        const targetVol = clamp01(baseVol * masterVolume);
        const fadeIn = Math.max(0, +opts.fadeIn || 0);

        // Зацикленный — один экземпляр на id. Уже крутится — ничего не делаем.
        if (loop && ACTIVE[id] && ACTIVE[id].size > 0) {
            return ACTIVE[id].values().next().value;
        }

        const audio = new Audio(entry.src);
        audio.loop = loop;
        audio.__baseVolume = clamp01(baseVol);

        if (fadeIn > 0) {
            audio.volume = 0;
        } else {
            audio.volume = targetVol;
        }

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
                console.warn(
                    "[sound] play('" + id + "') отклонён браузером:",
                    err && err.message ? err.message : err
                );
            });
        }

        if (fadeIn > 0) {
            fadeAudio(audio, targetVol, fadeIn);
        }
        return audio;
    }

    function playQueue(ids, opts) {
        if (!ids.length) return null;
        const id = ids.shift();
        const audio = playOne(id, opts);
        if (!audio) {
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
    function stop(id, opts) {
        opts = opts || {};
        const fadeMs = Math.max(0, +opts.fadeMs || 0);
        const set = ACTIVE[id];
        if (!set || set.size === 0) return;

        // Если этот id занят каким-нибудь music-слотом — отвязываем.
        for (const slot of Object.keys(currentMusic)) {
            if (currentMusic[slot] === id) delete currentMusic[slot];
        }

        if (fadeMs === 0) {
            for (const a of set) {
                try { a.pause(); a.currentTime = 0; } catch (e) {}
            }
            set.clear();
            return;
        }

        for (const a of Array.from(set)) {
            fadeAudio(a, 0, fadeMs, () => {
                try { a.pause(); a.currentTime = 0; } catch (e) {}
                set.delete(a);
            });
        }
    }

    function stopAll(opts) {
        Object.keys(ACTIVE).forEach((id) => stop(id, opts));
    }

    /* ============================================================
       MUSIC — многослотовая. Каждый слот держит ОДИН трек одновременно,
       crossfade между треками одного слота. Разные слоты не дерутся:
       можно крутить "main" (m_forest_light) + "wind" (s_wind_leafs) +
       что угодно ещё одновременно.

       Сигнатуры:
           music("id")                      // слот "main"
           music("id", "slot")              // shorthand: 2-й аргумент = slot
           music("id", { slot, fade, fadeIn, fadeOut, volume, loop })
       ============================================================ */
    function music(id, opts) {
        // shorthand: music("id", "slotName")
        if (typeof opts === "string") opts = { slot: opts };
        opts = opts || {};

        const slot = opts.slot || MUSIC_DEFAULT_SLOT;

        // Команды "выключить" → совместимость с МУЗЫКА: stop / - / off
        if (id === null || id === "" ||
            id === "stop" || id === "-" || id === "off") {
            return stopMusicSlot(slot, opts);
        }

        const fadeMs  = (opts.fade    !== undefined) ? +opts.fade    : MUSIC_DEFAULT_FADE;
        const fadeIn  = (opts.fadeIn  !== undefined) ? +opts.fadeIn  : fadeMs;
        const fadeOut = (opts.fadeOut !== undefined) ? +opts.fadeOut : fadeMs;
        // loop по умолч. true — это всё-таки музыка.
        const loop    = (opts.loop    !== undefined) ? !!opts.loop   : true;

        if (currentMusic[slot] === id) {
            // тот же трек в этом слоте — игнор
            return ACTIVE[id] && ACTIVE[id].values().next().value;
        }

        const prev = currentMusic[slot];

        // Снимаем предыдущий трек этого слота с fade-out. stop() сам
        // вычистит запись из currentMusic, поэтому сначала глушим, потом
        // ставим новый id.
        if (prev) stop(prev, { fadeMs: fadeOut });
        currentMusic[slot] = id;

        return play(id, {
            loop,
            volume: opts.volume,
            fadeIn,
        });
    }

    /* ============================================================
       STOP MUSIC — по слоту или сразу все.
           stopMusic()                 // слот "main"
           stopMusic("wind")           // слот "wind"
           stopMusic("all")            // ВСЕ слоты
           stopMusic({fade: 0})        // мгновенно слот "main"
           stopMusic("wind", {fade:0}) // мгновенно "wind"
       ============================================================ */
    function stopMusic(slotOrOpts, opts) {
        // Сигнатура: stopMusic() / stopMusic("wind") / stopMusic({fade:0})
        if (slotOrOpts && typeof slotOrOpts === "object") {
            opts = slotOrOpts;
            slotOrOpts = MUSIC_DEFAULT_SLOT;
        }
        const slot = slotOrOpts || MUSIC_DEFAULT_SLOT;
        opts = opts || {};
        if (slot === "all" || slot === "*") return stopAllMusic(opts);
        return stopMusicSlot(slot, opts);
    }

    function stopMusicSlot(slot, opts) {
        const fadeMs = (opts && opts.fade !== undefined) ? +opts.fade : MUSIC_DEFAULT_FADE;
        const id = currentMusic[slot];
        if (!id) return;
        delete currentMusic[slot];
        stop(id, { fadeMs });
    }

    function stopAllMusic(opts) {
        const fadeMs = (opts && opts.fade !== undefined) ? +opts.fade : MUSIC_DEFAULT_FADE;
        for (const slot of Object.keys(currentMusic)) {
            const id = currentMusic[slot];
            delete currentMusic[slot];
            if (id) stop(id, { fadeMs });
        }
    }

    /* currentMusic("slot") → id | null
       currentMusic("all")  → { slot: id, ... }
       currentMusic()       → id в слоте "main" | null               */
    function currentMusicFn(slot) {
        if (slot === "all" || slot === "*") {
            return Object.assign({}, currentMusic);
        }
        return currentMusic[slot || MUSIC_DEFAULT_SLOT] || null;
    }

    /* ============================================================
       INTROSPECTION / VOLUME
       ============================================================ */
    function isPlaying(id) {
        return !!(ACTIVE[id] && ACTIVE[id].size > 0);
    }

    function setVolume(v) {
        masterVolume = clamp01(+v);
        Object.values(ACTIVE).forEach((set) => {
            set.forEach((a) => {
                const base = (a.__baseVolume !== undefined) ? a.__baseVolume : 1;
                // мгновенная коррекция без fade — это master-tweak
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
        music,
        stopMusic,
        stopAllMusic,
        currentMusic: currentMusicFn,
        isPlaying,
        setVolume,
        masterVolume: () => masterVolume,
        _registry: REGISTRY,
        init() {
            return { registered: Object.keys(REGISTRY) };
        },
    });
})();
