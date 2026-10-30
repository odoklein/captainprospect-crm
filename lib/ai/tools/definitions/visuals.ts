/**
 * show_visual — the assistant draws.
 *
 * The tool does not look anything up: it validates a visual spec (see
 * lib/assistant/visuals/spec.ts) and hands it back. The runtime then checks the
 * figures against the turn's sources, stores the visual with the message and
 * sends it to the browser, where the answer places it with a `[[visuel N]]`
 * marker. Being a read with no side effect, it needs no confirmation and does
 * not count as a source (`noEvidence`).
 */

import { z } from "zod";
import { VISUAL_KINDS, VALUE_FORMATS, parseVisualSpec } from "@/lib/assistant/visuals/spec";
import { defineReadTool, params } from "../helpers";
import { ToolValidationError } from "../types";

const format = { type: "string", enum: [...VALUE_FORMATS], description: "number (défaut), percent (la valeur est déjà un %), duration (secondes), text" };

export const showVisual = defineReadTool({
    name: "show_visual",
    label: "Graphique",
    noEvidence: true,
    requiresProject: false,
    description:
        "Affiche un graphique, des chiffres clés ou un tableau dans la réponse. À utiliser dès qu'une réponse contient une série dans le temps, 3 valeurs comparables ou plus, une répartition ou un classement — APRÈS avoir lu les données. Les valeurs doivent venir telles quelles des outils de lecture (jamais inventées ni arrondies à la hausse). Renvoie le numéro du visuel : place « [[visuel N]] » seul sur une ligne dans ta réponse à l'endroit voulu.",
    parameters: params(
        {
            kind: {
                type: "string",
                enum: [...VISUAL_KINDS],
                description:
                    "kpi_row (2 à 6 chiffres clés) · line / area (évolution dans le temps) · bar (comparer des catégories, SDR, clients) · donut (répartition d'un total, ≤ 8 parts) · funnel (étapes successives) · table (valeurs exactes) · heatmap (jour × heure) · leaderboard (classement)",
            },
            title: { type: "string", description: "Titre court, précis, avec la période si elle compte" },
            subtitle: { type: "string", description: "Période, périmètre, unité" },
            from: { type: "string", description: "Étiquette de la source principale des données, ex. « E1 » : permet d'actualiser le visuel plus tard" },
            format,
            series: {
                type: "array",
                description: "line / area / bar : les valeurs à tracer. `key` = clé numérique présente dans chaque ligne de `rows`.",
                items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, format }, required: ["key", "label"] },
            },
            x_key: { type: "string", description: "Clé de `rows` portant l'étiquette de l'axe (jour, SDR…). Par défaut la première clé qui n'est pas une série." },
            rows: {
                type: "array",
                description: "line / area / bar / table : une ligne par point. Ex. [{ \"jour\": \"2026-10-01\", \"appels\": 120, \"rdv\": 4 }]",
                items: { type: "object" },
            },
            columns: {
                type: "array",
                description: "table : colonnes affichées, dans l'ordre",
                items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, format }, required: ["key", "label"] },
            },
            stacked: { type: "boolean", description: "bar : empiler les séries" },
            horizontal: { type: "boolean", description: "bar : barres horizontales (libellés longs, classements)" },
            tiles: {
                type: "array",
                description: "kpi_row : chiffres clés. `delta_pct` = évolution en % vs période précédente (null si inconnue).",
                items: {
                    type: "object",
                    properties: {
                        label: { type: "string" },
                        value: { type: ["number", "string"] },
                        format,
                        delta_pct: { type: ["number", "null"] },
                        hint: { type: "string", description: "ex. « vs 30 jours précédents »" },
                    },
                    required: ["label", "value"],
                },
            },
            items: {
                type: "array",
                description: "donut / funnel / leaderboard : [{ label, value, detail? }], dans l'ordre voulu (funnel : de la première étape à la dernière)",
                items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" }, detail: { type: "string" } }, required: ["label", "value"] },
            },
            cells: {
                type: "array",
                description: "heatmap : [{ row: \"Lun\", col: \"10h\", value: 12 }]",
                items: { type: "object", properties: { row: { type: "string" }, col: { type: "string" }, value: { type: "number" } }, required: ["row", "col", "value"] },
            },
        },
        ["kind", "title"],
    ),
    schema: z.record(z.string(), z.unknown()),
    execute: async (args) => {
        const { from, ...spec } = args as Record<string, unknown>;
        const parsed = parseVisualSpec(spec);
        if (!parsed.ok) throw new ToolValidationError(parsed.error);
        return { visual: parsed.spec, from: typeof from === "string" && /^E\d{1,3}$/.test(from) ? from : null };
    },
});
