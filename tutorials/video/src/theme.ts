// Brand tokens of the CRM (brand/brand.config.ts, brand/fonts.ts): navy for structure,
// pink for the signal (the action that matters), Bricolage Grotesque + Geist.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Vendored variable fonts (latin subset, covers French): renders are offline and deterministic.
export const display = "Bricolage Grotesque";
export const body = "Geist";
const variable = { weight: "100 900", display: "block" } as const;
void loadFont({ family: display, url: staticFile("fonts/bricolage-latin.woff2"), ...variable });
void loadFont({ family: body, url: staticFile("fonts/geist-latin.woff2"), ...variable });

export const C = {
    navy: "#06103A",
    navy2: "#0D1A52",
    pink: "#FF0A80",
    pinkSoft: "rgba(255, 10, 128, 0.16)",
    green: "#16A34A",
    greenSoft: "rgba(22, 163, 74, 0.18)",
    white: "#FFFFFF",
    ink2: "rgba(255, 255, 255, 0.78)",
    dim: "rgba(6, 16, 58, 0.26)",
};

/** Caption band under the stage: captions never cover the interface. */
export const BAND = 124;
export const STAGE = { width: 1280, height: 720 - BAND };
