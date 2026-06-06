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

    // ----- Inline SVG placeholders (so the scene isn't blank) -----
    // Schematic silhouettes — replace by real art any time.

    const svgGirl = (mood) => {
        const tint = mood === "sad"     ? "#9ec3ff"
                   : mood === "angry"   ? "#e6a0a0"
                   : mood === "happy"   ? "#f0d574"
                   : mood === "scared"  ? "#b9a6ff"
                   :                      "#cfe2ff";
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 560" preserveAspectRatio="xMidYMax meet">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="${tint}" stop-opacity=".95"/>
                    <stop offset="1" stop-color="#1a234e" stop-opacity=".25"/>
                </linearGradient>
            </defs>
            <ellipse cx="140" cy="115" rx="48" ry="56" fill="url(#g)"/>
            <path d="M70 540 C 70 360, 110 240, 140 200 C 170 240, 210 360, 210 540 Z" fill="url(#g)"/>
            <circle cx="125" cy="115" r="4" fill="#0a1230"/>
            <circle cx="155" cy="115" r="4" fill="#0a1230"/>
            <path d="M125 140 Q 140 ${mood==="sad"?135:148} 155 140" stroke="#0a1230" stroke-width="2" fill="none"/>
            <!-- crown -->
            <path d="M105 70 L120 50 L130 65 L140 45 L150 65 L160 50 L175 70 Z" fill="#d4a64a" stroke="#7c5a1f"/>
            <circle cx="140" cy="55" r="3" fill="#9ec3ff"/>
        </svg>`;
    };

    const svgNpc = (kind, mood) => {
        const tint = kind === "knight"    ? "#cfd5e7"
                   : kind === "maid"      ? "#f4cda3"
                   : kind === "cat"       ? "#1c1f3c"
                   :                        "#cfe2ff";
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 560" preserveAspectRatio="xMidYMax meet">
            <defs>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="${tint}"/>
                    <stop offset="1" stop-color="#0a1230" stop-opacity=".4"/>
                </linearGradient>
            </defs>
            ${kind === "cat" ? `
                <ellipse cx="140" cy="380" rx="100" ry="60" fill="url(#g2)"/>
                <ellipse cx="140" cy="280" rx="62" ry="56" fill="url(#g2)"/>
                <polygon points="90,240 105,210 120,245"  fill="url(#g2)"/>
                <polygon points="190,240 175,210 160,245" fill="url(#g2)"/>
                <circle cx="120" cy="280" r="6" fill="#d4a64a"/>
                <circle cx="160" cy="280" r="6" fill="#d4a64a"/>
                <path d="M140 295 L135 305 L145 305 Z" fill="#0a1230"/>
            ` : `
                <ellipse cx="140" cy="135" rx="48" ry="56" fill="url(#g2)"/>
                <path d="M70 540 C 70 360, 110 250, 140 220 C 170 250, 210 360, 210 540 Z" fill="url(#g2)"/>
                <circle cx="125" cy="135" r="4" fill="#0a1230"/>
                <circle cx="155" cy="135" r="4" fill="#0a1230"/>
                <path d="M125 160 Q 140 ${mood==="sad"?155:168} 155 160" stroke="#0a1230" stroke-width="2" fill="none"/>
                ${kind === "knight" ? `<rect x="200" y="180" width="14" height="280" fill="#cfd5e7" stroke="#3a4378"/>` : ""}
                ${kind === "maid"   ? `<rect x="115" y="180" width="50" height="14" fill="#fff" opacity=".4"/>` : ""}
            `}
        </svg>`;
    };

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

        // Knight, Maid, Cat (NPC)
        [
            ["knight", "neutral"], ["knight", "sad"],
            ["maid",   "neutral"], ["maid",   "sad"],
            ["cat",    "neutral"], ["cat",    "sad"],
        ].forEach(([kind, mood]) => {
            spriteRegister(kind + "_" + mood, { src: svgDataUri(svgNpc(kind, mood)) });
        });

        // Backgrounds
        bgRegister("spirit_field", {
            far:  svgDataUri(svgBg("spirit_far")),
            near: svgDataUri(svgBg("spirit_near")),
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
