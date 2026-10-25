"use client";

/**
 * Minimal Markdown renderer for assistant answers.
 *
 * Why not react-markdown (which this project already ships): everything here is
 * built as React nodes, so model output can never inject markup — there is no
 * `dangerouslySetInnerHTML` anywhere in the path. The model emits a small
 * subset anyway: headings, lists, tables, bold, italic, inline code, links.
 *
 * Presentation only: a table or a "label : value" list renders the exact text
 * the model wrote, never recomputed or reordered.
 */

import { memo, useMemo } from "react";

// ============================================
// INLINE
// ============================================

// One pass per line: code | bold | italic | link. Order matters — code wins, so
// `**not bold**` inside backticks stays literal.
const INLINE_PATTERN =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/g;

/** Only same-origin or http(s). Anything else renders as plain text. */
const SAFE_LINK = /^(https?:\/\/|\/)/i;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    INLINE_PATTERN.lastIndex = 0;
    while ((match = INLINE_PATTERN.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

        const token = match[0];
        const key = `${keyPrefix}-i${i++}`;

        if (match[1]) {
            nodes.push(
                <code key={key} className="ap-md-code">
                    {token.slice(1, -1)}
                </code>,
            );
        } else if (match[2]) {
            nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
        } else if (match[3]) {
            nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
        } else if (match[4]) {
            const split = token.indexOf("](");
            const label = token.slice(1, split);
            const href = token.slice(split + 2, -1);
            nodes.push(
                SAFE_LINK.test(href) ? (
                    <a
                        key={key}
                        href={href}
                        target={href.startsWith("/") ? undefined : "_blank"}
                        rel="noopener noreferrer"
                        className="ap-md-link"
                    >
                        {label}
                    </a>
                ) : (
                    label
                ),
            );
        }

        lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
}

// ============================================
// BLOCKS
// ============================================

type Block =
    | { kind: "p"; lines: string[] }
    | { kind: "h"; level: number; text: string }
    | { kind: "ul"; items: string[] }
    | { kind: "ol"; items: string[]; start: number }
    | { kind: "tbl"; lines: string[] }
    | { kind: "table"; head: string[]; rows: string[][]; numeric: boolean[] };

/** Lines of a pipe table are collected as "tbl" and validated when the block ends. */
const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_RULE_CELL = /^:?-+:?$/;

function splitRow(line: string): string[] {
    return line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
}

/**
 * A figure, optionally with a % / € / short unit: "52", "79 %", "1 240 €".
 * `\s` also covers the non-breaking spaces French number formatting uses.
 */
const NUMERIC_CELL = /^[-+−~]?\d[\d\s.,]*\s?(%|€|k€|j|h|min|s)?$/i;

function buildTable(lines: string[]): Block | null {
    if (lines.length < 2) return null;
    const head = splitRow(lines[0]);
    const rule = splitRow(lines[1]);
    if (head.length < 2 || rule.length !== head.length || !rule.every((c) => TABLE_RULE_CELL.test(c))) return null;

    const rows = lines.slice(2).map((l) => {
        const cells = splitRow(l).slice(0, head.length);
        while (cells.length < head.length) cells.push("");
        return cells;
    });
    // Right-align a column when the model said so, or when every value is a figure.
    const numeric = head.map((_, c) => {
        if (rule[c].endsWith(":") && !rule[c].startsWith(":")) return true;
        const values = rows.map((r) => r[c].replace(/\*\*/g, "").trim()).filter(Boolean);
        return values.length > 0 && values.every((v) => NUMERIC_CELL.test(v));
    });
    return { kind: "table", head, rows, numeric };
}

/**
 * "- **Armel** : 52" style lists read better as a two-column table. Only when
 * every item is exactly label + figure (+ a short unit), so no sentence is lost.
 */
const KEY_VALUE = /^(?:\*\*)?([^:*|]{1,60}?)(?:\*\*)?\s*(?::|—|–)\s*(?:\*\*)?(\d[\d\s.,]*\s?(?:%|€|k€)?(?:\s[a-zà-ÿ]{2,12})?)(?:\*\*)?\s*$/i;

/** A bare count ("52", "1 240"), the only kind of value that gets a bar. */
const COUNT = /^\d{1,3}(?:\s?\d{3})*$|^\d+$/;

interface KeyValueList {
    pairs: Array<{ label: string; value: string; count: number | null }>;
    /** Largest count when every value is a count, so bars share one scale. */
    max: number | null;
}

function toKeyValue(items: string[]): KeyValueList | null {
    if (items.length < 3) return null;
    const pairs: KeyValueList["pairs"] = [];
    for (const item of items) {
        const m = KEY_VALUE.exec(item.trim());
        if (!m) return null;
        const value = m[2].trim();
        pairs.push({ label: m[1].trim(), value, count: COUNT.test(value) ? Number(value.replace(/\s/g, "")) : null });
    }
    const counts = pairs.map((p) => p.count);
    const max = counts.every((c) => c !== null) ? Math.max(...(counts as number[])) : null;
    return { pairs, max: max && max > 0 ? max : null };
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

function parseBlocks(content: string): Block[] {
    const blocks: Block[] = [];
    let current: Block | null = null;

    const flush = () => {
        if (current?.kind === "tbl") {
            blocks.push(buildTable(current.lines) ?? { kind: "p", lines: current.lines });
        } else if (current) {
            blocks.push(current);
        }
        current = null;
    };

    for (const rawLine of content.split("\n")) {
        const line = rawLine.trimEnd();

        if (!line.trim()) {
            flush();
            continue;
        }

        if (TABLE_LINE.test(line)) {
            if (current?.kind !== "tbl") {
                flush();
                current = { kind: "tbl", lines: [] };
            }
            current.lines.push(line);
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            flush();
            blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
            continue;
        }

        const bullet = BULLET.exec(line);
        if (bullet) {
            if (current?.kind !== "ul") {
                flush();
                current = { kind: "ul", items: [] };
            }
            current.items.push(bullet[1]);
            continue;
        }

        const numbered = NUMBERED.exec(line);
        if (numbered) {
            if (current?.kind !== "ol") {
                flush();
                // A step list interrupted by sub-bullets resumes at its own
                // number ("2.", "3.") instead of restarting at 1.
                current = { kind: "ol", items: [], start: Number(numbered[1]) || 1 };
            }
            current.items.push(numbered[2]);
            continue;
        }

        if (current?.kind !== "p") {
            flush();
            current = { kind: "p", lines: [] };
        }
        current.lines.push(line);
    }

    flush();
    return blocks;
}

function Markdown({ content }: { content: string }) {
    const blocks = useMemo(() => parseBlocks(content), [content]);

    return (
        <div className="ap-md">
            {blocks.map((block, index) => {
                const key = `b${index}`;

                if (block.kind === "h") {
                    return (
                        <p key={key} className="ap-md-h">
                            {renderInline(block.text, key)}
                        </p>
                    );
                }
                if (block.kind === "table") {
                    return (
                        <div key={key} className="ap-md-table-wrap">
                            <table className="ap-md-table">
                                <thead>
                                    <tr>
                                        {block.head.map((cell, c) => (
                                            <th key={`${key}-h${c}`} scope="col" data-num={block.numeric[c] || undefined}>
                                                {renderInline(cell, `${key}-h${c}`)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {block.rows.map((row, r) => (
                                        <tr key={`${key}-r${r}`}>
                                            {row.map((cell, c) => (
                                                <td key={`${key}-r${r}c${c}`} data-num={block.numeric[c] || undefined}>
                                                    {renderInline(cell, `${key}-r${r}c${c}`)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }
                if (block.kind === "tbl") return null;
                if (block.kind === "ul") {
                    const list = toKeyValue(block.items);
                    if (list) {
                        const { pairs, max } = list;
                        return (
                            <div key={key} className="ap-md-table-wrap">
                                <table className="ap-md-table ap-md-kv">
                                    <tbody>
                                        {pairs.map((pair, i) => (
                                            <tr key={`${key}-${i}`}>
                                                <th scope="row">{pair.label}</th>
                                                <td data-num>{pair.value}</td>
                                                {max !== null && (
                                                    <td className="ap-md-bar" aria-hidden>
                                                        <span style={{ width: `${((pair.count ?? 0) / max) * 100}%` }} />
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    }
                    return (
                        <ul key={key} className="ap-md-ul">
                            {block.items.map((item, i) => (
                                <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
                            ))}
                        </ul>
                    );
                }
                if (block.kind === "ol") {
                    return (
                        <ol
                            key={key}
                            className="ap-md-ol"
                            start={block.start}
                            style={{ counterReset: `ap-step ${block.start - 1}` }}
                        >
                            {block.items.map((item, i) => (
                                <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
                            ))}
                        </ol>
                    );
                }
                return (
                    <p key={key} className="ap-md-p">
                        {block.lines.map((line, i) => (
                            <span key={`${key}-${i}`}>
                                {i > 0 && <br />}
                                {renderInline(line, `${key}-${i}`)}
                            </span>
                        ))}
                    </p>
                );
            })}
        </div>
    );
}

export default memo(Markdown);
