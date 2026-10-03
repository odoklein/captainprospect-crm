"use client";

// ============================================
// RichTextEditor – Clean, modern textarea with @mentions
// ============================================

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Bold, Italic, Code, AtSign, Smile } from "lucide-react";

export interface MentionOption {
    id: string;
    name: string;
}

interface RichTextEditorProps {
    value: string;
    onChange: (value: string, mentionIds: string[]) => void;
    onBlur?: () => void;
    /** Called on Enter (without Shift) – e.g. send message */
    onSubmit?: () => void;
    placeholder?: string;
    disabled?: boolean;
    /** Participants or users for @mention dropdown */
    mentionOptions: MentionOption[];
    /** Fetch users for @mention when typing @ (optional, else use mentionOptions) */
    onMentionSearch?: (query: string) => Promise<MentionOption[]>;
    className?: string;
    minRows?: number;
    maxRows?: number;
}

function wrapSelection(
    text: string,
    start: number,
    end: number,
    before: string,
    after: string
): { text: string; cursor: number } {
    const sel = text.slice(start, end);
    const pre = text.slice(0, start);
    const post = text.slice(end);
    const newText = pre + before + sel + after + post;
    const cursor = start + before.length + sel.length + after.length;
    return { text: newText, cursor };
}

export function RichTextEditor({
    value,
    onChange,
    onBlur,
    onSubmit,
    placeholder = "Écrire un message...",
    disabled,
    mentionOptions,
    onMentionSearch,
    className,
    minRows = 1,
    maxRows = 8,
}: RichTextEditorProps) {
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionResults, setMentionResults] = useState<MentionOption[]>([]);
    const [showMentionList, setShowMentionList] = useState(false);
    const [mentionAnchor, setMentionAnchor] = useState(0);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [collectedMentionIds, setCollectedMentionIds] = useState<string[]>([]);
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const runMentionSearch = useCallback(
        async (q: string) => {
            if (onMentionSearch) {
                const res = await onMentionSearch(q);
                setMentionResults(res);
            } else {
                const lower = q.toLowerCase();
                const filtered = mentionOptions.filter((o) =>
                    o.name.toLowerCase().includes(lower)
                );
                setMentionResults(filtered.slice(0, 8));
            }
            setMentionIndex(0);
            setShowMentionList(true);
        },
        [mentionOptions, onMentionSearch]
    );

    const insertMarkdown = useCallback(
        (before: string, after: string) => {
            const ta = textareaRef.current;
            if (!ta) return;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const { text, cursor } = wrapSelection(value, start, end, before, after);
            onChange(text, collectedMentionIds);
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(cursor, cursor);
            });
        },
        [value, onChange, collectedMentionIds]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (showMentionList) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) =>
                        i < mentionResults.length - 1 ? i + 1 : 0
                    );
                    return;
                }
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((i) =>
                        i > 0 ? i - 1 : mentionResults.length - 1
                    );
                    return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    const u = mentionResults[mentionIndex];
                    if (u) {
                        const pre = value.slice(0, mentionAnchor);
                        const post = value.slice(textareaRef.current?.selectionStart ?? value.length);
                        const insert = `@${u.name} `;
                        const next = pre + insert + post;
                        setCollectedMentionIds((ids) =>
                            ids.includes(u.id) ? ids : [...ids, u.id]
                        );
                        onChange(next, [...collectedMentionIds, u.id].filter(
                            (id, i, a) => a.indexOf(id) === i
                        ));
                        setShowMentionList(false);
                        requestAnimationFrame(() => {
                            const ta = textareaRef.current;
                            if (ta) {
                                const pos = mentionAnchor + insert.length;
                                ta.setSelectionRange(pos, pos);
                                ta.focus();
                            }
                        });
                    }
                    return;
                }
                if (e.key === "Escape") {
                    setShowMentionList(false);
                    return;
                }
            }

            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit?.();
            }
        },
        [
            showMentionList,
            mentionResults,
            mentionIndex,
            mentionAnchor,
            value,
            onChange,
            collectedMentionIds,
            onSubmit,
        ]
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const v = e.target.value;
            const pos = e.target.selectionStart ?? 0;

            const match = /\@([^\s]*)$/.exec(v.slice(0, pos));
            if (match) {
                setMentionAnchor(pos - match[0].length);
                setMentionQuery(match[1]);
                runMentionSearch(match[1]);
            } else {
                setShowMentionList(false);
            }

            const ids = v.trim() ? collectedMentionIds : [];
            if (ids.length !== collectedMentionIds.length) setCollectedMentionIds(ids);
            onChange(v, ids);
        },
        [onChange, collectedMentionIds, runMentionSearch]
    );

    const handleSelectMention = useCallback(
        (u: MentionOption) => {
            const pre = value.slice(0, mentionAnchor);
            const post = value.slice(textareaRef.current?.selectionStart ?? value.length);
            const insert = `@${u.name} `;
            const next = pre + insert + post;
            const ids = collectedMentionIds.includes(u.id)
                ? collectedMentionIds
                : [...collectedMentionIds, u.id];
            setCollectedMentionIds(ids);
            onChange(next, ids);
            setShowMentionList(false);
            requestAnimationFrame(() => {
                const ta = textareaRef.current;
                if (ta) {
                    const pos = mentionAnchor + insert.length;
                    ta.setSelectionRange(pos, pos);
                    ta.focus();
                }
            });
        },
        [value, mentionAnchor, collectedMentionIds, onChange]
    );

    useEffect(() => {
        if (!showMentionList) return;
        const el = listRef.current;
        if (!el) return;
        const child = el.children[mentionIndex] as HTMLElement;
        child?.scrollIntoView({ block: "nearest" });
    }, [showMentionList, mentionIndex]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        const newHeight = Math.min(ta.scrollHeight, maxRows * 24);
        ta.style.height = `${newHeight}px`;
    }, [value, maxRows]);

    return (
        <div className={cn("relative", className)}>
            {/* Toolbar - only visible when focused and has content */}
            <div className={cn(
                "flex items-center gap-1 px-3 pt-2 transition-all",
                (isFocused || value) ? "opacity-100" : "opacity-0 h-0 overflow-hidden pt-0"
            )}>
                <button
                    type="button"
                    onClick={() => insertMarkdown("**", "**")}
                    disabled={disabled}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    title="Gras (Ctrl+B)"
                >
                    <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => insertMarkdown("*", "*")}
                    disabled={disabled}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    title="Italique (Ctrl+I)"
                >
                    <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => insertMarkdown("`", "`")}
                    disabled={disabled}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    title="Code"
                >
                    <Code className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <AtSign className="w-3 h-3" />
                    mentionner
                </span>
            </div>

            {/* Textarea */}
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        setTimeout(() => setShowMentionList(false), 150);
                        setIsFocused(false);
                        onBlur?.();
                    }}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={minRows}
                    className={cn(
                        "w-full resize-none bg-transparent px-4 py-3 text-sm",
                        "!text-slate-900 placeholder:!text-slate-400",
                        "focus:outline-none",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                    style={{
                        minHeight: `${minRows * 24 + 12}px`,
                        maxHeight: `${maxRows * 24}px`,
                    }}
                />

                {/* Mention dropdown */}
                {showMentionList && mentionResults.length > 0 && (
                    <div
                        ref={listRef}
                        className="absolute left-0 right-0 bottom-full mb-2 bg-white rounded-xl shadow-xl border border-slate-200 py-2 max-h-52 overflow-y-auto z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
                    >
                        <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                                Mentionner quelqu'un
                            </span>
                        </div>
                        {mentionResults.map((u, i) => (
                            <button
                                key={u.id}
                                type="button"
                                onClick={() => handleSelectMention(u)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                    i === mentionIndex
                                        ? "bg-primary-50 text-primary-900"
                                        : "text-slate-700 hover:bg-slate-50"
                                )}
                            >
                                <span className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold",
                                    i === mentionIndex
                                        ? "bg-primary-500 text-white"
                                        : "bg-slate-100 text-slate-600"
                                )}>
                                    {u.name.charAt(0).toUpperCase()}
                                </span>
                                <span className="font-medium">{u.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
