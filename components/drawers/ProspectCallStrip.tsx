"use client";

// ============================================
// CALL STRIP — top of the pane's « Appel » tab. The number that will be
// dialled, read the French way, with what kind of line it is; one call button;
// under it, the other ways to reach the prospect written out (the address, not
// a mystery icon). While this prospect is on the line the strip says so and the
// button hangs up.
// ============================================

import { useState } from "react";
import { Check, Copy, Globe, Linkedin, Mail, Phone, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayPhone } from "@/lib/sdr-queue/display";

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
    const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    const shown = displayPhone(phone);
    const kind = phoneKind === "Standard" ? "Standard de la société" : shown?.mobile ? "Mobile" : "Ligne directe";
    const link = "inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

    return (
        <section
            aria-label="Joindre le prospect"
            className={cn(
                "rounded-xl border bg-surface transition-colors duration-300",
                live ? "border-success-line bg-success-soft/40" : "border-line",
            )}
        >
            <div className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                    {shown ? (
                        <>
                            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
                                {live ? (
                                    <>
                                        <span className="relative flex size-1.5">
                                            <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                                            <span className="relative size-1.5 rounded-full bg-success" />
                                        </span>
                                        <span className="text-success-ink">En appel</span>
                                    </>
                                ) : (
                                    kind
                                )}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1">
                                <span className="truncate text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{shown.text}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void navigator.clipboard?.writeText(phone ?? "");
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 1400);
                                    }}
                                    className="grid size-7 shrink-0 place-items-center rounded-md text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                    aria-label="Copier le numéro"
                                    title="Copier le numéro"
                                >
                                    {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="text-[13px] text-ink-3">Aucun numéro sur la fiche</p>
                    )}
                </div>
                {shown &&
                    (live ? (
                        <button
                            type="button"
                            onClick={onHangup}
                            className="cp-press inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-danger px-4 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                        >
                            <PhoneOff className="size-4" aria-hidden /> Raccrocher
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onCall}
                            className="cp-press inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-success px-4 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2"
                        >
                            <Phone className="size-4" aria-hidden /> Appeler
                        </button>
                    ))}
            </div>
            {(email || linkedin || website) && (
                <div className="flex min-w-0 items-center gap-0.5 border-t border-line-subtle px-2 py-1.5">
                    {linkedin && (
                        <a href={url(linkedin)} target="_blank" rel="noopener noreferrer" className={cn(link, "shrink-0")} title="Profil LinkedIn">
                            <Linkedin className="size-3.5 shrink-0" aria-hidden />
                            LinkedIn
                        </a>
                    )}
                    {email && (
                        <a href={`mailto:${email}`} className={cn(link, "flex-1 justify-start")} title={`Écrire à ${email}`}>
                            <Mail className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{email}</span>
                        </a>
                    )}
                    {website && (
                        <a href={url(website)} target="_blank" rel="noopener noreferrer" className={cn(link, !email && "flex-1", "min-w-0")} title={website}>
                            <Globe className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{host(website)}</span>
                        </a>
                    )}
                </div>
            )}
        </section>
    );
}
