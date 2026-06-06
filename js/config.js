/* ============================================================
   config.js — game-wide config you can tweak from a Twine startup
   passage:
       <<script>>
           Game.config.passageSelector = "tw-passage";
           Game.config.protagonist     = "aurora";
           Game.config.typewriterCps   = 52;
       <</script>>
   ============================================================ */

(function () {
    "use strict";

    const Game = {
        config: {
            // CSS selector watched for passage changes.
            // SugarCube/Harlowe both render the active passage in <tw-passage>.
            // If you wrap that in your own #story container, override here.
            passageSelector: "tw-passage",

            // The family-prefix for gg.emj(): gg.emj("sad") -> "aurora_sad"
            protagonist: "aurora",

            // Typewriter speed (chars per second). 0 = instant.
            typewriterCps: 52,

            // Skip typewriter when user clicks the dialog
            skipOnClick: true,

            // Animation timings (ms)
            passageOutMs: 220,
            passageInMs:  280,
        },
    };

    window.Game = Game;
})();
