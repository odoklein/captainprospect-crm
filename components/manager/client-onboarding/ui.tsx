"use client";

import { useId, useState, type ReactNode, type KeyboardEvent } from "react";
import { ChevronDown, FileText, type LucideIcon } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { FIELD_BASE, FIELD_ERROR, EYEBROW, FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";

/** « IA » next to a label while the value is still the AI's proposal. */
export function AiHint({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-accent-600" title="Pré-rempli par l'IA : à vérifier">
            <AiMark className="size-3" aria-hidden />
            IA
        </span>
    );
}

export function Section({
    title,
    description,
    icon: Icon,
    action,
    children,
    className,
}: {
    title: string;
    description?: ReactNode;
    icon?: LucideIcon;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("rounded-panel border border-line bg-surface", className)}>
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line-subtle px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-start gap-2.5">
                    {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden />}
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-ink">{title}</h3>
                        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</p>}
                    </div>
                </div>
                {action}
            </header>
            <div className="space-y-4 px-4 py-4 sm:px-5">{children}</div>
        </section>
    );
}

interface TextFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    ai?: boolean;
    error?: string;
    hint?: ReactNode;
    placeholder?: string;
    type?: "text" | "email" | "tel" | "url" | "date" | "number";
    required?: boolean;
    suggestions?: string[];
    min?: number;
    max?: number;
    autoFocus?: boolean;
    className?: string;
}

export function TextField({ label, value, onChange, ai, error, hint, placeholder, type = "text", required, suggestions, min, max, autoFocus, className }: TextFieldProps) {
    const id = useId();
    const listId = suggestions?.length ? `${id}-list` : undefined;
    return (
        <Field label={label} htmlFor={id} required={required} error={error} hint={hint} aside={<AiHint show={!!ai} />} className={className}>
            <input
                id={id}
                type={type}
                value={value}
                min={min}
                max={max}
                list={listId}
                autoFocus={autoFocus}
                placeholder={placeholder}
                aria-invalid={Boolean(error) || undefined}
                onChange={(e) => onChange(e.target.value)}
                className={cn(FIELD_BASE, "h-10 px-3.5 text-sm", error && FIELD_ERROR)}
            />
            {listId && (
                <datalist id={listId}>
                    {suggestions!.map((s) => (
                        <option key={s} value={s} />
                    ))}
                </datalist>
            )}
        </Field>
    );
}

export function NumberField({ label, value, onChange, min = 0, max, ai, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; ai?: boolean; hint?: ReactNode }) {
    const id = useId();
    return (
        <Field label={label} htmlFor={id} aside={<AiHint show={!!ai} />} hint={hint}>
            <input
                id={id}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                value={Number.isFinite(value) ? value : ""}
                onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    onChange(Number.isNaN(n) ? 0 : Math.max(min, max !== undefined ? Math.min(max, n) : n));
                }}
                className={cn(FIELD_BASE, "h-10 px-3.5 text-sm tabular-nums")}
            />
        </Field>
    );
}

export function TextAreaField({ label, value, onChange, ai, placeholder, rows = 4, hint, mono }: { label: string; value: string; onChange: (v: string) => void; ai?: boolean; placeholder?: string; rows?: number; hint?: ReactNode; mono?: boolean }) {
    const id = useId();
    return (
        <Field label={label} htmlFor={id} aside={<AiHint show={!!ai} />} hint={hint}>
            <textarea
                id={id}
                rows={rows}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className={cn(FIELD_BASE, "min-h-20 resize-y px-3.5 py-2.5 text-sm leading-relaxed", mono && "font-mono text-[13px]")}
            />
        </Field>
    );
}

/** Chips + free input (Entrée or virgule to add) + one-click suggestions. */
export function TagField({
    label,
    values,
    onChange,
    suggestions = [],
    placeholder = "Ajouter…",
    ai,
}: {
    label: string;
    values: string[];
    onChange: (values: string[]) => void;
    suggestions?: string[];
    placeholder?: string;
    ai?: boolean;
}) {
    const id = useId();
    const [draft, setDraft] = useState("");
    const add = (raw: string) => {
        const v = raw.trim().replace(/,$/, "").trim();
        if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
        setDraft("");
    };
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
        } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
        }
    };
    const open = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
    return (
        <Field label={label} htmlFor={id} aside={<AiHint show={!!ai} />}>
            <div className={cn(FIELD_BASE, "flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-500/12")}>
                {values.map((v) => (
                    <Chip key={v} onRemove={() => onChange(values.filter((x) => x !== v))} className="h-7">
                        {v}
                    </Chip>
                ))}
                <input
                    id={id}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={() => draft.trim() && add(draft)}
                    placeholder={values.length ? "" : placeholder}
                    className="h-7 min-w-28 flex-1 bg-transparent px-1.5 text-sm text-ink outline-none placeholder:text-ink-4"
                />
            </div>
            {open.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {open.slice(0, 8).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => add(s)}
                            className={cn("h-6 rounded-chip border border-dashed border-line px-2 text-2xs font-medium text-ink-3 transition-colors hover:border-primary-300 hover:text-primary-700", FOCUS_RING)}
                        >
                            + {s}
                        </button>
                    ))}
                </div>
            )}
        </Field>
    );
}

/** The recap the AI read, one click away, to check a value against its source. */
export function SourcePeek({ text, title = "Récap source" }: { text: string; title?: string }) {
    const [open, setOpen] = useState(false);
    if (!text.trim()) return null;
    return (
        <div className="rounded-panel border border-line bg-surface-2">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className={cn("flex w-full items-center justify-between gap-2 rounded-panel px-4 py-2.5 text-left", FOCUS_RING)}
            >
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                    <FileText className="size-4 text-ink-3" aria-hidden />
                    {title}
                    <span className="text-xs font-normal text-ink-4">{text.length.toLocaleString("fr-FR")} caractères</span>
                </span>
                <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            {open && (
                // No inner scroll: the wizard body already scrolls, and a scroll box inside it read as a second scrollbar.
                <div className="border-t border-line px-4 py-3">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-2">{text}</p>
                </div>
            )}
        </div>
    );
}

export function Eyebrow({ children }: { children: ReactNode }) {
    return <p className={EYEBROW}>{children}</p>;
}
