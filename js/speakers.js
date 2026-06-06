/* ============================================================
   speakers.js — автоматический показ NPC по имени говорящего.

   Слушает CustomEvent("dialog:line", { speaker, html, index, total }),
   разрешает имя говорящего в ключ реестра NPC и зовёт:
       npc.show(key, "neutral")
       npc.speak(key)

   Если NPC ещё не появлялся на сцене — он въезжает в стек.
   Если уже стоит в стеке — становится активным говорящим (scoots in).

   Авторский контракт:
       1. В game-config.js (или Game.config.npcByName)
          задаёшь карту:
              npcByName: {
                  "ЧЛЕН СОВЕТА": "councilor",
                  "ЭЛАЯ":        "elayah",
                  "РЫЦАРЬ":      "knight",
              }
          Ключ — имя как пишется в Twine (`ИМЯ: …`),
          значение — family-ключ в реестре спрайтов
          (тот, что регистрировался как `family_mood`).
       2. Регистрируешь спрайт с этой family-частью:
              sprites.register("councilor_neutral", { src: "img/..." });
          (или через GameConfig.sprites: { councilor: { neutral: "..." } })
       3. Готово — как только в пассаже встретится
              ЧЛЕН СОВЕТА: ...@@@
          NPC появится справа с дефолтной эмоцией.

   Игнорируем:
       • МИР / WORLD     — нарратор.
       • Авроре (имя ГГ) — она слева, в стек NPC её не пихаем.
       • Неизвестные имена без записи в реестре — просто пропускаем.
   ============================================================ */

(function () {
    "use strict";

    function norm(s) {
        return String(s || "").trim().toUpperCase();
    }

    function isProtagonist(speaker) {
        const cfg = (window.Game && window.Game.config) || {};
        const protag = norm(cfg.protagonist || "");
        const protagKey = norm(cfg.protagonistKey || "");
        const n = norm(speaker);
        return n && (n === protag || n === protagKey);
    }

    function resolveNpcKey(speaker) {
        const cfg = (window.Game && window.Game.config) || {};
        const map = cfg.npcByName || (window.GameConfig && window.GameConfig.npcByName) || {};

        // 1. Точное совпадение в карте (верхний регистр)
        const n = norm(speaker);
        if (map[n]) return map[n];

        // 2. Совпадение как пришло (на случай если автор задал с регистром)
        if (map[speaker]) return map[speaker];

        // 3. Попробуем использовать имя как ключ напрямую (lowercase).
        //    Если у автора есть `aurora_neutral` в реестре и в Twine `АВРОРА:`,
        //    то после lowercase = `аврора` (кириллица) — не подойдёт,
        //    но если автор пишет `KNIGHT:` латиницей — это сработает.
        const lower = speaker.toLowerCase();
        if (window.sprites && window.sprites.has(lower + "_neutral")) return lower;

        return null;
    }

    function onDialogLine(ev) {
        if (!ev || !ev.detail) return;
        const speaker = ev.detail.speaker;
        if (!speaker) return;                      // нарратор — игнор
        if (isProtagonist(speaker)) return;        // ГГ — слева, не в стек

        const key = resolveNpcKey(speaker);
        if (!key) return;                          // не нашли — молча

        // Проверяем что в реестре есть хоть что-то с этой family.
        const moods = ["neutral", "sad", "happy", "angry", "scared"];
        const hasAny = window.sprites &&
            moods.some((m) => window.sprites.has(key + "_" + m));
        if (!hasAny) return;

        if (!window.npc) return;

        window.npc.show(key, "neutral");           // появится если ещё нет
        window.npc.speak(key);                     // подскочит как активный
    }

    window.addEventListener("dialog:line", onDialogLine);

    // Public — на случай если автор хочет вручную подёргать ту же логику.
    window.speakers = Object.assign(window.speakers || {}, {
        resolve: resolveNpcKey,
        handle:  (speaker) => onDialogLine({ detail: { speaker } }),
    });
})();
