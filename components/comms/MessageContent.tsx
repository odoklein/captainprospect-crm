"use client";

// ============================================
// MessageContent – render message body as markdown
// ============================================

import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageContentProps {
    content: string;
    className?: string;
    /** For own messages (e.g. inverted colors) */
    isOwn?: boolean;
}

export function MessageContent({
    content,
    className,
    isOwn,
}: MessageContentProps) {
    return (
        <div
            className={cn(
                "prose prose-sm max-w-none break-words prose-p:my-0.5 prose-ul:my-1 prose-li:my-0",
                isOwn ? "prose-invert" : "prose-slate text-slate-800 dark:text-slate-200",
                className
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "underline",
                                isOwn ? "text-primary-200 hover:text-white" : "text-primary-600 hover:text-primary-800"
                            )}
                        >
                            {children}
                        </a>
                    ),
                    code: ({ className: codeClassName, children, ...props }) => {
                        const isBlock = String(codeClassName ?? "").includes("language-");
                        if (isBlock) {
                            return (
                                <pre
                                    className={cn(
                                        "rounded-lg p-2 text-xs overflow-x-auto my-2",
                                        isOwn ? "bg-white/10" : "bg-slate-200/80"
                                    )}
                                >
                                    <code {...props}>{children}</code>
                                </pre>
                            );
                        }
                        return (
                            <code
                                className={cn(
                                    "rounded px-1 py-0.5 text-xs font-mono",
                                    isOwn ? "bg-white/20" : "bg-slate-200/80"
                                )}
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
