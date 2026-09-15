"use client";

/**
 * Minimal Markdown renderer for assistant answers.
 *
 * Why not react-markdown (which this project already ships): everything here is
 * built as React nodes, so model output can never inject markup — there is no
 * `dangerouslySetInnerHTML` anywhere in the path. The model emits a small
 * subset anyway: headings, lists, bold, italic, inline code, links.
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
    | { kind: "ol"; items: string[] };

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(content: string): Block[] {
    const blocks: Block[] = [];
    let current: Block | null = null;

    const flush = () => {
        if (current) blocks.push(current);
        current = null;
    };

    for (const rawLine of content.split("\n")) {
        const line = rawLine.trimEnd();

        if (!line.trim()) {
            flush();
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
                current = { kind: "ol", items: [] };
            }
            current.items.push(numbered[1]);
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
                if (block.kind === "ul") {
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
                        <ol key={key} className="ap-md-ol">
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
