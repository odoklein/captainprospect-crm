"use client";

// ============================================
// SMS INBOX — every SMS conversation on my Twilio number.
// List on the left (unread first in colour, last message, time), the
// conversation on the right with « Appeler ». ?n=+33… selects one (links from
// notifications). « Nouveau » starts a conversation with any number.
// ============================================

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MessageSquarePlus, MessageSquareText, Phone, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { SmsThread, type SmsMessageView } from "./SmsThread";

interface ThreadSummary {
    prospectNumber: string;
    name: string | null;
    company: string | null;
    contactId: string | null;
    companyId: string | null;
    last: SmsMessageView;
    unread: number;
}

interface InboxPayload {
    line: string | null;
    canText: boolean | null;
    configured: boolean;
    unread: number;
    threads: ThreadSummary[];
}

const POLL_MS = 15_000;

function when(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const days = Math.floor((today.getTime() - d.getTime()) / 864e5);
    if (days < 7) return d.toLocaleDateString("fr-FR", { weekday: "short" });
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function initials(t: ThreadSummary): string | null {
    const label = t.name ?? t.company;
    if (!label) return null;
    return label.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function SmsInbox() {
    return (
        <Suspense fallback={null}>
            <Inbox />
        </Suspense>
    );
}

function Inbox() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const selected = params.get("n");
    const { dial, enabled: canCall } = useSoftphone();

    const [data, setData] = useState<InboxPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState("");
    const [composing, setComposing] = useState(false);
    const [newNumber, setNewNumber] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/messaging/threads", { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (!json?.success) throw new Error(json?.error || "Chargement impossible");
            setData(json.data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Chargement impossible");
        }
    }, []);

    useEffect(() => {
        void load();
        const t = setInterval(() => {
            if (!document.hidden) void load();
        }, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    const select = (n: string | null) => {
        const next = new URLSearchParams(params.toString());
        if (n) next.set("n", n);
        else next.delete("n");
        router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
        // Opening a conversation reads it: refresh the badges right after.
        if (n) setTimeout(() => void load(), 800);
    };

    const threads = useMemo(() => {
        const list = data?.threads ?? [];
        const term = q.trim().toLowerCase();
        if (!term) return list;
        const digits = term.replace(/\D/g, "");
        return list.filter(
            (t) =>
                (t.name ?? "").toLowerCase().includes(term) ||
                (t.company ?? "").toLowerCase().includes(term) ||
                t.last.body.toLowerCase().includes(term) ||
                (digits.length >= 3 && t.prospectNumber.replace(/\D/g, "").includes(digits.replace(/^0/, ""))),
        );
    }, [data, q]);

    const current = data?.threads.find((t) => t.prospectNumber === selected) ?? null;
    const title = current ? current.name ?? current.company ?? formatPhone(current.prospectNumber) : selected ? formatPhone(selected) : null;

    return (
        <div className="flex h-full min-h-0 w-full bg-canvas">
            {/* ── Conversations ── */}
            <aside className={cn("flex min-h-0 w-full shrink-0 flex-col border-r border-line bg-surface md:w-[340px]", selected && "hidden md:flex")}>
                <header className="shrink-0 px-4 pb-3 pt-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-[18px] font-semibold tracking-[-0.015em] text-ink">Messages</h1>
                            <p className="text-[12px] text-ink-3">
                                {data?.line ? <>Depuis le {formatPhone(data.line)}</> : "SMS avec vos prospects"}
                                {data && data.unread > 0 && <span className="ml-1.5 font-semibold text-accent-soft-ink">· {data.unread} non lu{data.unread > 1 ? "s" : ""}</span>}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setComposing((v) => !v)}
                            aria-pressed={composing}
                            title="Nouveau SMS"
                            className="cp-press flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-fg hover:bg-primary-hover"
                        >
                            <MessageSquarePlus className="h-4 w-4" />
                        </button>
                    </div>
                    {composing && (
                        <form
                            className="cp-pop mt-3 flex gap-1.5"
                            onSubmit={(e) => {
                                e.preventDefault();
                                const digits = newNumber.replace(/[^\d+]/g, "");
                                if (digits.length < 9) return;
                                const e164 = digits.startsWith("+") ? digits : digits.startsWith("0") ? `+33${digits.slice(1)}` : `+${digits}`;
                                setComposing(false);
                                setNewNumber("");
                                select(e164);
                            }}
                        >
                            <input
                                autoFocus
                                value={newNumber}
                                onChange={(e) => setNewNumber(e.target.value)}
                                placeholder="06 12 34 56 78"
                                inputMode="tel"
                                aria-label="Numéro du destinataire"
                                className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface-2/50 px-3 text-[13px] text-ink outline-none focus:border-primary/50 focus:bg-surface"
                            />
                            <button type="submit" className="cp-press h-9 rounded-control bg-primary px-3 text-[12.5px] font-semibold text-primary-fg">
                                Écrire
                            </button>
                        </form>
                    )}
                    <label className="relative mt-3 flex items-center">
                        <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ink-3" />
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Nom, société, numéro, message…"
                            aria-label="Rechercher une conversation"
                            className="h-9 w-full rounded-full border border-line bg-surface-2/50 pl-8 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-4 focus:border-primary/50 focus:bg-surface"
                        />
                    </label>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto pb-16">
                    {error && <p className="px-4 py-3 text-[13px] text-danger-ink">{error}</p>}
                    {!data && !error && (
                        <div className="space-y-2 px-4" aria-busy="true">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="cp-shimmer h-14 rounded-xl" />
                            ))}
                        </div>
                    )}
                    {data && threads.length === 0 && (
                        <div className="px-6 py-14 text-center">
                            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-ink-3">
                                <MessageSquareText className="h-5 w-5" />
                            </span>
                            <p className="text-[13.5px] font-semibold text-ink">{q ? "Aucune conversation trouvée" : "Pas encore de SMS"}</p>
                            <p className="mx-auto mt-1 max-w-[240px] text-[12px] text-ink-3">
                                {q ? "Essayez un autre nom ou numéro." : "Écrivez depuis l'onglet SMS d'une fiche, ou avec le bouton +."}
                            </p>
                        </div>
                    )}
                    <ul className="px-2">
                        {threads.map((t, i) => {
                            const active = t.prospectNumber === selected;
                            const ini = initials(t);
                            return (
                                <li key={t.prospectNumber} className="cp-rise" style={{ ["--i" as string]: Math.min(i, 8) }}>
                                    <button
                                        type="button"
                                        onClick={() => select(t.prospectNumber)}
                                        aria-current={active ? "true" : undefined}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                                            active ? "bg-primary-soft" : "hover:bg-surface-2",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                                                t.unread ? "bg-primary text-primary-fg" : "bg-surface-3 text-ink-2",
                                            )}
                                        >
                                            {ini ?? <Phone className="h-4 w-4" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-2">
                                                <span className={cn("truncate text-[13.5px] text-ink", t.unread ? "font-semibold" : "font-medium")}>
                                                    {t.name ?? t.company ?? formatPhone(t.prospectNumber)}
                                                </span>
                                                <span className={cn("shrink-0 text-[11px] tabular-nums", t.unread ? "font-semibold text-accent-soft-ink" : "text-ink-3")}>{when(t.last.at)}</span>
                                            </span>
                                            <span className="flex items-center justify-between gap-2">
                                                <span className={cn("truncate text-[12.5px]", t.unread ? "text-ink" : "text-ink-3")}>
                                                    {t.last.direction === "OUTBOUND" && <span className="text-ink-4">Vous : </span>}
                                                    {t.last.body}
                                                </span>
                                                {t.unread > 0 && (
                                                    <span className="cp-pop flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-accent-fg">
                                                        {t.unread}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </aside>

            {/* ── Conversation ── */}
            <section className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")} aria-label="Conversation">
                {selected ? (
                    <>
                        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
                            <button type="button" onClick={() => select(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 md:hidden" aria-label="Retour">
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
                                <p className="truncate text-[12px] text-ink-3">
                                    {[current?.name ? current.company : null, formatPhone(selected)].filter(Boolean).join(" · ")}
                                </p>
                            </div>
                            {canCall && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        dial({
                                            phone: selected,
                                            contactId: current?.contactId ?? null,
                                            companyId: current?.companyId ?? null,
                                            label: current?.name ?? current?.company ?? null,
                                            sublabel: current?.name ? current.company : null,
                                        })
                                    }
                                    className="cp-press flex h-9 items-center gap-1.5 rounded-full bg-success px-3.5 text-[12.5px] font-semibold text-white shadow-[0_6px_16px_-8px_var(--ds-success)] hover:brightness-110"
                                >
                                    <Phone className="h-3.5 w-3.5" /> Appeler
                                </button>
                            )}
                        </header>
                        <SmsThread
                            key={selected}
                            number={selected}
                            contactId={current?.contactId ?? null}
                            companyId={current?.companyId ?? null}
                            firstName={current?.name?.split(/\s+/)[0] ?? null}
                            className="min-h-0 flex-1 bg-surface"
                        />
                    </>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-ink">
                            <MessageSquareText className="h-5 w-5" />
                        </span>
                        <p className="text-[14px] font-semibold text-ink">Choisissez une conversation</p>
                        <p className="mt-1 max-w-[280px] text-[12.5px] text-ink-3">Les réponses de vos prospects arrivent ici, et dans l&apos;onglet SMS de leur fiche.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
