// One adapter per note-taker of the catalog (Leexi excepted: lib/leexi).
import type { NotetakerAdapter } from "../types";
import { claap } from "./claap";
import { fathom } from "./fathom";
import { fireflies } from "./fireflies";
import { grain } from "./grain";
import { modjo } from "./modjo";
import { tldv } from "./tldv";

export const ADAPTERS: Record<string, NotetakerAdapter> = Object.fromEntries(
    [modjo, claap, fireflies, fathom, grain, tldv].map((a) => [a.id, a]),
);
