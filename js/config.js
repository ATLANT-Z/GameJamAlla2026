/* ============================================================
   config.js — runtime config + applyConfig() bootstrap.

   Game.config — knobs you may tweak from a Twine startup passage:
       Game.config.passageSelector = "tw-passage";
       Game.config.protagonist     = "aurora";
       Game.config.typewriterCps   = 52;

   Game.applyConfig(GameConfig) — flattens the hierarchical
   content registry from game-config.js into the bg / sprites /
   mini stores.
   ============================================================ */

(function () {
    "use strict";

    const Game = {
        config: {
            passageSelector: "tw-passage",
            // Отображаемое имя ГГ — пишется в плашке говорящего, мыслях и т.п.
            protagonist:     "Аврора",
            // Ключ в реестре спрайтов: gg.emj("neutral") → `${protagonistKey}_neutral`.
            // Меняй вместе с реестром, если ГГ не Аврора.
            protagonistKey:  "aurora",
            typewriterCps:   52,
            skipOnClick:     true,
            passageOutMs:    220,
            passageInMs:     280,
        },

        applyConfig(cfg) {
            if (!cfg) return;

            // Backgrounds
            if (cfg.backgrounds && window.bg && typeof bg.register === "function") {
                Object.entries(cfg.backgrounds).forEach(([id, def]) => bg.register(id, def));
            }

            // Sprites — flatten { family: { mood: src|{src,anim} } } into "family_mood"
            if (cfg.sprites && window.sprites && typeof sprites.register === "function") {
                Object.entries(cfg.sprites).forEach(([family, emotions]) => {
                    Object.entries(emotions).forEach(([mood, def]) => {
                        const entry = typeof def === "string" ? { src: def } : def;
                        sprites.register(`${family}_${mood}`, entry);
                    });
                });
            }

            // Minis — store by id, used by mini.start("id")
            if (cfg.minis && window.mini && typeof mini.register === "function") {
                Object.entries(cfg.minis).forEach(([id, def]) => mini.register(id, def));
            }

            // Sounds — store by id, used by sound.play("id")
            //   sounds: { id: "url" }
            //   sounds: { id: { src, volume, loop } }
            if (cfg.sounds && window.sound && typeof sound.register === "function") {
                Object.entries(cfg.sounds).forEach(([id, def]) => sound.register(id, def));
            }

            // npcByName — пробрасываем в Game.config, чтобы speakers.js
            // не лез в GameConfig напрямую.
            if (cfg.npcByName) {
                Game.config.npcByName = Object.assign(
                    {}, Game.config.npcByName || {}, cfg.npcByName
                );
            }
        },

        // Boot init — вызывается из boot.js. Применяет GameConfig.
        init() {
            if (!window.GameConfig) {
                throw new Error("window.GameConfig отсутствует (game-config.js не загружен?)");
            }
            Game.applyConfig(window.GameConfig);
            return Game.config;
        },
    };

    window.Game = Game;
})();
