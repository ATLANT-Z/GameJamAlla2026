/* ============================================================
   boot.js — единственная точка входа игры.

   Каждый модуль (registry, config, bg, gg, npc, hp, dialog,
   mini, speakers, main) экспортит .init(). boot.js зовёт их в
   правильном порядке, логирует результат и кричит в консоль,
   если кого-то не хватает.

   Порядок важен:
     1. registry  — сидим default-плейсхолдеры до того, как
                    кто-либо попросит спрайт/фон.
     2. config    — applyConfig(GameConfig): юзерский контент
                    регистрируется поверх плейсхолдеров.
     3. bg / gg / npc / hp / mini — verify-only.
     4. dialog    — биндит делегированный click на диалог.
     5. speakers  — биндит слушатель dialog:line.
     6. main      — стартует MutationObserver за <section>.
   ============================================================ */
(function () {
    "use strict";

    /* ============================================================
   game-config.js — CONTENT registry.
   Edit this file to register backgrounds, character emotions and
   mini-games. Everything here is applied at boot by Game.applyConfig().

   Sprites:
       sprites: {
           aurora: {
               neutral: "img/aurora_neutral.png",
               sad:     "img/aurora_sad.png",
               // animated emotion → object form
               fade:    { src: "img/aurora_fade_sheet.png",
                          anim: { frames: 6, fps: 8 } },
           },
           knight: { neutral: "...", sad: "..." },
       }

   Backgrounds:
       backgrounds: {
           castle_throne: { far: "img/castle_far.jpg",
                            near: "img/castle_near.png" },
       }

   Minis (referenced by id):
       minis: {
           tutorial1: {
               // Полная форма шкалы: { id, icon, label, value }.
               // Короткая (для последующих туториалов): bars: ["hp", "wisdom", ...]
               // — иконка/название/значение подхватываются из BAR_STORE.
               bars: [ { id, icon, label, value } x4 ],
               cards: [
                   {
                       id, art, text,
                       // Реакции описываются per-свайп: left / right / outcome,
                       // а не на всю карточку. Любой из этих трёх ключей —
                       // отдельный исход свайпа в свою сторону.
                       //
                       //   left:    { label, delta: {barId: ±N, ...}, reaction, onSwipe? }
                       //   right:   { label, delta, reaction, onSwipe? }
                       //   outcome: { label, delta, reaction, onSwipe? }
                       //     // single-outcome: куда ни тяни — один исход.
                       //     // label показывается в обеих боковых подсказках.
                       //
                       // label    — текст в .mini__side во время свайпа.
                       // reaction — мысль Авроры после коммита (bubble снизу).
                       // onSwipe  — (state) => "cardId" | null. Прыжок на конкретную
                       //            следующую карточку. Нет id — warn + дальше по массиву.
                       when: (state) => boolean,  // optional show-condition
                   },
                   ...
               ],
           },
       }

   Call from Twine:
       <<script>>
           bg.set("castle_throne");
           npc.show("knight", "sad");
           mini.start("tutorial1");
       <</script>>
   ============================================================ */
    window.GameConfig = {
        backgrounds: {
            castle: {
                far: "https://ik.imagekit.io/atlantz/jam/castle_far.jpg",
                near: "https://ik.imagekit.io/atlantz/jam/castle_near.png",
            },
            forest: {
                far: "https://ik.imagekit.io/atlantz/jam/forest_far.png",
                near: "https://ik.imagekit.io/atlantz/jam/forest_near.png",
            }
            // override defaults by providing your own urls — for now the
            // registry-seeded SVG placeholders are used.
        },

        sprites: {
            aurora: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_neutral.png",
                dress: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_dress.png",
            },
            councilor: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/councilor/councilor_neutral2.png",
            },
            king: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/king/king_neutral.png",
                mad: "https://ik.imagekit.io/atlantz/jam/c/king/king_mad.png"
            },
            // Override / extend emotions here. Example:
            // aurora: { dreamy: "img/aurora_dreamy.png" },
            knight: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/knight/knight_neutral.png",
                // proud: "img/knight_proud.png"
            },
            maid: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/maid/maid_neutral.png",
            },
            cat: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/cat/cat_neutral.png",
            },
        },

        /* ------------------------------------------------------------
           npcByName — карта "ИМЯ говорящего в Twine" → "family-ключ NPC".
           Когда в пассаже встречается строка "ИМЯ: текст…@@@", модуль
           speakers.js ищет имя здесь и зовёт npc.show(family, "neutral").
           ------------------------------------------------------------ */
        npcByName: {
            "ЧЛЕН СОВЕТА": "councilor",
            "ОТЕЦ": "king",
            "ЛАНСЕЛОТ": "knight",
            "МАРИЯ": "maid",
            "ФАУСТ": "cat",
        },

        minis: {
            /* ---------- TUTORIAL ---------- */
            tutorial1: {
                bars: [
                    {id: "hp", icon: "❤", label: "связь", value: 100},
                    {id: "wisdom", icon: "✦", label: "мудрость", value: 20},
                    {id: "pride", icon: "♛", label: "гордыня", value: 80},
                    {id: "council", icon: "⚖", label: "совет", value: 50},
                ],
                cards: [
                    {
                        id: "taxes",
                        art: "💰",
                        text: "Поднять налоги? Или прислушаться к совету?",
                        left: {
                            label: "Поднять", delta: {pride: +10, wisdom: -5, council: -20, hp: -5},
                            reaction: "Я знаю что лучше. Я ведь принцесса!"
                        },
                        right: {
                            label: "Прислушаться", delta: {pride: -10, wisdom: +15, council: +15},
                            reaction: "Может, в этот раз они правы…"
                        },
                    },
                    {
                        id: "bread",
                        art: "🥖",
                        text: "Крестьяне голодают. Что делать?",
                        left: {
                            label: "Пусть едят пирожные", delta: {pride: +5, wisdom: -10, council: -15, hp: -10},
                            reaction: "А разве это не одно и то же?"
                        },
                        right: {
                            label: "Открыть закрома", delta: {pride: -5, wisdom: +10, council: +10},
                            reaction: "Иногда даже принцесса должна делиться."
                        },
                    },
                    {
                        id: "advisor",
                        art: "📜",
                        text: "Советник предлагает план. Послушать?",
                        left: {
                            label: "Перебить", delta: {pride: +8, wisdom: -8, council: -10, hp: -5},
                            reaction: "У меня свои идеи."
                        },
                        right: {
                            label: "Выслушать", delta: {pride: -8, wisdom: +12, council: +10},
                            reaction: "Возможно, я не всё знаю."
                        },
                    },
                    {
                        id: "father",
                        art: "👑",
                        text: "Отец просит подумать о подданных. Ответить?",
                        left: {
                            label: "Закатить глаза", delta: {pride: +5, wisdom: -5, council: -10, hp: -15},
                            reaction: "Опять эти нравоучения!"
                        },
                        right: {
                            label: "Подумать", delta: {pride: -10, wisdom: +20, council: +5},
                            reaction: "…может, он прав."
                        },
                    },
                ],
            },

            /* ---------- TUTORIAL 2 — разговор с отцом про варваров ----------
               Демонстрирует:
                 1. bars: ["hp", ...] — короткая запись, значения подхватываются
                    из предыдущей мини-игры (BAR_STORE внутри mini.js).
                 2. outcome: {...} — карточка без выбора. Куда ни тяни — один и
                    тот же исход. На карте появляется маркер ↔.
                 3. onSwipe(state) → "cardId" — необязательный прыжок на конкретную
                    следующую карточку. Если id нет в колоде — warn + дальше по
                    массиву. См. закомментированный пример внутри father_safety.
               -------------------------------------------------------------- */
            tutorial2: {
                bars: ["hp", "wisdom", "pride", "council"],
                cards: [
                    {
                        id: "father_war",
                        art: "👑",
                        text: "Предположим, варвары угрожают одной из наших провинций. Что ты сделаешь?",
                        outcome: {
                            label: "Отправлю рыцарей!",
                            delta: {pride: +10, wisdom: -5, council: -5},
                            reaction: "Да побольше!",
                        },
                    },
                    {
                        id: "father_howmany",
                        art: "⚔",
                        text: "Сколько рыцарей ты отправишь?",
                        outcome: {
                            label: "Всех!",
                            delta: {pride: +10, council: -10, hp: -5},
                        },
                    },
                    {
                        id: "father_tactic",
                        art: "🗺",
                        text: "Аврора, варваров много. Какова твоя тактика?",
                        outcome: {
                            label: "Пришёл, увидел, победил",
                            delta: {wisdom: -15, pride: +10, council: -10},
                            reaction: "Зачем тактика?",
                        },
                    },
                    {
                        id: "father_safety",
                        art: "🛡",
                        text: "Это невозможно. Ты думаешь о безопасности своих людей?",
                        outcome: {
                            label: "Они рождены, чтобы служить короне. Ты просто слаб!",
                            delta: {wisdom: -10, pride: +15, council: -15, hp: -10},
                            reaction: "В чём проблема?",
                            // Пример прыжка по условию (раскомментируй, если нужен):
                            // onSwipe: (state) => state.pride > 90 ? "father_breakdown" : null,
                        },
                    },
                    // Пример опциональной "branching" карты — едет, только если
                    // её попросил onSwipe выше. Иначе просто остаётся в колоде
                    // и завершит туториал по обычному порядку.
                    // {
                    //     id: "father_breakdown",
                    //     art: "💔",
                    //     text: "…Аврора. Что я упустил в твоём воспитании?",
                    //     outcome: {
                    //         delta: {hp: -20, council: -10},
                    //         reaction: "Что? Я просто говорю правду…",
                    //     },
                    // },
                ],
            },
        },
    };

    const STEPS = [
        {name: "config", target: () => window.Game},
        {name: "registry", target: () => window.registry},
        {name: "bg", target: () => window.bg},
        {name: "gg", target: () => window.gg},
        {name: "npc", target: () => window.npc},
        {name: "hp", target: () => window.hp},
        {name: "dialog", target: () => window.dialog},
        {name: "mini", target: () => window.mini},
        {name: "speakers", target: () => window.speakers},
        {name: "parallax", target: () => window.parallax},
        {name: "observers", target: () => window.observers},
        {name: "main", target: () => window.Game, method: "start"},
    ];

    function boot() {
        console.group("%c[boot] игра стартует", "color:#d4a64a;font-weight:bold");

        for (const step of STEPS) {
            const mod = step.target();
            if (!mod) {
                console.error(`[boot] ✗ ${step.name}: модуль не найден на window`);
                continue;
            }
            const method = step.method || "init";
            const fn = mod[method];
            if (typeof fn !== "function") {
                console.error(`[boot] ✗ ${step.name}: ${method}() не объявлен`);
                continue;
            }
            try {
                const out = fn.call(mod);
                console.info(`[boot] ✓ ${step.name}`, out !== undefined ? out : "");
            } catch (e) {
                console.error(`[boot] ✗ ${step.name}: ${e.message || e}`, e);
            }
        }

        console.groupEnd();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
