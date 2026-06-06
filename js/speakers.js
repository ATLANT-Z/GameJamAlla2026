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

    // Запоминаем последнюю заданную эмоцию для каждого героя
    // (в т.ч. для ГГ — ключ "__gg"). Эмоция держится между репликами,
    // пока её не переключат явно через ИМЯ[mood]:.
    const lastMoodByKey = Object.create(null);
    const GG_KEY = "__gg";

    function onDialogLine(ev) {
        if (!ev || !ev.detail) return;
        const speaker = ev.detail.speaker;
        if (!speaker) return;                      // нарратор — игнор
        const mood = (ev.detail.mood || "").trim();

        // ГГ — отдельный путь: меняем её эмоцию через gg.emj,
        // но в правый стек не пихаем.
        if (isProtagonist(speaker)) {
            // sticky hide: gg.hide({force:true}) — реплики не возвращают её.
            if (window.gg && window.gg.isForceHidden && window.gg.isForceHidden()) return;
            // Решаем какую эмоцию: явная → она и запоминается; иначе — последняя
            // запомненная или neutral. Реплика АВРОРЫ всегда триггерит показ
            // (даже без mood) — это и есть «реплика выше hide».
            let useMood;
            if (mood) {
                lastMoodByKey[GG_KEY] = mood;
                useMood = mood;
            } else {
                useMood = lastMoodByKey[GG_KEY] || "neutral";
            }
            if (window.gg && window.gg.emj) window.gg.emj(useMood);
            return;
        }

        const key = resolveNpcKey(speaker);
        if (!key) return;                          // не нашли — молча

        // Решаем какую эмоцию использовать:
        //   • явная в реплике → берём её и запоминаем
        //   • нет явной → используем запомненную для этого героя
        //   • если запомненной нет → "neutral" (первое появление)
        let useMood;
        if (mood) {
            lastMoodByKey[key] = mood;
            useMood = mood;
        } else {
            useMood = lastMoodByKey[key] || "neutral";
        }

        // Проверяем что нужный спрайт вообще есть.
        if (!window.sprites || !window.sprites.has(key + "_" + useMood)) {
            // fallback: хотя бы neutral, чтобы не падать молча
            if (window.sprites && window.sprites.has(key + "_neutral")) {
                useMood = "neutral";
            } else {
                return;
            }
        }
        if (!window.npc) return;

        window.npc.show(key, useMood);             // появится или сменит эмоцию
        window.npc.speak(key);                     // подскочит как активный
    }

    // Очистить память эмоций — полезно при clear()
    function forgetMood(key) {
        if (key) delete lastMoodByKey[key];
        else for (const k of Object.keys(lastMoodByKey)) delete lastMoodByKey[k];
    }

    let bound = false;
    function init() {
        if (bound) return { bound: true };
        window.addEventListener("dialog:line", onDialogLine);
        bound = true;
        const cfg = (window.Game && window.Game.config) || {};
        const map = cfg.npcByName || (window.GameConfig && window.GameConfig.npcByName) || {};
        return { bound: true, mapEntries: Object.keys(map) };
    }

    // Public — на случай если автор хочет вручную подёргать ту же логику.
    window.speakers = Object.assign(window.speakers || {}, {
        resolve:    resolveNpcKey,
        handle:     (speaker, mood) => onDialogLine({ detail: { speaker, mood } }),
        forgetMood,
        lastMood:   (key) => lastMoodByKey[key] || null,
        init,
    });
})();
