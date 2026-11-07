/**
 * Markdown → layout model of the assistant PDF. Pure.
 *
 * The answer text is parsed with remark (remark-parse + remark-gfm, the same
 * grammar react-markdown applies in the chat) and the mdast tree is reduced to
 * the few blocks the PDF draws: headings, paragraphs, lists, GFM tables,
 * blockquotes, code, rules and visual placeholders. Inline content becomes
 * styled runs; `[E1]` citation markers become `cite` runs (drawn as small
 * superscript labels) and the trailing `:::suivi` block is stripped.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Nodes, PhrasingContent, Root, RootContent, Table } from "mdast";
import { splitFollowUps, splitVisualMarkers } from "../answer";

export interface Run {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strike?: boolean;
    /** A link target, as written. */
    href?: string;
    /** A citation label ("E1", or "E1,E3" for adjacent markers). */
    cite?: boolean;
}

export type Align = "left" | "right" | "center" | null;

export interface ListItem {
    /** GFM task list: true/false; null for a plain item. */
    checked: boolean | null;
    blocks: Block[];
}

export type Block =
    | { type: "heading"; level: number; runs: Run[] }
    | { type: "paragraph"; runs: Run[] }
    | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
    | { type: "table"; align: Align[]; header: Run[][]; rows: Run[][][] }
    | { type: "quote"; blocks: Block[] }
    | { type: "code"; text: string }
    | { type: "rule" }
    /** 1-based index into the section's visuals. */
    | { type: "visual"; index: number };

const CITATION = /\[(E\d{1,3}(?:\s*[,;]\s*E\d{1,3})*)\](?!\()/g;
const CITE_HREF = /^#source-(E\d{1,3})$/;

const parser = unified().use(remarkParse).use(remarkGfm);

/** Splits `[E1]` / `[E1, E3]` markers out of a text node. */
function textRuns(value: string, style: Omit<Run, "text">): Run[] {
    // Soft line breaks are spaces in a paragraph.
    const text = value.replace(/\s*\n\s*/g, " ");
    const out: Run[] = [];
    let last = 0;
    CITATION.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CITATION.exec(text))) {
        if (match.index > last) out.push({ ...style, text: text.slice(last, match.index) });
        out.push({ text: match[1].split(/\s*[,;]\s*/).join(","), cite: true });
        last = match.index + match[0].length;
    }
    if (last < text.length) out.push({ ...style, text: text.slice(last) });
    return out;
}

function phrasing(nodes: PhrasingContent[], style: Omit<Run, "text"> = {}): Run[] {
    const out: Run[] = [];
    for (const node of nodes) {
        switch (node.type) {
            case "text":
                out.push(...textRuns(node.value, style));
                break;
            case "strong":
                out.push(...phrasing(node.children, { ...style, bold: true }));
                break;
            case "emphasis":
                out.push(...phrasing(node.children, { ...style, italic: true }));
                break;
            case "delete":
                out.push(...phrasing(node.children, { ...style, strike: true }));
                break;
            case "inlineCode":
                out.push({ ...style, text: node.value, code: true });
                break;
            case "break":
                out.push({ text: "\n" });
                break;
            case "link": {
                const cite = CITE_HREF.exec(node.url);
                if (cite) out.push({ text: cite[1], cite: true });
                else out.push(...phrasing(node.children, { ...style, href: node.url }));
                break;
            }
            case "linkReference":
                // An unresolved [label]: shown as written.
                out.push({ ...style, text: "[" }, ...phrasing(node.children, style), { ...style, text: "]" });
                break;
            case "image":
            case "imageReference":
                if (node.alt) out.push({ ...style, italic: true, text: node.alt });
                break;
            case "footnoteReference":
                out.push({ text: node.label ?? node.identifier, cite: true });
                break;
            case "html":
                out.push({ ...style, text: node.value.replace(/<[^>]+>/g, "") });
                break;
            default:
                break;
        }
    }
    return mergeRuns(out);
}

/** Adjacent cites become one label; the space before a cite goes (it hangs on the word). */
function mergeRuns(runs: Run[]): Run[] {
    const out: Run[] = [];
    for (const run of runs) {
        if (!run.text) continue;
        const prev = out[out.length - 1];
        if (run.cite && prev?.cite) {
            prev.text = `${prev.text},${run.text}`;
            continue;
        }
        if (run.cite && prev && !prev.cite) {
            prev.text = prev.text.replace(/[  ]+$/, "");
            if (!prev.text) out.pop();
        }
        out.push({ ...run });
    }
    return out;
}

function tableBlock(node: Table): Block {
    const [head, ...body] = node.children;
    const width = Math.max(...node.children.map((row) => row.children.length), 1);
    const cells = (row: Table["children"][number] | undefined): Run[][] =>
        Array.from({ length: width }, (_, i) => phrasing((row?.children[i]?.children ?? []) as PhrasingContent[]));
    return {
        type: "table",
        align: Array.from({ length: width }, (_, i) => (node.align?.[i] ?? null) as Align),
        header: cells(head),
        rows: body.map(cells),
    };
}

function blocks(nodes: RootContent[] | Nodes[]): Block[] {
    const out: Block[] = [];
    for (const node of nodes as RootContent[]) {
        switch (node.type) {
            case "heading":
                out.push({ type: "heading", level: node.depth, runs: phrasing(node.children) });
                break;
            case "paragraph": {
                const runs = phrasing(node.children);
                if (runs.some((r) => r.text.trim())) out.push({ type: "paragraph", runs });
                break;
            }
            case "list":
                out.push({
                    type: "list",
                    ordered: !!node.ordered,
                    start: node.start ?? 1,
                    items: node.children.map((item) => ({
                        checked: typeof item.checked === "boolean" ? item.checked : null,
                        blocks: blocks(item.children),
                    })),
                });
                break;
            case "table":
                out.push(tableBlock(node));
                break;
            case "blockquote":
                out.push({ type: "quote", blocks: blocks(node.children) });
                break;
            case "code":
                out.push({ type: "code", text: node.value });
                break;
            case "thematicBreak":
                out.push({ type: "rule" });
                break;
            case "html": {
                const text = node.value.replace(/<[^>]+>/g, "").trim();
                if (text) out.push({ type: "paragraph", runs: [{ text }] });
                break;
            }
            case "footnoteDefinition":
                out.push(...blocks(node.children));
                break;
            default:
                // definitions, yaml…: nothing to draw.
                break;
        }
    }
    return out;
}

/** Markdown → blocks (no follow-up stripping, no visual markers). */
export function markdownToBlocks(markdown: string): Block[] {
    if (!markdown.trim()) return [];
    const tree = parser.parse(markdown) as Root;
    return blocks(tree.children);
}

/**
 * An assistant answer → blocks: the `:::suivi` block is removed and the
 * `[[visuel N]]` markers become visual blocks, placed the way the chat places
 * them (lib/assistant/answer.ts splitVisualMarkers).
 */
export function answerToBlocks(content: string, visualCount: number): Block[] {
    const { body } = splitFollowUps(content ?? "");
    const out: Block[] = [];
    for (const segment of splitVisualMarkers(body, visualCount)) {
        if (segment.type === "visual") out.push({ type: "visual", index: segment.index });
        else out.push(...markdownToBlocks(segment.text));
    }
    return out;
}

/** Plain text of runs (tests, measuring). */
export function runsText(runs: Run[]): string {
    return runs.map((r) => (r.cite ? `[${r.text}]` : r.text)).join("");
}
