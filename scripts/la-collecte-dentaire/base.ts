// ============================================
// La Collecte Dentaire — qualified base from every touch of the Nov–Dec 2025
// campaign (crown collection from dental practices). Pure apart from readWorkbook.
//
// Sources (Google Drive of the agency, exported as .xlsx):
//   dentistes   « FICHIER DENTISTES FRANCE » — one tab per département:
//               Nom Cabinet | Téléphone | Adresse | Ville | CP | Date/H appel |
//               Issue Appel | Intervenant | Observation | Interlocuteur | Mail/Mobile | RDV/Horaire
//   fabienne    « Fichier de La collecte Dentaire - DEPT 06 » (Fabienne Casini, Tel'PROspect):
//               Rubrique | Nom | Addresse | Téléphone | Mobile | Mail | Qualification | Commentaire | …
//   lesRdv      « LES RDV » / TOUS LES RDV — consolidated RDV + boîtes
//   commerciaux « RDV COMMERCIAUX » — one tab per collector (VANESSA, SOPHIE, DANIEL) with
//               their own follow-up in « VALIDÉ » / « COMMENTAIRE »
//
// Kept: practices whose touches are positive — RDV, boîte (récolte / envoi / dépôt),
// rappel (incl. « va rappeler », « à recontacter », « veut un mail », « envoi doc »).
// Dropped: a practice whose LATEST dated touch is a hard no (non, refus, pas intéressé,
// hors cible, faux numéro), or that a collector marked « REFUS » / « PAS DE RDV ».
// One practice = one phone number (else name + postcode); every touch is kept in its history.
// ============================================

import ExcelJS from "exceljs";
import { parsePhoneNumberFromString } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/max/metadata";

export type Category = "RDV" | "BOITE" | "RAPPEL" | "NEGATIVE" | "NEUTRAL";
export type Tier = { rank: 1 | 2 | 3; key: "rdv" | "boite" | "rappel"; label: string };

export const TIERS: Record<Tier["key"], Tier> = {
    rdv: { rank: 1, key: "rdv", label: "1 · RDV de collecte" },
    boite: { rank: 2, key: "boite", label: "2 · Boîte de collecte acceptée" },
    rappel: { rank: 3, key: "rappel", label: "3 · À rappeler" },
};

export type Touch = {
    source: string;
    name: string;
    phones: string[];
    address: string | null;
    city: string | null;
    postalCode: string | null;
    email: string | null;
    interlocutor: string | null;
    outcome: string;
    category: Category;
    caller: string | null;
    date: string | null; // ISO date-time when known
    note: string | null;
    slot: string | null; // RDV date / opening hours
    collectorFollowUp?: string | null; // « VALIDÉ » of a collector tab
    website?: string | null;
    siren?: string | null;
    size?: string | null;
};

export type Practice = {
    key: string;
    tier: Tier;
    name: string;
    phone: string | null;
    extraPhones: string[];
    address: string | null;
    city: string | null;
    postalCode: string | null;
    department: string | null;
    emails: string[];
    interlocutors: string[];
    slots: string[];
    lastOutcome: string;
    lastTouch: string | null;
    callers: string[];
    collector: string | null;
    collectorFollowUp: string | null;
    website: string | null;
    siren: string | null;
    size: string | null;
    sources: string[];
    history: string[];
};

export type BuildReport = {
    touches: number;
    practices: number;
    kept: Record<Tier["key"], number>;
    droppedLaterNo: number;
    droppedCollectorRefusal: number;
};

// ── cell helpers ─────────────────────────────────────────────────────────────

function text(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") {
        const o = v as { text?: unknown; richText?: Array<{ text?: string }>; result?: unknown; hyperlink?: string };
        if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("");
        if (o.text !== undefined) return text(o.text);
        if (o.result !== undefined) return text(o.result);
        if (o.hyperlink) return o.hyperlink;
    }
    return String(v);
}

export const clean = (v: unknown) => text(v).replace(/ /g, " ").replace(/\s+/g, " ").trim();
const nullish = (s: string) => (!s || /^(\/|-|none|null|n\/a|\.)$/i.test(s) ? null : s);
/** "38860.0" → "38860", "2400.0" → "02400" */
export function postalCode(v: unknown): string | null {
    const s = clean(v).replace(/\.0+$/, "").replace(/\D/g, "");
    if (!s || s.length > 5) return null;
    return s.padStart(5, "0");
}

/** Every valid French (or +xx) number in a cell or note; spreadsheet floats ("247960436.0") repaired. */
export function phonesIn(raw: unknown): string[] {
    const s = clean(raw).replace(/^=\s*/, "+").replace(/(\d)\.0\b/g, "$1");
    const found: string[] = [];
    const add = (candidate: string) => {
        let d = candidate.replace(/[^\d+]/g, "");
        if (!d.startsWith("+")) {
            if (d.startsWith("33") && d.length === 11) d = `+${d}`;
            else if (d.length === 9 && !d.startsWith("0")) d = `0${d}`;
        }
        const p = parsePhoneNumberFromString(d, "FR", metadata);
        if (p?.isValid()) {
            const f = p.formatInternational();
            if (!found.includes(f)) found.push(f);
        }
    };
    for (const m of s.matchAll(/\+?\d[\d\s.()-]{7,18}\d/g)) add(m[0].replace(/\(0\)/g, ""));
    return found;
}

const emailsIn = (raw: unknown) => [...clean(raw).matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0].toLowerCase());

function isoDate(v: unknown): string | null {
    if (v instanceof Date) return v.toISOString();
    const s = clean(v);
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? "00"}:${iso[5] ?? "00"}:00`;
    const fr = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (fr) {
        const y = fr[3] ? (fr[3].length === 2 ? `20${fr[3]}` : fr[3]) : "2025";
        return `${y}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}T00:00:00`;
    }
    return null;
}

export function categoryOf(outcome: string): Category {
    const o = outcome.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    if (!o) return "NEUTRAL";
    if (/^RDV/.test(o)) return "RDV";
    if (/BOITE/.test(o)) return "BOITE";
    if (/RAPPEL|RECONTACTER|VA RAPPELER|VONT RAPPELER|MAIL|ENVOI DOC/.test(o)) return "RAPPEL";
    if (/^(NON|REFUS|PAS INTERESSE|HORS ?CIBLE|FAUX NUMERO|NUMERO INVALIDE|LIQUIDATION|ARRET|DEPART RETRAITE|PAS DE RDV)/.test(o)) return "NEGATIVE";
    return "NEUTRAL"; // NRP, ne répond pas, doublon, messagerie, à prospecter…
}

/** The assistant's first name(s) when the cell holds one ("sandra" → "Sandra"), not a remark. */
export const firstName = (v: string | null) => {
    const s = nullish((v ?? "").replace(/\s*\/\s*$/, ""));
    if (!s || s.length > 40 || s.split(/\s+/).length > 5) return null;
    if (/\b(pas|peut|veut|voulu|donner|nom|non|refus|inconnu|personne|sais)\b|^\?/i.test(s)) return null;
    return s.charAt(0).toUpperCase() + s.slice(1);
};

// ── sources ──────────────────────────────────────────────────────────────────

type Sheet = { name: string; rows: unknown[][] };

/** « FICHIER DENTISTES FRANCE », « LES RDV », « RDV COMMERCIAUX »: same 12 first columns. */
export function touchesFromCallSheet(source: string, sheet: Sheet, opts: { collectorTab?: boolean } = {}): Touch[] {
    const out: Touch[] = [];
    let started = false;
    for (const r of sheet.rows) {
        const first = clean(r[0]);
        if (!started) {
            if (/^(nom cabinet|centre dentaire)/i.test(first)) started = true;
            continue;
        }
        const phones = phonesIn(r[1]);
        if (!first || phones.length === 0) continue; // section titles (« Département 75 »), blanks
        const outcome = clean(r[6]);
        const contactCell = clean(r[10]);
        const followUp = opts.collectorTab ? clean(r[12]) || null : null;
        const comment = opts.collectorTab ? clean(r[13]) : "";
        out.push({
            source,
            name: first,
            phones: [...phones, ...phonesIn(contactCell)].filter((p, i, a) => a.indexOf(p) === i),
            address: nullish(clean(r[2])),
            city: nullish(clean(r[3])),
            postalCode: postalCode(r[4]),
            email: emailsIn(contactCell)[0] ?? emailsIn(r[8])[0] ?? null,
            interlocutor: firstName(clean(r[9])),
            outcome,
            category: categoryOf(outcome),
            caller: nullish(clean(r[7])),
            date: isoDate(r[5]),
            note: [nullish(clean(r[8])), comment ? `Collecteur : ${comment}` : null].filter(Boolean).join(" — ") || null,
            slot: nullish(clean(r[11])),
            collectorFollowUp: followUp,
        });
    }
    return out;
}

/** Fabienne's DEPT 06 file: dated notes « 17/11 … // 13/11 … » in one cell. */
export function touchesFromFabienne(source: string, sheet: Sheet): Touch[] {
    const [header, ...body] = sheet.rows;
    const h = (header ?? []).map(clean);
    const col = (label: string) => h.indexOf(label);
    const [iNom, iAdr, iTel, iMob, iMail, iQ, iCom, iEff, iSiren, iSite] = [
        "Nom", "Addresse", "Téléphone", "Mobile", "Mail", "Qualification", "Commentaire", "Effectif", "SIREN", "Site",
    ].map(col);
    if (iNom < 0 || iQ < 0) throw new Error(`${source}: colonnes « Nom » / « Qualification » introuvables`);
    const out: Touch[] = [];
    for (const r of body) {
        const name = clean(r[iNom]);
        if (!name) continue;
        let outcome = clean(r[iQ]);
        if (/ENVOI DOC/i.test(outcome)) outcome = "ENVOI DOC";
        if (/NRP|MESSAGERIE|A PROSPECTER/i.test(outcome) || !outcome) continue; // never reached
        const note = clean(r[iCom]);
        const address = nullish(clean(r[iAdr]));
        const cp = address?.match(/\b(0[1-9]|[1-8]\d|9[0-5])\d{3}\b/)?.[0] ?? null;
        const dates = [...note.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map((m) => isoDate(m[0]));
        const latest = dates.filter(Boolean).sort().pop() ?? null;
        const crowns = /dizaine|vingtaine|\d+\s*couronnes|boites de la collecte/i.test(note);
        out.push({
            source,
            name,
            phones: [...phonesIn(r[iTel]), ...phonesIn(r[iMob]), ...phonesIn(note)].filter((p, i, a) => a.indexOf(p) === i),
            address,
            city: cp && address ? address.slice(address.indexOf(cp) + cp.length).trim().split(/\s*\/\s*/)[0] || null : null,
            postalCode: cp,
            email: emailsIn(r[iMail])[0] ?? emailsIn(note)[0] ?? null,
            interlocutor: null,
            outcome: crowns && /RAPPEL/i.test(outcome) ? "RAPPEL (couronnes signalées)" : outcome,
            category: categoryOf(outcome),
            caller: "Fabienne (Tel'PROspect)",
            date: latest,
            note: note || null,
            slot: null,
            website: iSite >= 0 ? clean(r[iSite]).split(/\s*#\s*/)[0] || null : null,
            siren: iSiren >= 0 ? clean(r[iSiren]).replace(/\.0$/, "").replace(/\D/g, "") || null : null,
            size: iEff >= 0 ? nullish(clean(r[iEff])) : null,
        });
    }
    return out;
}

// ── merge ────────────────────────────────────────────────────────────────────

export const normName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const RANK: Record<Category, number> = { RDV: 3, BOITE: 2, RAPPEL: 1, NEGATIVE: 0, NEUTRAL: 0 };

/**
 * Groups touches into practices: union-find on phone numbers and name + postcode,
 * so one practice reached through two numbers (or listed in two files) stays one.
 */
export function groupTouches(touches: Touch[]): Map<string, Touch[]> {
    const parent = new Map<string, string>();
    const find = (k: string): string => {
        const p = parent.get(k) ?? k;
        if (p === k) return k;
        const root = find(p);
        parent.set(k, root);
        return root;
    };
    const union = (a: string, b: string) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(rb, ra);
    };
    const keysOf = (t: Touch) => [
        ...t.phones.map((p) => `tel:${p}`),
        ...(t.postalCode ? [`nom:${normName(t.name)}|${t.postalCode}`] : []),
    ];
    for (const t of touches) {
        const ks = keysOf(t);
        for (const k of ks) parent.set(k, parent.get(k) ?? k);
        for (const k of ks.slice(1)) union(ks[0], k);
    }
    const groups = new Map<string, Touch[]>();
    for (const t of touches) {
        const ks = keysOf(t);
        if (!ks.length) continue;
        const root = find(ks[0]);
        const g = groups.get(root) ?? [];
        g.push(t);
        groups.set(root, g);
    }

    return groups;
}

export function buildBase(touches: Touch[]): { practices: Practice[]; report: BuildReport } {
    const groups = groupTouches(touches);

    const report: BuildReport = {
        touches: touches.length,
        practices: groups.size,
        kept: { rdv: 0, boite: 0, rappel: 0 },
        droppedLaterNo: 0,
        droppedCollectorRefusal: 0,
    };
    const practices: Practice[] = [];

    for (const [key, group] of groups) {
        const dated = [...group].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
        const best = dated.reduce((m, t) => Math.max(m, RANK[t.category]), 0);
        if (best === 0) continue;

        const positives = dated.filter((t) => RANK[t.category] > 0);
        const lastPositive = positives[positives.length - 1];
        const laterNo = dated.find(
            (t) => t.category === "NEGATIVE" && t.date && lastPositive.date && t.date > lastPositive.date && !t.collectorFollowUp,
        );
        if (laterNo) {
            report.droppedLaterNo++;
            continue;
        }
        const followUps = group.map((t) => t.collectorFollowUp).filter((f): f is string => !!f);
        const followUp = followUps.find((f) => !/^none$/i.test(f)) ?? null;
        if (followUp && /REFUS|PAS DE RDV/i.test(followUp)) {
            report.droppedCollectorRefusal++;
            continue;
        }

        let tierKey: Tier["key"] = best === 3 ? "rdv" : best === 2 ? "boite" : "rappel";
        if (followUp && /RDV PHYSIQUE/i.test(followUp)) tierKey = "rdv";
        else if (followUp && /BOITE/i.test(followUp) && tierKey === "rappel") tierKey = "boite";
        report.kept[tierKey]++;

        const pick = <K extends keyof Touch>(k: K) => dated.map((t) => t[k]).filter((v) => v !== null && v !== undefined && v !== "");
        const uniq = (xs: unknown[]) => [...new Set(xs.map(String))];
        const phones = uniq(group.flatMap((t) => t.phones));
        const collectorTab = group.find((t) => t.collectorFollowUp !== undefined && /RDV COMMERCIAUX/.test(t.source));
        const pc = (pick("postalCode")[0] as string | undefined) ?? null;

        // One line per distinct touch: no « DOUBLON » markers, no empty rows, and the
        // same note copied into LES RDV / RDV COMMERCIAUX shown once.
        const seen = new Set<string>();
        const history = dated
            .filter((t) => {
                if ((!t.outcome && !t.note) || /^DOUBLON/i.test(t.outcome)) return false;
                const k = `${categoryOf(t.outcome)}|${normName(t.note ?? "")}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .map((t) => {
                const when = t.date ? t.date.slice(0, 16).replace("T", " ").replace(/ 00:00$/, "") : "date ?";
                return `${when} · ${t.caller ?? "?"} · ${t.outcome || "—"}${t.note ? ` — ${t.note}` : ""}`;
            });

        practices.push({
            key,
            tier: TIERS[tierKey],
            name: lastPositive.name,
            phone: phones[0] ?? null,
            extraPhones: phones.slice(1),
            address: (pick("address")[0] as string | undefined) ?? null,
            city: (pick("city")[0] as string | undefined) ?? null,
            postalCode: pc,
            department: pc ? (pc.startsWith("97") ? pc.slice(0, 3) : pc.slice(0, 2)) : null,
            emails: uniq(pick("email")),
            interlocutors: uniq(pick("interlocutor")),
            slots: uniq(pick("slot")),
            lastOutcome: lastPositive.outcome,
            lastTouch: dated.map((t) => t.date).filter(Boolean).pop() ?? null,
            callers: uniq(pick("caller")),
            collector: collectorTab ? collectorTab.source.split("·").pop()!.trim() : null,
            collectorFollowUp: followUp,
            website: (pick("website")[0] as string | undefined) ?? null,
            siren: (pick("siren")[0] as string | undefined) ?? null,
            size: (pick("size")[0] as string | undefined) ?? null,
            sources: uniq(group.map((t) => t.source)),
            history,
        });
    }

    practices.sort((a, b) => a.tier.rank - b.tier.rank || (a.department ?? "").localeCompare(b.department ?? "") || a.name.localeCompare(b.name, "fr"));
    return { practices, report };
}

export async function readWorkbook(path: string): Promise<Sheet[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    return wb.worksheets.map((ws) => {
        const rows: unknown[][] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
            const values: unknown[] = [];
            // Google exports pad sheets with thousands of empty columns: read only the ones used.
            for (let c = 1; c <= 16; c++) values.push(row.getCell(c).value);
            rows.push(values);
        });
        return { name: ws.name, rows };
    });
}
