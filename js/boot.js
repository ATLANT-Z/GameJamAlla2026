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

    hp.set(100);
    drops.show();
    bg.set("sword_take")
    sound.stopAllMusic();
    sound.music("s_wind_grass", {slot: "bg"});
    sound.music("m_the_end");


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
            sword_take: {
                far: "https://ik.imagekit.io/atlantz/jam/sword_take_far.png",
                near: "https://ik.imagekit.io/atlantz/jam/sword_take_near.png",
            },
            spirit_world: {
                far: "https://ik.imagekit.io/atlantz/jam/menu_bg.png?updatedAt=1780789788108",
                near: "https://ik.imagekit.io/atlantz/jam/spirit_world_near.png",
            },
            castle: {
                far: "https://ik.imagekit.io/atlantz/jam/castle_far.jpg",
                near: "https://ik.imagekit.io/atlantz/jam/castle_near.png",
            },
            forest: {
                far: "https://ik.imagekit.io/atlantz/jam/forest_far.png",
                near: "https://ik.imagekit.io/atlantz/jam/forest_near.png",
            },
            forest_mid: {
                far: "https://ik.imagekit.io/atlantz/jam/forest_mid.png",
            },
            forest_bandit: {
                far: "https://ik.imagekit.io/atlantz/jam/forest_bandit2.png",
            },
            forest_deep: {
                far: "https://ik.imagekit.io/atlantz/jam/forest_deep.png",
            },
            bridge: {
                far: "https://ik.imagekit.io/atlantz/jam/bridge.png",
            },
            memory_knight: {
                far: "https://ik.imagekit.io/atlantz/jam/memory/memory_knight.png",
            },
            memory_maid: {
                far: "https://ik.imagekit.io/atlantz/jam/memory/memory_maid.png",
            },
            memory_cat: {
                far: "https://ik.imagekit.io/atlantz/jam/memory/memory_cat.png",
            },
            finish_all: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/all.png",
            },
            finish_nobody: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/nobody.png",
            },
            finish_cat: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/cat.png",
            },
            finish_knight: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/knight.png",
            },
            finish_maid: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/maid.png",
            },
            finish_knight_maid: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/knight_maid.png",
            },
            finish_knight_cat: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/knight_cat.png",
            },
            finish_maid_cat: {
                far: "https://ik.imagekit.io/atlantz/jam/finish/maid_cat.png",
            },
            // override defaults by providing your own urls — for now the
            // registry-seeded SVG placeholders are used.
        },

        sprites: {
            aurora: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_neutral.png",
                dress: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_dress.png",
                wow: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_wow.png",
                fun: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_fun.png",
                mad: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_mad.png",
                sad: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_sad.png",
                knee: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_knee.png",
                kneeCry: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_knee_cry.png",
                kneeWow: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_knee_wow.png",
                kneeSad: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_knee_sad.png",
                kneeThx: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_knee_thx.png",
                kneeWeak: "https://ik.imagekit.io/atlantz/jam/c/aurora/aurora_knee_weak.png"
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
                wow: "https://ik.imagekit.io/atlantz/jam/c/knight/knight_wow.png",
                fun: "https://ik.imagekit.io/atlantz/jam/c/knight/knight_fun.png",
                mad: "https://ik.imagekit.io/atlantz/jam/c/knight/knight_mad.png",
                calm: "https://ik.imagekit.io/atlantz/jam/c/knight/knight_calm.png"
                // proud: "img/knight_proud.png"
            },
            maid: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/maid/maid_neutral-2.png",
                wow: "https://ik.imagekit.io/atlantz/jam/c/maid/maid_wow.png",
                fun: "https://ik.imagekit.io/atlantz/jam/c/maid/maid_fun.png",
                mad: "https://ik.imagekit.io/atlantz/jam/c/maid/maid_mad.png",
                sad: "https://ik.imagekit.io/atlantz/jam/c/maid/maid_sad.png"
            },
            cat: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/cat/cat_neutral.png",
                wow: "https://ik.imagekit.io/atlantz/jam/c/cat/cat_wow.png",
                fun: "https://ik.imagekit.io/atlantz/jam/c/cat/cat_fun.png",
                mad: "https://ik.imagekit.io/atlantz/jam/c/cat/cat_mad.png",
                sad: "https://ik.imagekit.io/atlantz/jam/c/cat/cat_sad.png"
            },
            witch: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/witch/witch_neutral2.png",
                drink: "https://ik.imagekit.io/atlantz/jam/c/witch/witch_drink2.png",
            },
            troll: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/troll/troll_neutral.png",
            },
            bandits: {
                neutral: "https://ik.imagekit.io/atlantz/jam/c/bandits/bandits_neutral.png",
                hide: "__",
            },
            spirit: {
                neutral: "__",
            }
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
            "СТАРУХА": "witch",
            "ТРОЛЛЬ": "troll",
            "БАНДИТЫ": "bandits",
            "ДУХ": "spirit"
        },

        /* ------------------------------------------------------------
           sounds — id → "url" | { src, volume?, loop? }
           Используется через:
               sound.play("id")
               sound.play(["a","b"])
               sound.play("id", { loop: true, volume: 0.5 })
           Или прямо из сценария Twine:
               ЗВУК: thunder @@@
               ЗВУК: thunder, lightning @@@   (через запятую — по очереди)
           Реплика "ЗВУК: …" в диалоге НЕ показывается — это просто
           команда звуковому модулю, парсер сразу едет дальше.
           ------------------------------------------------------------ */
        // sound.play("sword")                  // одиночный
        // sound.play(["a","b","c"])            // очередь
        // sound.play("amb", { fadeIn: 800 })   // плавный въезд
        //
        // sound.stop("amb")                    // мгновенно
        // sound.stop("amb", { fadeMs: 600 })   // с затуханием
        // sound.stopAll({ fadeMs: 400 })
        // MUSIC (новое — один слот, auto-crossfade):
        //
        // sound.music("forest")                       // включить (loop=true по умолчанию)
        // sound.music("battle")                       // crossfade: forest fade-out + battle fade-in
        // sound.music("battle", { fade: 1500 })       // fade 1.5 сек
        // sound.music("battle", { fadeIn: 1200, fadeOut: 600 })  // раздельно
        // sound.music("forest")                       // если "forest" и так играет — no-op
        // sound.stopMusic()                           // fade-out текущей (800мс)
        // sound.stopMusic({ fade: 0 })                // мгновенно
        // sound.currentMusic()                        // → "forest" | null

        sounds: {
            s_wind_leafs: {
                src: "https://mcdn.podbean.com/mf/web/wnbe3bbxfsaubxgr/s_wind_leafs.mp3",
                volume: 0.4,
                loop: true
            },
            s_wind_grass: {
                src: "https://mcdn.podbean.com/mf/web/z58cyajifzcskc2c/s_wind_grass.mp3",
                volume: 0.4,
                loop: true
            },
            sTroll: {src: "https://mcdn.podbean.com/mf/web/zyrm7tabcqad6uhs/s_troll.mp3", volume: 0.5},
            sSwordUp: {src: "https://mcdn.podbean.com/mf/web/iivb56tncgkbisru/s_sword_up.mp3", volume: 0.6},
            sSword: {src: "https://mcdn.podbean.com/mf/web/t3srsduyie934gj5/s_sword.mp3", volume: 0.6},
            sMew: {src: "https://mcdn.podbean.com/mf/web/39e8k5fiata9du8z/s_mew.mp3", volume: 0.7},
            sHurt: {src: "https://mcdn.podbean.com/mf/web/7sgwizr9vsmga97f/s_hurt.mp3", volume: 0.6},
            sCricket: {src: "https://mcdn.podbean.com/mf/web/szu7msamydq4nesz/s_cricket.mp3", volume: 0.4},
            m_the_end: {
                src: "https://mcdn.podbean.com/mf/web/gprkr3sxcz4mymbb/m_the_end.mp3",
                volume: 0.5,
                loop: true
            },
            m_spirit_world: {
                src: "https://mcdn.podbean.com/mf/web/ri4swtrm2u5s962g/m_spirit_world.mp3",
                volume: 0.5,
                loop: true
            },
            m_main_theme: {
                src: "https://mcdn.podbean.com/mf/web/zd7izj24irjg4dgr/m_main_theme.mp3",
                volume: 0.5,
                loop: true
            },
            m_hall_1: {
                src: "https://mcdn.podbean.com/mf/web/akzscfihkcxy6ms3/m_hall_1.mp3",
                volume: 0.5,
                loop: true
            },
            m_forest_light: {
                src: "https://mcdn.podbean.com/mf/web/icyxqkh5h4428f5x/m_forest_light.mp3",
                volume: 0.5,
                loop: true
            },
            m_forest_deep: {
                src: "https://mcdn.podbean.com/mf/web/bfbkmrjr35dry2u3/m_forest_deep.mp3",
                volume: 0.5,
                loop: true
            },
            m_fight: {
                src: "https://mcdn.podbean.com/mf/web/dki6g2nmp87n4hya/m_fight.mp3",
                volume: 0.5,
                loop: true
            },

            // Примеры — замени на свои URL'ы:
            // thunder:  { src: "audio/thunder.mp3", volume: 0.8 },
            // ambient:  { src: "audio/forest.mp3",  volume: 0.3, loop: true },
            // step:     "audio/step.wav",          // короткая форма
            // page:     { src: "audio/page.ogg",   volume: 0.6 },
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

            knight_trial: {
                bars: [
                    {id: "hp", icon: "❤", label: "Связь Авроры", value: 100},
                    {id: "knight_hp", icon: "🛡", label: "Рыцарь", value: 40},
                ],
                cards: [
                    // Карточка 1: Волки
                    {
                        id: "knight_wolves",
                        art: "🐺",
                        text: "Ты видишь Ланселота, чья нога застряла в капкане, он кричит от боли и тянет руку к тебе, но тут из леса на него несётся стая волков.",
                        left: {
                            label: "Бежать отсюда!",
                            delta: {
                                knight_hp: -20,
                            },
                            onSwipe: (state) => "knight_wolves_ego"
                        },
                        right: {
                            label: "Попробую успеть!",
                            delta: {
                                hp: -25,
                                knight_hp: +20,
                            },
                            onSwipe: (state) => "knight_wolves_friend"
                        }
                    },
                    {
                        id: "knight_wolves_ego",
                        art: "🩸",
                        text: "Аврора отступает назад, за спиной раздаются крики рыцаря. Когда она оборачивается, волки уже окружают его. " +
                            "Ланселот до последнего пытается отбиваться мечом, но стая валит его на землю и крики быстро стихают.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "knight_bridge_0"
                        },
                    },
                    {
                        id: "knight_wolves_friend",
                        art: "🛡",
                        text: "Аврора бросается к капкану. Она быстрыми движениями освобождает ногу Ланселоту, но в последний момент один из волков впивается " +
                            "в ее плечо зубами, оставляя рваную рану. У принцессы темнеет перед глазами, но она помогает подняться рыцарю",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "knight_bridge_0"
                        },
                    },
                    // Карточка 2: Мост и Рычаг
                    {
                        id: "knight_bridge_0",
                        art: "⛓",
                        text: "Не успевая опомниться, Аврора и Ланселот оказываются на старом мосту над пропастью, который тут же рушится. " +
                            "Рыцарь перепрыгивает на другую сторону, но край моста под ним ломается, и он повисает над пропастью. " +
                            "Взгляд Авроры переключается на рычаг рядом.",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "knight_bridge",
                        art: "⛓",
                        text: "ДУХ: Этот рычаг активирует платформу, но она выдержит лишь одного и если ты воспользуешься ею сама, " +
                            "то спасешься, но если отправишь ее к Ланселоту он сможет выжить. " +
                            "Когда он погиб за тебя, он не колебался, но что же выберешь ты?",
                        left: {
                            label: "Направить к себе",
                            delta: {
                                knight_hp: -20,
                            },
                            onSwipe: (state) => "knight_bridge_ego"
                        },
                        right: {
                            label: "Платформу рыцарю",
                            delta: {
                                hp: -20,
                                knight_hp: +20,
                            },
                            onSwipe: (state) => "knight_bridge_friend"
                        }
                    },
                    {
                        id: "knight_bridge_ego",
                        art: "🩸",
                        text: "Аврора активирует платформу для себя и благополучно оказывается на безопасной стороне. " +
                            "Ланселот, ещё несколько секунд держится за край и срывается вниз. ",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "knight_sword_choice_0"
                        },
                    },
                    {
                        id: "knight_bridge_friend",
                        art: "🛡",
                        text: "Ланселот взбирается наверх, но в этот момент остатки моста начинают рушиться под Авророй. Она падает вниз. " +
                            "Последнее, что она видит - это рыцарь, пытающийся дотянуться до неё. ",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "knight_sword_choice_0"
                        },
                    },
                    // Карточка 3: Выбор Меча
                    {
                        id: "knight_sword_choice_0",
                        art: "🗡",
                        text: "Аврора падает на каменный пол и оказывается в тронном зале, на пьедестале лежит легендарный меч Артура, " +
                            "а рядом стоит Ланселот, но его тело постепенно превращается в пепел. ",
                        outcome: {
                            label: "Далее",
                        },
                    },
                    {
                        id: "knight_sword_choice",
                        art: "🗡",
                        text: "ДУХ: Именно за этим мечом ты покинула замок и ради твоей цели погиб твой друг. " +
                            "Сейчас ты можешь получить то, чего желала больше всего. Просто возьми. ",
                        left: {
                            label: "Взять меч",
                            delta: {
                                knight_hp: -20
                            },
                            onSwipe: (state) => "knight_sword_choice_ego"
                        },
                        right: {
                            label: "Бежать к Ланселоту",
                            delta: {
                                hp: -25,
                                knight_hp: +20
                            },
                            onSwipe: (state) => "knight_sword_choice_friend"
                        }
                    },
                    {
                        id: "knight_sword_choice_ego",
                        art: "🩸",
                        text: "Меч в руках вспыхивает золотым светом. Ланселот смотрит на нее, печально улыбается, " +
                            "и его фигура медленно распадается на частицы света. Зал пустеет, оставляя ее совсем одну.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => state.knight_hp >= 60 ? "knight_finish_friend" : "knight_finish_ego"
                        },
                    },
                    {
                        id: "knight_sword_choice_friend",
                        art: "🛡",
                        text: "Она смотрит на меч в последний раз и подходит к Ланселоту, касаясь его плеча. Меч вспыхивает ослепительным светом и " +
                            "превращается в золотую пыль, окружая рыцаря и восстанавливая его тело. Взамен тело Авроры начинает становится прозрачным.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => state.knight_hp >= 60 ? "knight_finish_friend" : "knight_finish_ego"
                        },
                    },
                    {
                        id: "knight_finish_ego",
                        art: "🩸",
                        text: "ДУХ: Ты выбрала меч, все еще цепляясь за свою мечту. Но пока цель для тебя важнее людей, ты не сможешь вернуть тех, " +
                            "кого потеряла, поэтому я не могу доверить тебе каплю жизни. ",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "knight_finish_friend",
                        art: "🛡",
                        text: "ДУХ: Каждый раз перед тобой стоял выбор уйти, но ты осталась, рисковала собой, отказалась от собственной мечты. " +
                            "Поэтому возьми первую каплю жизни. Она принадлежит тому, кто научился ставить чужую жизнь выше собственной.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => {
                                window.drops.fill("0")
                                return true
                            },
                        },
                    },
                ]
            },
            maid_trial: {
                bars: [
                    {id: "hp", icon: "❤", label: "Связь Авроры", value: 80},
                    {id: "maid_hp", icon: "🧹", label: "Служанка", value: 40},
                ],
                cards: [
                    // Карточка 1: Еда в лесу
                    {
                        id: "maid_food_0",
                        art: "🌲",
                        text: "Оказавшись на лесной опушке, Аврора осмотрелась, ее взгляд остановился на мужчину без сил впереди. " +
                            "Она уже хотела сделать шаг к нему, как в голове раздался голос, а в животе заурчало, будто она не ела несколько дней.",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "maid_food",
                        art: "🍞",
                        text: "ДУХ: Когда старушка попросила помощи, ты увидела перед собой лишь помеху. Будучи неимоверно голодной, отдашь ли ты свою последнюю еду другому?",
                        left: {
                            label: "Оставить себе",
                            delta: {
                                maid_hp: -20,
                            },
                            onSwipe: (state) => "maid_food_ego"
                        },
                        right: {
                            label: "Отдать еду",
                            delta: {
                                hp: -15,
                                maid_hp: +20,
                            },
                            onSwipe: (state) => "maid_food_friend"
                        }
                    },
                    {
                        id: "maid_food_ego",
                        art: "🩸",
                        text: "Аврора делает несколько шагов назад, оседая. " +
                            "Она достает кусок хлеба с мясом, начиная есть. " +
                            "Тупая боль, что держалась все это время наконец исчезает, но, " +
                            "обернувшись, она понимает что человек вдалеке больше не двигается.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "maid_cup_0"
                        },
                    },
                    {
                        id: "maid_food_friend",
                        art: "✨",
                        text: "Аврора дает хлеб и воду ослабшему человеку, и тот принимает свое " +
                            "спасение дрожащими руками. Принцесса хочет улыбнуться, но ее " +
                            "пронзает резкая боль и она отшатывается, падая на траву.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "maid_cup_0"
                        },
                    },
                    // Карточка 2: Чаша
                    {
                        id: "maid_cup_0",
                        art: "🌫",
                        text: "Тут деревья растворяются в белом тумане, земля уходит из-под ног, и Аврора оказывается " +
                            "в просторном каменном зале. Высокие колонны уходят в темноту, а в центре стоит длинный " +
                            "стол. Рядом сидит маленькая испуганной девочка лет десяти и оглядывается по сторонам.",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "maid_cup",
                        art: "🍷",
                        text: "ДУХ: Тогда Мария знала, что чаша опасна, не сразу, но поняла, что перед вами не " +
                            "безобидная старушка. Она знала, что может погибнуть, но все равно не колебалась. " +
                            "Что же выберешь ты? Пей дите.",
                        left: {
                            label: "Выпить самой",
                            delta: {
                                hp: -15,
                                maid_hp: +20,
                            },
                            onSwipe: (state) => "maid_cup_friend"
                        },
                        right: {
                            label: "Смотреть",
                            delta: {
                                maid_hp: -20,
                            },
                            onSwipe: (state) => "maid_cup_ego"
                        }
                    },
                    {
                        id: "maid_cup_friend",
                        art: "✨",
                        text: "Аврора смотрит в темную поверхность напитка, понимая, что находится внутри. " +
                            "От страха сердце бешено колотится в груди, а перед глазами возникает испуганное, но " +
                            "решительное лицо Марии. Не сомневаясь, Аврора делает глоток и чувствует, как силы " +
                            "покидают ее, а мир начинает исчезать.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "maid_portal_0"
                        },
                    },
                    {
                        id: "maid_cup_ego",
                        art: "🩸",
                        text: "Аврора остается стоять, поэтому Мария берет чашку и пьет. " +
                            "Ее глаза медленно закрываются, лицом она падает на стол, не реагируя. " +
                            "Принцесса, не говоря ни слова смотрит на нее еще несколько секунда, а потом встает и " +
                            "направляется к выходу.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "maid_portal_0"
                        },
                    },
                    // Карточка 3: Портал
                    {
                        id: "maid_portal_0",
                        art: "🌸",
                        text: "Когда Аврора открывает глаза снова она видит сад того самого замка где находилась. " +
                            "В центре сада лежит ее Мария, та что росла с ней все эти годы. " +
                            "Принцесса хочет потрепать ее по плечу, но тут перед ней открывается огромный портал, " +
                            "где видна ее родная комната.",
                        outcome: {
                            label: "Далее",
                        },
                    },
                    {
                        id: "maid_portal",
                        art: "🚪",
                        text: "ДУХ: Ты хочешь вернуть ее? Но готова ли отказаться от свободы? У тебя есть выбор: уйти или разбудить ее.",
                        left: {
                            label: "Я не уйду без нее",
                            delta: {
                                hp: -15,
                                maid_hp: +20
                            },
                            onSwipe: (state) => "maid_portal_friend"
                        },
                        right: {
                            label: "Это обман! Это не мария - иллюзия",
                            delta: {
                                maid_hp: -20
                            },
                            onSwipe: (state) => "maid_portal_ego"
                        }
                    },
                    {
                        id: "maid_portal_friend",
                        art: "✨",
                        text: "Аврора смотрит на открытую дверь, там, вдалеке выход, достаточно лишь сделать " +
                            "несколько шагов. Но она переводит взгляд на Марию, что неподвижно лежит среди цветов. " +
                            "Она садится рядом, отмахиваясь от портала.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => state.maid_hp >= 60 ? "maid_finish_friend" : "maid_finish_ego"
                        },
                    },
                    {
                        id: "maid_portal_ego",
                        art: "🩸",
                        text: "Аврора долго смотрит на Марию, пока та мирно спит среди белых цветов, совсем как " +
                            "после проклятого вина. Сердце болезненно сжимается. " +
                            "Ей хочется подойти ближе, взять подругу за руку, разбудить ее, но ведь это всего лишь " +
                            "иллюзия, верно? Она медленно встает и, не оборачиваясь, идет к выходу.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => state.maid_hp >= 60 ? "maid_finish_friend" : "maid_finish_ego"
                        },
                    },
                    {
                        id: "maid_finish_ego",
                        art: "🩸",
                        text: "ДУХ: Ты видела чужую нужду, но выбирала себя, проходя мимо. " +
                            "Я не могу доверить тебе вторую каплю жизни, она предназначена тому, кто понимает что " +
                            "доброта требует жертв, что чужая жизнь может быть " +
                            "не менее важна, чем собственная.",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "maid_finish_friend",
                        art: "✨",
                        text: "ДУХ: Ты помогала тем, кто был слабее тебя, рискуя, оставалась рядом, даже когда " +
                            "проще было уйти. Возьми вторую каплю жизни, она принадлежит тому, " +
                            "кто научился видеть в людях не слуг, не незнакомцев и не препятствия " +
                            "на пути к цели, а тех, чья жизнь так же ценна, как и собственная.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => {
                                window.drops.fill("1")
                                return true
                            },
                        },
                    },
                ]
            },
            cat_trial: {
                bars: [
                    {id: "hp", icon: "❤", label: "Связь Авроры", value: 60},
                    {id: "cat_hp", icon: "🐾", label: "Кот", value: 40},
                ],
                cards: [
                    // Карточка 1: Тропа
                    {
                        id: "cat_path_0",
                        art: "🌲",
                        text: "Аврора снова оказывается на лесной тропе. На поваленном дереве сидит Фауст, " +
                            "увидев ее, он поднимает голову, машет хвостом, словно приглашая следовать за ним. " +
                            "Через несколько минут он приводит ее на распутье, дорога разделяется на две " +
                            "тропы: одна широкая и удобная, другая узкая и заросшая кустами.",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "cat_path",
                        art: "🔀",
                        text: "ДУХ: Фауст не раз пытался предупреждал тебя об опасноситях, но ты " +
                            "предпочитала поступать по-своему. Сможешь ли ты довериться чужому совету в " +
                            "этот раз?",
                        left: {
                            label: "Пойти по широкой дороге",
                            delta: {
                                cat_hp: -20,
                            },
                            onSwipe: (state) => "cat_path_ego"
                        },
                        right: {
                            label: "Пойти за Фаустом",
                            delta: {
                                hp: -15,
                                cat_hp: +20,
                            },
                            onSwipe: (state) => "cat_path_friend"
                        }
                    },
                    {
                        id: "cat_path_ego",
                        art: "🩸",
                        text: "Аврора выбирает удобную дорогу, уверенная в своей правоте, но через " +
                            "некоторое время земля под её ногами проваливается, и она оказывается в " +
                            "тупике и застревает.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "cat_mirrors_0"
                        },
                    },
                    {
                        id: "cat_path_friend",
                        art: "✨",
                        text: "Аврора идет за котом через колючие кусты и грязь. Путь оказывается сложнее, " +
                            "но вскоре они выходят прямо к саду, где она появилась впервые.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "cat_mirrors_0"
                        },
                    },
                    // Карточка 2: Зеркала
                    {
                        id: "cat_mirrors_0",
                        art: "🪞",
                        text: "Лес снова исчезает. Аврора оказывается в круглой комнате, заполненной зеркалами " +
                            "и в каждом отражении она видит один из своих поступков: спор с Ланселотом, " +
                            "разговор со старухой, мост с хранителем.",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "cat_mirrors",
                        art: "👁",
                        text: "ДУХ: Ошибки становятся уроками лишь тогда, когда " +
                            "человек способен признать их своими.",
                        left: {
                            label: "Это вина других",
                            delta: {
                                cat_hp: -20,
                            },
                            onSwipe: (state) => "cat_mirrors_ego"
                        },
                        right: {
                            label: "Это моя вина",
                            delta: {
                                hp: -15,
                                cat_hp: +20,
                            },
                            onSwipe: (state) => "cat_mirrors_friend"
                        }
                    },
                    {
                        id: "cat_mirrors_ego",
                        art: "🩸",
                        text: "Аврора отворачивается от зеркал. Отражения начинают трескаться, а " +
                            "вместе с этим и гаснет свет в комнате.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "cat_bridge_0"
                        },
                    },
                    {
                        id: "cat_mirrors_friend",
                        art: "✨",
                        text: "Аврора заставляет себя смотреть и раз за разом наблюдать со " +
                            "стороны свои действия.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => "cat_bridge_0"
                        },
                    },
                    // Карточка 3: Мост вина
                    {
                        id: "cat_bridge_0",
                        art: "⛓",
                        text: "Зеркала растворяются, и Аврора вновь оказывается перед мостом. " +
                            "Тем самым мостом, где погиб Фауст. Кот сидит на перилах и смотрит на нее " +
                            "будто с грустью.",
                        outcome: {
                            label: "Далее",
                        },
                    },
                    {
                        id: "cat_bridge",
                        art: "❓",
                        text: "ДУХ: Кто виноват в смерти твоих друзей?",
                        left: {
                            label: "Все",
                            delta: {
                                cat_hp: -20
                            },
                            onSwipe: (state) => "cat_bridge_ego"
                        },
                        right: {
                            label: "Я сама",
                            delta: {
                                hp: -15,
                                cat_hp: +20
                            },
                            onSwipe: (state) => "cat_bridge_friend"
                        }
                    },
                    {
                        id: "cat_bridge_ego",
                        art: "🩸",
                        text: "Аврора начинает перечислять бандитов, старуху, хранителя моста и судьбу. " +
                            "Фауст печально опускает голову и растворяется в воздухе.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => state.cat_hp >= 60 ? "cat_finish_friend" : "cat_finish_ego"
                        },
                    },
                    {
                        id: "cat_bridge_friend",
                        art: "✨",
                        text: "Аврора долго молчит, а затем указывает пальцем на себя. " +
                            "Принцесса понимает, друзья пытались помочь ей, но она сама раз за разом " +
                            "отвергала их советы. Фауст довольно взмахивает хвостом и спрыгивает с перил.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => state.cat_hp >= 60 ? "cat_finish_friend" : "cat_finish_ego"
                        },
                    },
                    {
                        id: "cat_finish_ego",
                        art: "🩸",
                        text: "ДУХ: Ты по-прежнему ищешь виноватых. " +
                            "Помни, что пока человек обвиняет других в собственных ошибках, " +
                            "он остается пленником одних и тех же решений. Поэтому я не могу доверить тебе " +
                            "каплю жизни в этот раз. Она предназначена тому, кто способен честно взглянуть на себя.",
                        outcome: {
                            label: 'Далее',
                        },
                    },
                    {
                        id: "cat_finish_friend",
                        art: "✨",
                        text: "ДУХ: Ты научилась слушать других, признавать свои ошибки и отвечать за " +
                            "последствия собственных решений. Возьми каплю жизни. Она принадлежит тому, " +
                            "кто нашёл в себе смелость сказать: “Я была неправа”.",
                        outcome: {
                            label: 'Далее',
                            onSwipe: (state) => {
                                window.drops.fill("2")
                                return true
                            },
                        },
                    },
                ]
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
        {name: "sound", target: () => window.sound},
        {name: "speakers", target: () => window.speakers},
        {name: "parallax", target: () => window.parallax},
        {name: "observers", target: () => window.observers},
        {name: "end", target: () => window.end},
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
