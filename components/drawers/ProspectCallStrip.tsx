"use client";

// ============================================
// CALL STRIP — top of the pane's « Appel » tab: the number that will be
// dialled (Direct / Standard), one green « Appeler », and the other ways to
// reach the prospect as quiet icons. Shows « En appel » while the call to this
// prospect is live.
// ============================================

import { useState } from "react";
import { Check, Copy, Globe, Linkedin, Mail, Phone, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";

export function ProspectCallStrip({
    phone,
    phoneKind,
    onCall,
    onHangup,
    live,
    email,
    linkedin,
    website,
}: {
    phone: string | null;
    phoneKind: "Direct" | "Standard";
    onCall: () => void;
    onHangup: () => void;
    live: boolean;
    email: string | null;
    linkedin: string | null;
    website: string | null;
}) {
    const [copied, setCopied] = useState(false);
    const url = (u: string) => (u.startsWith("http") ? u : `https://${u}`);
    const icon = "cp-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 ring-1 ring-inset ring-line hover:bg-surface-2 hover:text-ink";

    return (
        <section aria-label="Joindre le prospect" className="flex items-center gap-2.5 rounded-2xl bg-surface-2/70 p-2 pl-3.5 ring-1 ring-inset ring-line-subtle">
            <div className="min-w-0 flex-1">
                {phone ? (
                    <>
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{phoneKind}</p>
                        <p className="truncate font-mono text-[15px] font-semibold tabular-nums tracking-tight text-ink">{formatPhone(phone)}</p>
                    </>
                ) : (
                    <p className="text-[12.5px] text-ink-3">Aucun numéro sur la fiche</p>
                )}
            </div>
            {phone && (
                <button
                    type="button"
                    onClick={() => {
                        void navigator.clipboard?.writeText(phone);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1400);
                    }}
                    className={icon}
                    aria-label="Copier le numéro"
                    title="Copier le numéro"
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            )}
            {email && (
                <a href={`mailto:${email}`} className={icon} aria-label={`Email à ${email}`} title={email}>
                    <Mail className="h-3.5 w-3.5" />
                </a>
            )}
            {linkedin && (
                <a href={url(linkedin)} target="_blank" rel="noopener noreferrer" className={icon} aria-label="Profil LinkedIn" title="LinkedIn">
                    <Linkedin className="h-3.5 w-3.5" />
                </a>
            )}
            {website && (
                <a href={url(website)} target="_blank" rel="noopener noreferrer" className={icon} aria-label="Site web" title={website}>
                    <Globe className="h-3.5 w-3.5" />
                </a>
            )}
            {phone &&
                (live ? (
                    <button
                        type="button"
                        onClick={onHangup}
                        className="cp-press flex h-10 shrink-0 items-center gap-2 rounded-full bg-danger px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_-10px_var(--ds-danger)] hover:brightness-110"
                    >
                        <PhoneOff className="h-4 w-4" /> Raccrocher
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onCall}
                        className={cn(
                            "cp-press flex h-10 shrink-0 items-center gap-2 rounded-full bg-success px-4 text-[13px] font-semibold text-white",
                            "shadow-[0_8px_20px_-10px_var(--ds-success)] hover:brightness-110",
                        )}
                    >
                        <Phone className="h-4 w-4" /> Appeler
                    </button>
                ))}
        </section>
    );
}
