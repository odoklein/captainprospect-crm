"use client";

// ============================================
// Appeler table cells. Each cell holds one idea on at most two lines: what
// matters in ink, the context in a quieter grey, colour only where the SDR has
// to act (a missed meeting, a callback that is due). No badges, no pills.
// ============================================

import type { MouseEvent } from "react";
import { Building2, ChevronRight, Copy, Phone, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayPhone, nextStep, relativeDay, rowInitials, type NextStepTone } from "@/lib/sdr-queue/display";
import { shortLabel } from "@/components/drawers/ResultPicker";

// ── Prospect ─────────────────────────────────────────────────────────────────

export function ProspectCell({
    firstName,
    lastName,
    companyName,
    title,
    isCompany,
    missingInfo,
    absent,
}: {
    firstName?: string | null;
    lastName?: string | null;
    companyName: string;
    title?: string | null;
    isCompany: boolean;
    missingInfo: boolean;
    absent: boolean;
}) {
    const person = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    const name = isCompany ? companyName : person || companyName;
    const meta = isCompany ? null : [companyName !== name ? companyName : null, title].filter(Boolean).join(" · ");
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                aria-hidden
                className={cn(
                    "grid size-7 shrink-0 place-items-center text-[10.5px] font-semibold tracking-wide",
                    isCompany ? "rounded-md bg-surface-3 text-ink-3" : "rounded-full bg-primary-50 text-primary-700",
                    absent && "bg-danger-soft text-danger-ink",
                )}
            >
                {isCompany ? <Building2 className="size-3.5" /> : rowInitials(firstName, lastName, companyName)}
            </span>
            <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold leading-5 text-ink" title={name}>
                    {name}
                </p>
                <p className="truncate text-xs leading-4 text-ink-3" title={meta || undefined}>
                    {missingInfo ? (
                        <span className="text-warning-ink">Aucune coordonnée · à enrichir</span>
                    ) : isCompany ? (
                        "Société"
                    ) : (
                        meta || " "
                    )}
                </p>
            </div>
        </div>
    );
}

// ── Téléphone ────────────────────────────────────────────────────────────────

export function PhoneCell({
    phone,
    isSwitchboard,
    alreadyCalled,
    onCall,
    onCopy,
}: {
    phone: string | null | undefined;
    /** The contact has no number of their own: this is the company's. */
    isSwitchboard: boolean;
    /** Tooltip when this number was already dialled for another contact. */
    alreadyCalled: string | null;
    onCall: (e: MouseEvent) => void;
    /** Copies (or warns first when the prospect was contacted recently). */
    onCopy: () => void;
}) {
    const shown = displayPhone(phone);
    if (!phone || !shown) return <span className="text-xs text-ink-4">Pas de numéro</span>;
    const kind = isSwitchboard ? "Standard" : shown.mobile ? "Mobile" : "Fixe";
    const Icon = shown.mobile && !isSwitchboard ? Smartphone : Phone;
    return (
        <div className="min-w-0">
            <div className="flex items-center gap-0.5">
                <a
                    href={`tel:${phone}`}
                    data-softphone="managed"
                    onClick={onCall}
                    title={`Appeler ${shown.text}`}
                    className="-ml-1 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium tabular-nums text-ink transition-colors hover:bg-success-soft hover:text-success-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                    <Icon className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                    <span className="truncate">{shown.text}</span>
                </a>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCopy();
                    }}
                    aria-label={`Copier ${shown.text}`}
                    title="Copier le numéro"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-ink-4 opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus [@media(hover:none)]:opacity-100"
                >
                    <Copy className="size-3.5" />
                </button>
            </div>
            <p className="truncate pl-1 text-xs leading-4 text-ink-4">
                {kind}
                {alreadyCalled && (
                    <span className="text-warning-ink" title={alreadyCalled}>
                        {" "}· déjà appelé
                    </span>
                )}
            </p>
        </div>
    );
}

// ── Dernier échange ──────────────────────────────────────────────────────────

/** Dot colour when the mission's status has no colour of its own. */
function fallbackDot(code: string): string {
    if (/MEETING_BOOKED|INTERESTED|PROJET|MAIL_ENVOYE|REPLIED/.test(code)) return "var(--color-success)";
    if (/CALLBACK|RAPPEL|RELANCE/.test(code)) return "var(--color-warning)";
    if (/REFUS|NOT_INTERESTED|DISQUALIFIED|BAD_CONTACT|HORS_CIBLE|NUMERO_KO|FAUX_NUMERO|INVALIDE|MAUVAIS/.test(code)) return "var(--color-danger)";
    if (/MAIL/.test(code)) return "var(--color-info)";
    return "var(--color-ink-4)";
}

export function LastExchangeCell({
    result,
    label,
    color,
    at,
    note,
    byOther,
}: {
    result: string | null;
    label: string | null;
    color: string | null;
    at: string | null;
    note: string | null;
    /** Name of the SDR who logged it when it wasn't me. */
    byOther: string | null;
}) {
    if (!result) return <span className="text-xs text-ink-4">Jamais contacté</span>;
    const when = relativeDay(at);
    const line2 = [byOther ? `${byOther} :` : null, note?.trim() || null].filter(Boolean).join(" ");
    return (
        <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: color || fallbackDot(result) }} aria-hidden />
                <span className="truncate font-medium text-ink-2" title={label ?? result}>
                    {shortLabel(label ?? result)}
                </span>
                {when && <span className="shrink-0 text-xs text-ink-4">· {when}</span>}
            </p>
            <p className="truncate pl-3 text-xs leading-4 text-ink-3" title={note ?? undefined}>
                {line2 || " "}
            </p>
        </div>
    );
}

// ── À faire ──────────────────────────────────────────────────────────────────

const TONE: Record<NextStepTone, string> = {
    overdue: "text-danger-ink font-semibold",
    today: "text-warning-ink font-semibold",
    soon: "text-ink font-medium",
    later: "text-ink-2",
};

export function NextStepCell({ absent, callbackAt }: { absent: boolean; callbackAt: string | null }) {
    if (absent) {
        return (
            <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold leading-5 text-danger-ink">RDV manqué</p>
                <p className="truncate text-xs leading-4 text-ink-4">à rappeler en priorité</p>
            </div>
        );
    }
    const step = nextStep(callbackAt);
    if (!step) {
        return (
            <span className="text-xs text-ink-4" aria-label="Rien de planifié">
                —
            </span>
        );
    }
    return (
        <div className="min-w-0" title={step.full}>
            <p className={cn("truncate text-[13px] leading-5 tabular-nums", TONE[step.tone])}>{step.label}</p>
            <p className="truncate text-xs leading-4 text-ink-4">Rappel</p>
        </div>
    );
}

// ── Open ─────────────────────────────────────────────────────────────────────

/** The row opens the pane; this only tells the eye (and screen readers) so. */
export function OpenCell({ label }: { label: string }) {
    return (
        <span className="flex justify-end text-ink-4 transition-colors group-hover:text-ink-2 group-aria-[current=true]:text-primary">
            <ChevronRight className="size-4" aria-hidden />
            <span className="sr-only">{label}</span>
        </span>
    );
}
