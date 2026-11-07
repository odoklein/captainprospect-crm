"use client";

/**
 * Tool inputs and outputs, small: text goes through markdown, a flat object
 * becomes « clé : valeur » rows, anything deeper is shown as indented JSON.
 */

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
    return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function CompactMarkdown({ content, className }: { content: unknown; className?: string }) {
    if (content === undefined || content === "") return null;

    if (typeof content === "string") {
        return (
            <div
                className={cn(
                    "max-w-[28rem] break-words text-[11px] leading-relaxed text-ink-2",
                    "[&_p]:my-0 [&_p+p]:mt-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4",
                    "[&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_a]:text-link [&_a]:underline",
                    className,
                )}
            >
                <ReactMarkdown>{content}</ReactMarkdown>
            </div>
        );
    }

    if (isPlainObject(content) && Object.values(content).every(isScalar)) {
        return (
            <dl className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]", className)}>
                {Object.entries(content).map(([key, value]) => (
                    <div key={key} className="contents">
                        <dt className="font-mono text-ink-4">{key}</dt>
                        <dd className="min-w-0 break-words text-ink-2">{String(value)}</dd>
                    </div>
                ))}
            </dl>
        );
    }

    return (
        <pre className={cn("max-w-[28rem] overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-ink-2", className)}>
            {JSON.stringify(content, null, 2)}
        </pre>
    );
}
