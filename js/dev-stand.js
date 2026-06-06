/* ============================================================
   dev-stand.js — local dev panel.
   Fires API calls without Twine. Mounts a tiny floating panel
   top-left so we can poke each piece.

   Delete the <script src="js/dev-stand.js"> tag for release.
   ============================================================ */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        // 1) Mount initial scene
        bg.set("spirit_field");
        gg.emj("neutral");

        // 2) Seed an initial passage so the UI shows something
        setPassageHTML(
            "@Аврора: Я открыла глаза в этом месте без неба. " +
            "Звёзды над головой — а под ногами ни травы, ни земли. " +
            "Только <em>тишина</em>, в которой слышно, как тает моя собственная решимость." +
            "<p>" +
            "<a data-passage='Knight'>Кто-то здесь есть?</a> " +
            "<a data-passage='Restart'>Замолчать</a>" +
            "</p>"
        );

        // 3) Provide nav handler for our fake passages
        window.Game.onNavigate = (target) => {
            if (target === "Knight") {
                npc.show("knight", "neutral");
                npc.speak("knight");
                setPassageHTML(
                    "@Рыцарь: — Принцесса. Я ждал. — Его голос тих. — " +
                    "<em>Этот путь не для тебя одной.</em>" +
                    "<p>" +
                    "<a data-passage='Maid'>«Пойдём со мной…»</a>" +
                    "</p>"
                );
            } else if (target === "Maid") {
                npc.show("maid", "neutral");
                npc.speak("maid");
                setPassageHTML(
                    "@Фрейлина: — Госпожа, — она появляется из-за рыцаря. " +
                    "— Мы помним. Но теперь — позвольте нам просить вас." +
                    "<p>" +
                    "<a data-passage='Cat'>«Чего вы хотите?»</a>" +
                    "</p>"
                );
            } else if (target === "Cat") {
                npc.show("cat", "neutral");
                npc.speak("cat");
                setPassageHTML(
                    "@Кот: <em>Мрау.</em> Хватит говорить. <strong>Идём.</strong>" +
                    "<p>" +
                    "<a data-passage='Trial'>«Куда?»</a>" +
                    "</p>"
                );
            } else if (target === "Trial") {
                hp.show();
                hp.reset(100);
                npc.speak("knight");
                setPassageHTML(
                    "@Аврора: Меч молчит над нами. Я чувствую тонкую нить — " +
                    "она тянется от сердца к чему-то, что я уже не помню как звала «телом»." +
                    "<p>" +
                    "<a data-passage='StartMini'>Шагнуть вперёд</a>" +
                    "</p>"
                );
            } else if (target === "StartMini") {
                startTrial1();
            } else if (target === "Restart") {
                npc.clear();
                hp.hide();
                location.reload();
            }
        };

        mountPanel();
    });

    /* ---------- Push HTML into the watched passage element ---------- */
    function setPassageHTML(html) {
        const sel = (window.Game && window.Game.config.passageSelector) || "tw-passage";
        const tw = document.querySelector(sel);
        if (!tw) return;
        tw.innerHTML = html;
    }

    /* ---------- Mini trial 1: knight ---------- */
    function startTrial1() {
        // Hide footer-dialog (main story), mini takes over
        mini.config({
            bars: [
                { id: "hp",         icon: "❤", label: "Связь",   value: 100 },
                { id: "knight",     icon: "⚔", label: "Рыцарь",  value: 100 },
                { id: "trust",      icon: "✦", label: "Доверие", value: 50  },
                { id: "aggression", icon: "✸", label: "Духи",    value: 30  },
            ],
            cards: [
                {
                    id: "wolf_trap",
                    art: "🐺",
                    text: "Дух волка попал в капкан. Цепи держат сильнее, чем зверь.",
                    left:  { label: "Освободить",  delta: { hp:-15, trust:+10, aggression:-10 }, reaction: "Я не могу пройти мимо." },
                    right: { label: "Оставить",    delta: {        trust: -5, aggression:+10 }, reaction: "Это не моя битва." },
                },
                {
                    id: "shade_arrow",
                    art: "🏹",
                    text: "Тёмная тень целит в рыцаря. Я между ним и стрелой.",
                    left:  { label: "Перехватить",  delta: { hp:-25, knight:0,   trust:+15 }, reaction: "Меня не страшна боль." },
                    right: { label: "Отступить",    delta: { knight:-30, trust:-15, aggression:+5 }, reaction: "Прости меня…" },
                },
                {
                    id: "pride_test",
                    art: "👑",
                    text: "Меч безмолвно показывает мою корону, лежащую у ног рыцаря. Поднять?",
                    left:  { label: "Не трогать",   delta: { hp:-15, trust:+15 }, reaction: "Я больше не корона." },
                    right: { label: "Поднять",      delta: { hp:+10, trust:-20, aggression:+5 }, reaction: "Я — принцесса." },
                    when:  (s) => s.hp <= 60,
                },
                {
                    id: "final_step",
                    art: "✦",
                    text: "Последний шаг. Нить почти не держит. Принять удар?",
                    left:  { label: "Принять",      delta: { hp:-100 }, reaction: "Прости… я подвела всех." },
                    right: { label: "Отказаться",   delta: { trust:-30 }, reaction: "Я не готова." },
                    when:  (s) => s.hp <= 30,
                },
            ],
            onBarZero: (id) => {
                if (id === "hp") {
                    setTimeout(() => {
                        mini.stop();
                        drops.fill(0);
                        hp.show(); hp.reset(100);
                        setPassageHTML(
                            "@Аврора: Я падаю. Мне кажется — это конец. Я подвела всех." +
                            "<p>" +
                            "<a data-passage='Restart'>Схватиться за угасающую руку</a>" +
                            "</p>"
                        );
                    }, 600);
                }
            },
            onComplete: () => {
                mini.stop();
                setPassageHTML(
                    "@Аврора: Карты кончились. Меч безмолвен. Я ещё здесь." +
                    "<p>" +
                    "<a data-passage='Restart'>Дальше</a>" +
                    "</p>"
                );
            },
        });
        mini.start();
    }

    /* ---------- Floating dev panel ---------- */
    function mountPanel() {
        const stand = document.createElement("div");
        stand.className = "dev-stand";
        stand.innerHTML = `
            <div class="dev-stand__title">dev stand</div>
            <div class="dev-stand__row"><span class="dev-stand__hint">gg</span>
                <button data-act="gg-neutral">neutral</button>
                <button data-act="gg-sad">sad</button>
                <button data-act="gg-happy">happy</button>
                <button data-act="gg-scared">scared</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">npc</span>
                <button data-act="npc-knight">+knight</button>
                <button data-act="npc-maid">+maid</button>
                <button data-act="npc-cat">+cat</button>
                <button data-act="npc-clear">clear</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">speak</span>
                <button data-act="speak-knight">knight</button>
                <button data-act="speak-maid">maid</button>
                <button data-act="speak-cat">cat</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">bg</span>
                <button data-act="bg-spirit">spirit_field</button>
                <button data-act="bg-castle">castle_dusk</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">hp</span>
                <button data-act="hp-show">show</button>
                <button data-act="hp-hide">hide</button>
                <button data-act="hp-minus">-25</button>
                <button data-act="hp-plus">+25</button>
                <button data-act="hp-reset">reset</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">drop</span>
                <button data-act="drop-0">fill 0</button>
                <button data-act="drop-1">fill 1</button>
                <button data-act="drop-2">fill 2</button>
                <button data-act="drop-reset">reset</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">mini</span>
                <button data-act="mini-start">trial 1</button>
                <button data-act="mini-stop">stop</button>
            </div>
        `;
        document.body.appendChild(stand);

        stand.addEventListener("click", (ev) => {
            const btn = ev.target.closest("button[data-act]");
            if (!btn) return;
            const act = btn.dataset.act;
            switch (act) {
                case "gg-neutral":  gg.emj("neutral"); break;
                case "gg-sad":      gg.emj("sad");     break;
                case "gg-happy":    gg.emj("happy");   break;
                case "gg-scared":   gg.emj("scared");  break;
                case "npc-knight":  npc.show("knight"); npc.speak("knight"); break;
                case "npc-maid":    npc.show("maid");   npc.speak("maid");   break;
                case "npc-cat":     npc.show("cat");    npc.speak("cat");    break;
                case "npc-clear":   npc.clear();        break;
                case "speak-knight":npc.speak("knight");break;
                case "speak-maid":  npc.speak("maid");  break;
                case "speak-cat":   npc.speak("cat");   break;
                case "bg-spirit":   bg.set("spirit_field"); break;
                case "bg-castle":   bg.set("castle_dusk");  break;
                case "hp-show":     hp.show();          break;
                case "hp-hide":     hp.hide();          break;
                case "hp-minus":    hp.remove(25);      break;
                case "hp-plus":     hp.add(25);         break;
                case "hp-reset":    hp.reset(100);      break;
                case "drop-0":      drops.fill(0);      break;
                case "drop-1":      drops.fill(1);      break;
                case "drop-2":      drops.fill(2);      break;
                case "drop-reset":  drops.reset();      break;
                case "mini-start":  startTrial1();      break;
                case "mini-stop":   mini.stop();        break;
            }
        });
    }
})();
