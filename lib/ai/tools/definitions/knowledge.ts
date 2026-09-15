/**
 * Product knowledge — "comment on fait X dans le CRM ?"
 *
 * The 11 markdown files in lib/assistant/docs are kept from the previous
 * assistant, which injected up to three of them into every prompt whether the
 * question needed them or not. Here they are a tool instead: the model asks for
 * them when it decides the question is a how-to, the manager sees that call in
 * the trace, and a data question costs no doc tokens at all.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { defineReadTool, params } from "../helpers";

const DOCS_DIR = path.join(process.cwd(), "lib", "assistant", "docs");
const MAX_DOCS = 3;
const MAX_CHARS_PER_DOC = 4000;

interface DocEntry {
    filename: string;
    title: string;
    keywords: string[];
    priority: number;
    body: string;
}

/** Parsed once per process — these files ship with the build and never change. */
let cache: DocEntry[] | null = null;

function parseList(value: string): string[] {
    return value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, "").toLowerCase())
        .filter(Boolean);
}

function loadDocs(): DocEntry[] {
    if (cache) return cache;

    let files: string[] = [];
    try {
        files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
    } catch {
        // Missing corpus is a deployment problem, not a request problem: the
        // tool degrades to "no documentation found" rather than throwing.
        cache = [];
        return cache;
    }

    cache = files.map((filename) => {
        const raw = fs.readFileSync(path.join(DOCS_DIR, filename), "utf8");
        const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        const frontmatter = match?.[1] ?? "";
        const body = match?.[2] ?? raw;

        let keywords: string[] = [];
        let priority = 5;
        for (const line of frontmatter.split("\n")) {
            const colon = line.indexOf(":");
            if (colon === -1) continue;
            const key = line.slice(0, colon).trim();
            const value = line.slice(colon + 1).trim();
            if (key === "keywords") keywords = parseList(value);
            else if (key === "priority") priority = Number.parseInt(value, 10) || 5;
        }

        const heading = body.match(/^#\s+(.+)$/m)?.[1];

        return {
            filename,
            title: heading ?? filename.replace(/\.md$/, "").replace(/-/g, " "),
            keywords,
            priority,
            body,
        };
    });

    return cache;
}

/** Keyword overlap, then title, then the doc's declared priority as tiebreak. */
function score(doc: DocEntry, query: string): number {
    const q = query.toLowerCase();
    const terms = q.split(/\s+/).filter((t) => t.length > 2);

    let points = 0;
    for (const keyword of doc.keywords) {
        if (q.includes(keyword)) points += 4;
        else if (terms.some((t) => keyword.includes(t))) points += 2;
    }
    if (terms.some((t) => doc.title.toLowerCase().includes(t))) points += 3;
    if (points > 0) points += doc.priority / 10;
    return points;
}

export const searchHelp = defineReadTool({
    name: "search_help",
    label: "Documentation du CRM",
    description:
        "Cherche dans la documentation interne du CRM (missions, listes, planning, email hub, facturation, portail client, intégrations…). À utiliser pour une question « comment faire » ou « où trouver », pas pour une question sur des données réelles.",
    parameters: params({ query: { type: "string", description: "La question, en français" } }, [
        "query",
    ]),
    schema: z.object({ query: z.string().min(2).max(300) }),
    requiresProject: false,
    execute: async (args) => {
        const docs = loadDocs();
        if (docs.length === 0) {
            return { error: "La documentation interne n'est pas disponible sur ce serveur." };
        }

        const ranked = docs
            .map((doc) => ({ doc, points: score(doc, args.query) }))
            .filter((entry) => entry.points > 0)
            .sort((a, b) => b.points - a.points)
            .slice(0, MAX_DOCS);

        if (ranked.length === 0) {
            return {
                documents: [],
                disponibles: docs.map((d) => d.title),
                note: "Rien ne correspond. Propose à l'utilisateur un des sujets disponibles, ou réponds depuis tes connaissances du produit en le signalant.",
            };
        }

        return {
            documents: ranked.map(({ doc }) => ({
                titre: doc.title,
                source: doc.filename,
                // Docs are written by the team, not by prospects — they are
                // trusted content and do not go through sanitizeUntrusted.
                contenu:
                    doc.body.length > MAX_CHARS_PER_DOC
                        ? `${doc.body.slice(0, MAX_CHARS_PER_DOC)}\n…[tronqué]`
                        : doc.body,
            })),
        };
    },
});
