/* ============================================================
   registry.js
   Global, write-anywhere dictionaries for sprites & backgrounds.

   USAGE (from a Twine startup passage):

     sprites.register("aurora_neutral", { src: "img/aurora_n.png" });
     sprites.register("aurora_sad_anim", {
         src: "img/aurora_sad_sheet.png",
         spritesheet: { frames: 6, frameWidth: 256, frameHeight: 512, fps: 8 }
     });

     bg.register("castle_field", {
         far:  "img/castle_far.jpg",
         near: "img/castle_near.png"
     });

   You can register a "naked" entry that ships with an inline SVG so the
   scene shows *something* before you drop real art into /assets.
   ============================================================ */

(function () {
    "use strict";

    // ----- Sprite registry -----
    const _sprites = Object.create(null);

    /**
     * @param {string} id
     * @param {{ src:string, spritesheet?: { frames:number, frameWidth:number, frameHeight:number, fps?:number } }} entry
     */
    function spriteRegister(id, entry) {
        if (!id || !entry || !entry.src) {
            console.warn("[registry] sprite.register requires id and src", id, entry);
            return;
        }
        _sprites[id] = entry;
    }
    function spriteGet(id) { return _sprites[id] || null; }
    function spriteHas(id) { return !!_sprites[id]; }

    // ----- Background registry -----
    const _backgrounds = Object.create(null);

    /**
     * @param {string} id
     * @param {{ far?:string, near?:string }} entry
     */
    function bgRegister(id, entry) {
        if (!id || !entry) {
            console.warn("[registry] bg.register requires id and entry", id, entry);
            return;
        }
        _backgrounds[id] = entry;
    }
    function bgGet(id) { return _backgrounds[id] || null; }

    // ----- Inline SVG placeholders -----
    // Plain dark rectangle with a thin gold outline + a tiny label.
    // Just a slot for "where the character would be"; swap with real art via
    // sprites.register("aurora_sad", { src: "img/aurora_sad.png" })
    // or via the sprites: {…} block in game-config.js.

    const placeholder = (label, mood) => {
        const moodTag = mood ? ` · ${mood}` : "";
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 560" preserveAspectRatio="xMidYMax meet">
            <rect x="40" y="120" width="200" height="420" rx="6" ry="6"
                  fill="rgba(10,18,48,0.55)"
                  stroke="rgba(212,166,74,0.55)" stroke-width="1"/>
            <text x="140" y="320"
                  font-family="'Cinzel Decorative', serif"
                  font-size="14" letter-spacing="3"
                  text-anchor="middle"
                  fill="rgba(255,242,193,0.55)">${label.toUpperCase()}</text>
            <text x="140" y="344"
                  font-family="'Cormorant Garamond', serif"
                  font-size="11" letter-spacing="2"
                  text-anchor="middle"
                  fill="rgba(207,226,255,0.4)">${moodTag.replace(/^\s·\s/, "")}</text>
        </svg>`;
    };

    const svgGirl = (mood) => placeholder("aurora", mood);
    const svgNpc  = (kind, mood) => placeholder(kind, mood);

    const svgBg = (kind) => {
        // simple gradients with a few decorations
        if (kind === "spirit_far") {
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stop-color="#1a2050"/>
                        <stop offset=".5" stop-color="#2a2f6e"/>
                        <stop offset="1" stop-color="#1a234e"/>
                    </linearGradient>
                </defs>
                <rect width="1600" height="900" fill="url(#sky)"/>
                <polygon points="0,650 240,420 460,560 720,360 980,540 1280,380 1600,580 1600,900 0,900" fill="#0d1538" opacity=".85"/>
                <circle cx="380"  cy="180" r="2"   fill="#fff" opacity=".8"/>
                <circle cx="900"  cy="120" r="2.5" fill="#cfe2ff"/>
                <circle cx="1280" cy="200" r="2"   fill="#f0d574" opacity=".8"/>
            </svg>`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
            <rect width="1600" height="900" fill="transparent"/>
            <polygon points="0,720 200,640 420,720 660,620 920,720 1200,640 1600,720 1600,900 0,900" fill="#080b22" opacity=".95"/>
            <ellipse cx="800" cy="900" rx="900" ry="220" fill="#060a1c"/>
        </svg>`;
    };

    function svgDataUri(svgString) {
        return "data:image/svg+xml;utf8," + encodeURIComponent(svgString);
    }

    // ----- Auto-seed default placeholders -----
    function seedDefaults() {
        // Aurora (GG)
        ["neutral", "sad", "happy", "angry", "scared"].forEach((mood) => {
            spriteRegister("aurora_" + mood, { src: svgDataUri(svgGirl(mood)) });
        });

        // Knight, Maid, Cat, Councilor (NPC) — плейсхолдеры
        [
            ["knight",    "neutral"], ["knight",    "sad"],
            ["maid",      "neutral"], ["maid",      "sad"],
            ["cat",       "neutral"], ["cat",       "sad"],
            ["councilor", "neutral"], ["councilor", "sad"],
        ].forEach(([kind, mood]) => {
            spriteRegister(kind + "_" + mood, { src: svgDataUri(svgNpc(kind, mood)) });
        });

        // Backgrounds
        bgRegister("spirit_field", {
            far:  svgDataUri(svgBg("spirit_far")),
            near: svgDataUri(svgBg("spirit_near")),
        });

        bgRegister("castle", {
            far: "https://ik.imagekit.io/atlantz/jam/castle_far.jpg",
            near: "https://ik.imagekit.io/atlantz/jam/castle_near.png",
        });
        bgRegister("castle_dusk", {
            far:  svgDataUri(svgBg("spirit_far")),
            near: svgDataUri(svgBg("spirit_near")),
        });
    }

    seedDefaults();

    // ----- Expose -----
    window.sprites = Object.assign(window.sprites || {}, {
        register: spriteRegister,
        get:      spriteGet,
        has:      spriteHas,
        _all:     _sprites,
    });
    window.bg = Object.assign(window.bg || {}, {
        register: bgRegister,
        get:      bgGet,
        _all:     _backgrounds,
    });
})();
