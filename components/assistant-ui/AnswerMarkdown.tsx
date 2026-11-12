"use client";

/**
 * Captain AI's answer renderer: GitHub-flavoured markdown (real tables,
 * nested lists, code) on the existing `.ap-md-*` styles, with `[E1]` source
 * markers drawn as chips that open the cited evidence.
 *
 * Raw HTML is never rendered (react-markdown's default), and links keep
 * react-markdown's safe-protocol filter; external ones open in a new tab.
 *
 * The text renders block by block (splitMarkdownBlocks): a streamed answer
 * only re-renders its last block, and the hand-over to the saved answer only
 * touches a block the server actually rewrote.
 */

import { memo, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { Element, ElementContent, Root } from "hast";
import remarkGfm from "remark-gfm";
import type { CitationRef } from "@/lib/ai/agent/protocol";
import { CITATION_HREF, linkCitations } from "@/lib/assistant/answer";
import { cn } from "@/lib/utils";
import { blockChange, splitMarkdownBlocks } from "./workspace/thread/handover";
import { CitationChip } from "./CitationChip";

/** "1 240", "12,6 %", "-3 pts", "52" — a cell that is a figure, with an optional unit. */
const NUMERIC_CELL = /^[-+\u2212]?\s?[\d\s.,\u00a0\u202f]+\s?(%|\u20ac|k\u20ac|pts?|h|min|s|x)?$/i;

function textOf(node: ElementContent | Element): string {
    if (node.type === "text") return node.value;
    if (node.type === "element") return node.children.map(textOf).join("");
    return "";
}

function childElements(node: Element | Root, tag?: string): Element[] {
    return (node.children as ElementContent[]).filter((c): c is Element => c.type === "element" && (!tag || c.tagName === tag));
}

/**
 * Marks every cell of an all-numeric column (header included) with
 * `data-num`, so the existing table styles right-align the whole column.
 */
function rehypeNumericColumns() {
    const visit = (node: Element | Root) => {
        for (const child of childElements(node)) {
            if (child.tagName === "table") markTable(child);
            else visit(child);
        }
    };
    const markTable = (table: Element) => {
        const rows = childElements(table).flatMap((section) => childElements(section, "tr"));
        const bodyRows = rows.filter((row) => childElements(row, "td").length > 0);
        const width = Math.max(0, ...rows.map((row) => childElements(row).length));
        for (let col = 0; col < width; col++) {
            const values = bodyRows.map((row) => textOf(childElements(row)[col] ?? { type: "text", value: "" }).trim()).filter(Boolean);
            if (values.length === 0 || !values.every((v) => NUMERIC_CELL.test(v))) continue;
            for (const row of rows) {
                const cell = childElements(row)[col];
                if (cell) cell.properties = { ...cell.properties, dataNum: true };
            }
        }
    };
    return (tree: Root) => visit(tree);
}

function buildComponents(citations: CitationRef[]): Components {
    const byLabel = new Map(citations.map((c) => [c.label, c]));
    return {
        p: ({ children }) => <p className="ap-md-p">{children}</p>,
        h1: ({ children }) => <h3 className="ap-md-h">{children}</h3>,
        h2: ({ children }) => <h3 className="ap-md-h">{children}</h3>,
        h3: ({ children }) => <h3 className="ap-md-h">{children}</h3>,
        h4: ({ children }) => <h4 className="ap-md-h">{children}</h4>,
        ul: ({ children }) => <ul className="ap-md-ul">{children}</ul>,
        ol: ({ children, start }) => (
            <ol className="ap-md-ol" start={start}>
                {children}
            </ol>
        ),
        table: ({ children }) => (
            <div className="ap-md-table-wrap">
                <table className="ap-md-table">{children}</table>
            </div>
        ),
        code: ({ children, className }) =>
            className ? (
                <code className={`${className} block`}>{children}</code>
            ) : (
                <code className="ap-md-code">{children}</code>
            ),
        pre: ({ children }) => <pre className="ap-md-pre">{children}</pre>,
        hr: () => <hr className="my-4 border-[var(--ds-line-subtle)]" />,
        a: ({ href, children }) => {
            if (href?.startsWith(CITATION_HREF)) {
                const label = href.slice(CITATION_HREF.length);
                return <CitationChip label={label} citation={byLabel.get(label) ?? null} />;
            }
            const external = !!href && /^https?:\/\//i.test(href);
            return (
                <a
                    href={href}
                    className="ap-md-link"
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                    {children}
                </a>
            );
        },
    };
}

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeNumericColumns];

/**
 * One top-level block. While streaming only the last block's text changes, so
 * only it re-renders. When the saved answer rewrote a block (verification
 * repair) it cross-fades; a block that only grew, or did not change, does not
 * move at all.
 */
const MarkdownBlock = memo(function MarkdownBlock({
    text,
    components,
    first,
    last,
}: {
    text: string;
    components: Components;
    first: boolean;
    last: boolean;
}) {
    const [shown, setShown] = useState(text);
    const [generation, setGeneration] = useState(0);
    if (text !== shown) {
        setShown(text);
        if (blockChange(shown, text) === "replace") setGeneration((g) => g + 1);
    }
    const source = useMemo(() => linkCitations(text), [text]);
    const rendered = (
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={components}>
            {source}
        </ReactMarkdown>
    );
    if (generation === 0) return rendered;
    return (
        <div
            key={generation}
            className={cn(
                "duration-300 ease-snappy animate-in fade-in-0",
                first && "[&>:first-child]:mt-0",
                last && "[&>:last-child]:mb-0",
            )}
        >
            {rendered}
        </div>
    );
});

function AnswerMarkdown({ content, citations = EMPTY_CITATIONS }: { content: string; citations?: CitationRef[] }) {
    const components = useMemo(() => buildComponents(citations), [citations]);
    const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);
    return (
        <div className="ap-md">
            {blocks.map((block, i) => (
                <MarkdownBlock key={i} text={block} components={components} first={i === 0} last={i === blocks.length - 1} />
            ))}
        </div>
    );
}

const EMPTY_CITATIONS: CitationRef[] = [];

export default memo(AnswerMarkdown);
