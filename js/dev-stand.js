/* ============================================================
   dev-stand.js — local dev panel + Harlowe-shaped sample passages.
   Delete the <script src="js/dev-stand.js"> tag for release.
   ============================================================ */

(function () {
    "use strict";

    // Map of pass-name → Harlowe-flavored HTML (the same shape <tw-passage>
    // gets from real Twine, minus tw-sidebar which we strip anyway).
    const PASSAGES = {
        Intro: ``
            + `МИР: Туманный Альбион. Королевский замок, собрание совета.@@@`
            + `<br>ЧЛЕН СОВЕТА: Ваше Высочество!@@@`
            + `<br>АВРОРА: Ммм… Что? А?@@@`
            + `<br>ЧЛЕН СОВЕТА: Вы снова уснули посреди совещания! Вы снова всю ночь читали книги?@@@`
            + `<br>АВРОРА: Ой, похоже, немного… `
            + `INLINE:<tw-expression><tw-link data-passage="Tutorial1">А что, происходит что-то важное?</tw-link></tw-expression>@@@`,

        Tutorial1: ``
            + `<tw-collapsed><script>mini.start("tutorial1")</script></tw-collapsed>`
            + `<br>АВРОРА: Просто поднимите эти… как их там. Налоги, вот.@@@`
            + `<br>ЧЛЕН СОВЕТА: Если мы поднимем налоги, то у крестьян не будет денег на хлеб.@@@`
            + `<br>АВРОРА: Ну пусть едят не хлеб! Пусть едят мясо, или сыр, или там, пирожные.@@@`
            + `<br>ЧЛЕН СОВЕТА: Боже, помоги…@@@`
            + `<br>ОТЕЦ: Львёнок… ты понимаешь разницу в стоимости хлеба и пирожных?@@@`
            + `<br>АВРОРА: А она есть?@@@`
            + `<br>ОТЕЦ: Так. Опустим пока эту тему.@@@`
            + `<br>ОТЕЦ: Вот, посмотри, как поступишь `
            + `INLINE:<tw-expression><tw-link data-passage="Outro">тут</tw-link></tw-expression>.@@@`,

        Outro: ``
            + `АВРОРА: <em>(сама себе)</em> Возможно, я и впрямь… не всё понимаю.@@@`
            + `<br>АВРОРА: Что-то изменилось.@@@`
            + `<br><tw-link data-passage="Intro">Начать сначала</tw-link>`
            + `<tw-link data-passage="Tutorial1">Повторить туториал</tw-link>`,
    };

    document.addEventListener("DOMContentLoaded", () => {
        // Mount initial scene
        bg.set("spirit_field");
        gg.emj("neutral");
        npc.show("knight", "neutral");
        npc.speak("knight");

        // First passage
        goto("Intro");

        // Override nav so our fake links work without real Twine
        window.Game.onNavigate = (target) => {
            if (PASSAGES[target]) goto(target);
            else console.warn("[dev] no passage:", target);
        };

        mountPanel();
    });

    function goto(name) {
        const sel = (window.Game && window.Game.config.passageSelector) || "tw-passage";
        const tw = document.querySelector(sel);
        if (!tw) return;
        const html = PASSAGES[name];
        if (html == null) return;
        tw.dataset.passage = name;
        tw.innerHTML = html;

        // Manually execute <script> nodes inside <tw-collapsed> — real Twine
        // would do this automatically when the passage renders. We do it AFTER
        // setting innerHTML so main.js can observe the mini-running state.
        tw.querySelectorAll("tw-collapsed script").forEach((s) => {
            try { (new Function(s.textContent))(); }
            catch (e) { console.error("[dev] passage script failed:", e); }
        });
    }

    function mountPanel() {
        const stand = document.createElement("div");
        stand.className = "dev-stand";
        stand.innerHTML = `
            <div class="dev-stand__title">dev stand</div>
            <div class="dev-stand__row"><span class="dev-stand__hint">go</span>
                <button data-act="go-intro">Intro</button>
                <button data-act="go-tut">Tutorial1</button>
                <button data-act="go-outro">Outro</button>
            </div>
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
                <button data-act="bg-spirit">spirit</button>
                <button data-act="bg-castle">castle</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">hp</span>
                <button data-act="hp-show">show</button>
                <button data-act="hp-hide">hide</button>
                <button data-act="hp-minus">-25</button>
                <button data-act="hp-plus">+25</button>
                <button data-act="hp-reset">reset</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">drop</span>
                <button data-act="drop-0">0</button>
                <button data-act="drop-1">1</button>
                <button data-act="drop-2">2</button>
                <button data-act="drop-reset">reset</button>
            </div>
            <div class="dev-stand__row"><span class="dev-stand__hint">mini</span>
                <button data-act="mini-tut1">tutorial1</button>
                <button data-act="mini-stop">stop</button>
            </div>
        `;
        document.body.appendChild(stand);

        stand.addEventListener("click", (ev) => {
            const btn = ev.target.closest("button[data-act]");
            if (!btn) return;
            switch (btn.dataset.act) {
                case "go-intro":   goto("Intro");      break;
                case "go-tut":     goto("Tutorial1");  break;
                case "go-outro":   goto("Outro");      break;
                case "gg-neutral": gg.emj("neutral");  break;
                case "gg-sad":     gg.emj("sad");      break;
                case "gg-happy":   gg.emj("happy");    break;
                case "gg-scared":  gg.emj("scared");   break;
                case "npc-knight": npc.show("knight"); npc.speak("knight"); break;
                case "npc-maid":   npc.show("maid");   npc.speak("maid");   break;
                case "npc-cat":    npc.show("cat");    npc.speak("cat");    break;
                case "npc-clear":  npc.clear();        break;
                case "speak-knight": npc.speak("knight"); break;
                case "speak-maid":   npc.speak("maid");   break;
                case "speak-cat":    npc.speak("cat");    break;
                case "bg-spirit":  bg.set("spirit_field"); break;
                case "bg-castle":  bg.set("castle_dusk");  break;
                case "hp-show":    hp.show();          break;
                case "hp-hide":    hp.hide();          break;
                case "hp-minus":   hp.remove(25);      break;
                case "hp-plus":    hp.add(25);         break;
                case "hp-reset":   hp.reset(100);      break;
                case "drop-0":     drops.fill(0);      break;
                case "drop-1":     drops.fill(1);      break;
                case "drop-2":     drops.fill(2);      break;
                case "drop-reset": drops.reset();      break;
                case "mini-tut1":  mini.start("tutorial1"); break;
                case "mini-stop":  mini.stop();        break;
            }
        });
    }
})();
