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
               bars: [ { id, icon, label, value } x4 ],
               cards: [
                   {
                       id, art, text,
                       left:  { label, delta: {barId: ±N, ...}, reaction },
                       right: { label, delta, reaction },
                       when:  (state) => boolean   // optional show-condition
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
        // override defaults by providing your own urls — for now the
        // registry-seeded SVG placeholders are used.
    },

    sprites: {
        // Override / extend emotions here. Example:
        // aurora: { dreamy: "img/aurora_dreamy.png" },
        // knight: { proud:  "img/knight_proud.png"  },
    },

    /* ------------------------------------------------------------
       npcByName — карта "ИМЯ говорящего в Twine" → "family-ключ NPC".
       Когда в пассаже встречается строка "ИМЯ: текст…@@@", модуль
       speakers.js ищет имя здесь и зовёт npc.show(family, "neutral").
       ------------------------------------------------------------ */
    npcByName: {
        "ЧЛЕН СОВЕТА": "councilor",
        "РЫЦАРЬ":      "knight",
        "СЛУЖАНКА":    "maid",
        "КОТ":         "cat",
    },

    minis: {
        /* ---------- TUTORIAL ---------- */
        tutorial1: {
            bars: [
                { id: "hp",         icon: "❤", label: "связь",   value: 100 },
                { id: "wisdom",     icon: "✦", label: "мудрость", value:  20 },
                { id: "pride",      icon: "♛", label: "гордыня", value:  80 },
                { id: "council",    icon: "⚖", label: "совет",   value:  50 },
            ],
            cards: [
                {
                    id: "taxes",
                    art: "💰",
                    text: "Поднять налоги? Или прислушаться к совету?",
                    left:  { label: "Поднять",  delta: { pride:+10, wisdom:-5, council:-20, hp:-5 },
                             reaction: "Я знаю что лучше. Я ведь принцесса!" },
                    right: { label: "Прислушаться", delta: { pride:-10, wisdom:+15, council:+15 },
                             reaction: "Может, в этот раз они правы…" },
                },
                {
                    id: "bread",
                    art: "🥖",
                    text: "Крестьяне голодают. Что делать?",
                    left:  { label: "Пусть едят пирожные", delta: { pride:+5, wisdom:-10, council:-15, hp:-10 },
                             reaction: "А разве это не одно и то же?" },
                    right: { label: "Открыть закрома",      delta: { pride:-5, wisdom:+10, council:+10 },
                             reaction: "Иногда даже принцесса должна делиться." },
                },
                {
                    id: "advisor",
                    art: "📜",
                    text: "Советник предлагает план. Послушать?",
                    left:  { label: "Перебить",   delta: { pride:+8,  wisdom:-8, council:-10, hp:-5 },
                             reaction: "У меня свои идеи." },
                    right: { label: "Выслушать",  delta: { pride:-8,  wisdom:+12, council:+10 },
                             reaction: "Возможно, я не всё знаю." },
                },
                {
                    id: "father",
                    art: "👑",
                    text: "Отец просит подумать о подданных. Ответить?",
                    left:  { label: "Закатить глаза", delta: { pride:+5,  wisdom:-5, council:-10, hp:-15 },
                             reaction: "Опять эти нравоучения!" },
                    right: { label: "Подумать",       delta: { pride:-10, wisdom:+20, council:+5 },
                             reaction: "…может, он прав." },
                },
            ],
        },
    },
};
