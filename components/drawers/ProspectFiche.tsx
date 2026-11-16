"use client";

// ============================================
// PROSPECT FICHE — the docked pane's « who am I calling » block.
//
// One card, read top to bottom: how to reach them (the call strip), then the
// facts an SDR glances at mid-call — role, company, size, country — as dense
// label/value rows. Nothing the strip already shows (dialled number, email,
// LinkedIn, website) is repeated. The other contacts of the account fold into
// one line. Editing still opens the full sections (rendered by the drawer).
// ============================================

import { useState, type ReactNode } from "react";
import { Ban, Building2, Check, ChevronDown, Copy, Pencil, Plus, UserX, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayPhone } from "@/lib/sdr-queue/display";

export interface FicheFact {
    label: string;
    value: ReactNode;
    /** Copied to the clipboard by the row's copy button. */
    copy?: string;
    href?: string;
}

function CopyInline({ text, label }: { text: string; label: string }) {
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                void navigator.clipboard?.writeText(text);
                setDone(true);
                setTimeout(() => setDone(false), 1400);
            }}
            className="grid size-6 shrink-0 place-items-center rounded-md text-ink-4 opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus group-hover:opacity-100"
            aria-label={`Copier ${label}`}
            title={`Copier ${label}`}
        >
            {done ? <Check className="size-3 text-success" aria-hidden /> : <Copy className="size-3" aria-hidden />}
        </button>
    );
}

function IconAction({ label, onClick, tone = "neutral", children }: { label: string; onClick: () => void; tone?: "neutral" | "danger"; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                "grid size-7 place-items-center rounded-md text-ink-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                tone === "danger" ? "hover:bg-danger-soft hover:text-danger-ink" : "hover:bg-surface-3 hover:text-ink",
            )}
        >
            {children}
        </button>
    );
}

/** A phone number written the French way, keeping the raw value for copy. */
export function phoneFact(label: string, raw: string): FicheFact {
    return { label, value: <span className="tabular-nums">{displayPhone(raw)?.text ?? raw}</span>, copy: raw, href: `tel:${raw}` };
}

export function ProspectFiche({
    callStrip,
    facts,
    extras,
    note,
    enrichment,
    hasContact,
    accountCount,
    account,
    onEditContact,
    onEditCompany,
    onBadContact,
    onBlacklist,
    onAddContact,
    onNewCompany,
}: {
    callStrip: ReactNode;
    facts: FicheFact[];
    /** Imported columns (« infos supplémentaires »), shown after the facts. */
    extras: { label: string; value: string }[];
    /** A muted provenance line (who added the company, from where). */
    note?: string | null;
    /** The AI lookup for incomplete sheets. */
    enrichment?: ReactNode;
    hasContact: boolean;
    accountCount: number;
    account?: ReactNode;
    onEditContact?: () => void;
    onEditCompany?: () => void;
    onBadContact?: () => void;
    onBlacklist?: () => void;
    onAddContact?: () => void;
    onNewCompany?: () => void;
}) {
    const [allExtras, setAllExtras] = useState(false);
    const shownExtras = allExtras ? extras : extras.slice(0, 4);
    const rows = [...facts, ...shownExtras.map((x) => ({ label: x.label, value: x.value, copy: undefined, href: undefined }) as FicheFact)];

    return (
        <section aria-label="Contact et société" className="overflow-hidden rounded-xl border border-line bg-surface">
            {callStrip}

            <div className="border-t border-line-subtle">
                <div className="flex items-center gap-1 py-1 pl-3.5 pr-1.5">
                    <h3 className="flex-1 text-[11.5px] font-medium text-ink-3">Contact &amp; société</h3>
                    {onBadContact && (
                        <IconAction label="Marquer comme mauvais contact" onClick={onBadContact} tone="danger">
                            <UserX className="size-3.5" aria-hidden />
                        </IconAction>
                    )}
                    {onEditContact && (
                        <IconAction label="Modifier le contact" onClick={onEditContact}>
                            <Pencil className="size-3.5" aria-hidden />
                        </IconAction>
                    )}
                    {onEditCompany && (
                        <IconAction label="Modifier la société" onClick={onEditCompany}>
                            <Building2 className="size-3.5" aria-hidden />
                        </IconAction>
                    )}
                    {onBlacklist && (
                        <IconAction label="Blacklister ce contact ou la société" onClick={onBlacklist} tone="danger">
                            <Ban className="size-3.5" aria-hidden />
                        </IconAction>
                    )}
                </div>

                {!hasContact && (
                    <div className="mx-3.5 mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                        <span className="flex-1">Aucun contact sur cette société.</span>
                        {onNewCompany && (
                            <button type="button" onClick={onNewCompany} className="rounded-md px-2 py-1 font-medium text-ink-2 hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                                Nouvelle société
                            </button>
                        )}
                        {onAddContact && (
                            <button type="button" onClick={onAddContact} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-fg hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                                <Plus className="size-3.5" aria-hidden /> Ajouter un contact
                            </button>
                        )}
                    </div>
                )}

                {rows.length > 0 && (
                    <dl className="grid grid-cols-[minmax(76px,auto)_1fr] gap-x-3 px-3.5 pb-2.5 text-[12.5px] leading-5">
                        {rows.map((r, i) => (
                            <div key={`${r.label}-${i}`} className="group contents">
                                <dt className="truncate py-0.5 text-ink-4">{r.label}</dt>
                                <dd className="flex min-w-0 items-center gap-1 py-0.5 text-ink">
                                    {r.href ? (
                                        <a href={r.href} className="min-w-0 truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                                            {r.value}
                                        </a>
                                    ) : (
                                        <span className="min-w-0 break-words">{r.value}</span>
                                    )}
                                    {r.copy && <CopyInline text={r.copy} label={r.label.toLowerCase()} />}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
                {extras.length > 4 && (
                    <button
                        type="button"
                        onClick={() => setAllExtras((v) => !v)}
                        aria-expanded={allExtras}
                        className="-mt-1.5 mb-2 ml-2 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-3 hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        {allExtras ? "Moins d’infos" : `+ ${extras.length - 4} info${extras.length - 4 > 1 ? "s" : ""}`}
                    </button>
                )}
                {note && <p className="px-3.5 pb-2.5 text-[11.5px] leading-4 text-ink-4">{note}</p>}
                {enrichment && <div className="border-t border-line-subtle px-3.5 py-2.5">{enrichment}</div>}
            </div>

            {account && accountCount > 0 && (
                <details className="group/acc border-t border-line-subtle">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2 text-[12.5px] text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
                        <Users className="size-3.5 text-ink-4" aria-hidden />
                        <span className="flex-1">
                            Contacts du compte <span className="tabular-nums text-ink-4">· {accountCount}</span>
                        </span>
                        <ChevronDown className="size-3.5 text-ink-4 transition-transform group-open/acc:rotate-180" aria-hidden />
                    </summary>
                    <div className="px-2 pb-2">{account}</div>
                </details>
            )}
        </section>
    );
}

/**
 * The account's history, folded to one line in the docked pane: how many
 * exchanges, and the last one (outcome · when · who). Opening it shows the
 * full activity feed. The classic drawer renders the children as they are.
 */
export function HistoryFold({
    folded,
    count,
    last,
    loading,
    children,
}: {
    folded: boolean;
    count: number;
    last?: { label: string; at: string; by?: string | null } | null;
    loading?: boolean;
    children: ReactNode;
}) {
    if (!folded) return <>{children}</>;
    const when = last ? relativeDay(last.at) : null;
    return (
        <details className="group/hist rounded-xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus group-open/hist:rounded-b-none [&::-webkit-details-marker]:hidden">
                <span className="font-medium text-ink">Historique</span>
                <span className="tabular-nums text-ink-4">· {loading && !count ? "…" : count}</span>
                <span className="min-w-0 flex-1 truncate text-right text-ink-3">
                    {last ? (
                        <>
                            <span className="text-ink-2">{last.label}</span>
                            {` · ${when}`}
                            {last.by ? ` · ${last.by}` : ""}
                        </>
                    ) : loading ? (
                        ""
                    ) : (
                        "Aucun échange"
                    )}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-ink-4 transition-transform group-open/hist:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-3 border-t border-line-subtle px-3 pb-3 pt-2">{children}</div>
        </details>
    );
}

/** « aujourd’hui 14:05 », « hier », « 12 nov. » — what an SDR reads at a glance. */
export function relativeDay(iso: string, now = new Date()): string {
    const d = new Date(iso);
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86_400_000);
    if (diff === 0) return `aujourd’hui ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    if (diff === 1) return "hier";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
