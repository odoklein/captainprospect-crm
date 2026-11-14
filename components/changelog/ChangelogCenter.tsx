"use client";

// « Nouveautés » in the top bar: a gift button with the unseen count, the « Quoi de neuf »
// dialog (opens by itself once when a new release arrives), maintenance / warning banners,
// and — for managers — the update offer pushed by the Console with its three answers.
// Data: GET /api/changelog (lib/changelog/server.feedFor), refreshed every 10 minutes.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Clock, Gift, Rocket, ShieldAlert, Sparkles, Wrench, X, Zap, ArrowRight, Database } from "lucide-react";
import { Modal, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Note = { type: "new" | "improved" | "fixed"; title: string; body?: string; module?: string };

type Entry = {
    id: string;
    kind: "RELEASE" | "ANNOUNCEMENT";
    category: string | null;
    severity: string;
    title: string;
    body: string;
    notes: Note[];
    version: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    publishedAt: string;
    endsAt: string | null;
    seen: boolean;
    banner: boolean;
};

type Offer = {
    id: string;
    tag: string;
    title: string;
    state: "pending" | "scheduled" | "postponed";
    migration: boolean;
    security: boolean;
    deadline: string | null;
    window: string | null;
    decision: string | null;
    postponedUntil: string | null;
    decidedBy: string | null;
    canDecide: boolean;
};

type Feed = { entries: Entry[]; unseen: number; offer: Offer | null; version: string | null };

const REFRESH_MS = 10 * 60_000;
const AUTO_OPEN_KEY = "cp-changelog-autoopened";
const BANNER_KEY = "cp-changelog-banners-dismissed";

const NOTE_META: Record<Note["type"], { label: string; icon: typeof Sparkles; className: string }> = {
    new: { label: "Nouveau", icon: Sparkles, className: "bg-violet-50 text-violet-700 border-violet-200" },
    improved: { label: "Amélioré", icon: Zap, className: "bg-sky-50 text-sky-700 border-sky-200" },
    fixed: { label: "Corrigé", icon: Wrench, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function readSet(storage: "local" | "session", key: string): Set<string> {
    try {
        const s = storage === "local" ? window.localStorage : window.sessionStorage;
        return new Set(JSON.parse(s.getItem(key) ?? "[]") as string[]);
    } catch {
        return new Set();
    }
}

function writeSet(storage: "local" | "session", key: string, value: Set<string>) {
    try {
        const s = storage === "local" ? window.localStorage : window.sessionStorage;
        s.setItem(key, JSON.stringify([...value].slice(-50)));
    } catch {
        /* private mode: the dialog simply opens again next session */
    }
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function fmtDate(iso: string | null, withTime = false): string {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : (withTime ? dateTimeFmt : dateFmt).format(d);
}

export function ChangelogCenter() {
    const [feed, setFeed] = useState<Feed | null>(null);
    const [open, setOpen] = useState(false);
    const [deciding, setDeciding] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [mounted, setMounted] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/changelog", { cache: "no-store" });
            if (!res.ok) return;
            const json = await res.json();
            setFeed((json?.data ?? json) as Feed);
        } catch {
            /* offline: keep what we have */
        }
    }, []);

    useEffect(() => {
        setMounted(true);
        setDismissed(readSet("local", BANNER_KEY));
        void load();
        const t = window.setInterval(load, REFRESH_MS);
        return () => window.clearInterval(t);
    }, [load]);

    // Open by itself once per new release (or new pending offer), never twice for the same thing.
    useEffect(() => {
        if (!feed || open) return;
        const opened = readSet("session", AUTO_OPEN_KEY);
        const triggers = [
            ...feed.entries.filter((e) => !e.seen && e.kind === "RELEASE").map((e) => e.id),
            ...(feed.offer?.state === "pending" ? [`offer:${feed.offer.id}:${feed.offer.tag}`] : []),
        ].filter((id) => !opened.has(id));
        if (!triggers.length) return;
        triggers.forEach((id) => opened.add(id));
        writeSet("session", AUTO_OPEN_KEY, opened);
        setOpen(true);
    }, [feed, open]);

    const markAllSeen = useCallback(async () => {
        const ids = feed?.entries.filter((e) => !e.seen).map((e) => e.id) ?? [];
        if (!ids.length) return;
        setFeed((f) => (f ? { ...f, unseen: 0, entries: f.entries.map((e) => ({ ...e, seen: true })) } : f));
        try {
            await fetch("/api/changelog/seen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });
        } catch {
            /* retried next time the dialog closes */
        }
    }, [feed]);

    const close = useCallback(() => {
        setOpen(false);
        setError(null);
        void markAllSeen();
    }, [markAllSeen]);

    const decide = useCallback(
        async (decision: "NOW" | "WINDOW" | "POSTPONE") => {
            if (!feed?.offer) return;
            setDeciding(decision);
            setError(null);
            try {
                const res = await fetch("/api/changelog/decision", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: feed.offer.id, decision }),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) {
                    setError(json?.error ?? "La réponse n'a pas pu être enregistrée.");
                    return;
                }
                const offer = (json?.data?.offer ?? null) as Offer | null;
                setFeed((f) => (f ? { ...f, offer } : f));
            } catch {
                setError("Connexion perdue : réessayez.");
            } finally {
                setDeciding(null);
            }
        },
        [feed],
    );

    const banners = useMemo(() => (feed?.entries ?? []).filter((e) => e.banner && !dismissed.has(e.id)), [feed, dismissed]);
    const dismissBanner = (id: string) => {
        const next = new Set(dismissed);
        next.add(id);
        setDismissed(next);
        writeSet("local", BANNER_KEY, next);
    };

    const pendingOffer = feed?.offer?.state === "pending";
    const unseen = feed?.unseen ?? 0;
    const releases = feed?.entries.filter((e) => e.kind === "RELEASE") ?? [];
    const announcements = feed?.entries.filter((e) => e.kind === "ANNOUNCEMENT") ?? [];

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    "relative w-7.5 h-7.5 rounded-lg border flex items-center justify-center transition-colors duration-150 shadow-2xs",
                    pendingOffer
                        ? "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                        : "border-line bg-white text-ink-3 hover:text-ink hover:border-line-strong hover:bg-surface-2",
                )}
                title={pendingOffer ? "Nouvelle version disponible" : "Nouveautés"}
                aria-label={unseen ? `Nouveautés (${unseen} non lues)` : "Nouveautés"}
            >
                <Gift className="w-3.5 h-3.5" />
                {(unseen > 0 || pendingOffer) && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-violet-600 text-[10px] font-bold leading-4 text-white text-center">
                        {pendingOffer && !unseen ? "1" : unseen > 9 ? "9+" : unseen}
                    </span>
                )}
            </button>

            {mounted &&
                banners.length > 0 &&
                createPortal(
                    <div className="fixed left-1/2 top-[56px] z-[60] flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2">
                        {banners.map((b) => (
                            <div
                                key={b.id}
                                role="status"
                                className={cn(
                                    "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-md",
                                    b.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950",
                                )}
                            >
                                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">{b.title}</p>
                                    {b.body && <p className="mt-0.5 line-clamp-2 opacity-90">{b.body}</p>}
                                    {b.ctaUrl && b.ctaLabel && (
                                        <a href={b.ctaUrl} className="mt-1 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                                            {b.ctaLabel} <ArrowRight className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                                <button type="button" onClick={() => dismissBanner(b.id)} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Masquer">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>,
                    document.body,
                )}

            <Modal isOpen={open} onClose={close} title="Quoi de neuf ?" description="Les dernières évolutions de votre CRM." size="lg">
                <div className="space-y-5">
                    {feed?.offer && <OfferCard offer={feed.offer} deciding={deciding} error={error} onDecide={decide} />}

                    {releases.length === 0 && announcements.length === 0 && !feed?.offer && (
                        <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-ink-3">
                            <Gift className="mx-auto mb-2 h-6 w-6 opacity-50" />
                            Rien de nouveau pour l&apos;instant. Les prochaines évolutions apparaîtront ici.
                        </div>
                    )}

                    {announcements.map((a) => (
                        <article key={a.id} className={cn("rounded-xl border p-4", a.seen ? "border-line" : "border-violet-200 bg-violet-50/40")}>
                            <header className="flex items-center gap-2">
                                {!a.seen && <span className="h-2 w-2 rounded-full bg-violet-600" aria-label="Non lu" />}
                                <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
                                <span className="ml-auto text-[11px] text-ink-3">{fmtDate(a.publishedAt)}</span>
                            </header>
                            {a.body && <p className="mt-1.5 whitespace-pre-line text-[13px] text-ink-2">{a.body}</p>}
                            {a.ctaUrl && a.ctaLabel && (
                                <a href={a.ctaUrl} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-violet-700 hover:underline">
                                    {a.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                            )}
                        </article>
                    ))}

                    {releases.map((r) => (
                        <article key={r.id} className={cn("rounded-xl border p-4", r.seen ? "border-line" : "border-violet-200 bg-violet-50/40")}>
                            <header className="flex flex-wrap items-center gap-2">
                                {!r.seen && <span className="h-2 w-2 rounded-full bg-violet-600" aria-label="Non lu" />}
                                <Rocket className="h-4 w-4 text-violet-600" aria-hidden />
                                <h3 className="text-sm font-semibold text-ink">{r.title}</h3>
                                {r.version && (
                                    <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">{r.version.slice(0, 7)}</span>
                                )}
                                <span className="ml-auto text-[11px] text-ink-3">{fmtDate(r.publishedAt)}</span>
                            </header>
                            {r.body && <p className="mt-1.5 whitespace-pre-line text-[13px] text-ink-2">{r.body}</p>}
                            {r.notes.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                    {r.notes.map((n, i) => {
                                        const meta = NOTE_META[n.type] ?? NOTE_META.improved;
                                        const Icon = meta.icon;
                                        return (
                                            <li key={i} className="flex items-start gap-2.5">
                                                <span className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold", meta.className)}>
                                                    <Icon className="h-3 w-3" aria-hidden />
                                                    {meta.label}
                                                </span>
                                                <div className="min-w-0 text-[13px]">
                                                    <p className="font-medium text-ink">
                                                        {n.title}
                                                        {n.module && <span className="ml-1.5 text-[11px] font-normal text-ink-3">· {n.module}</span>}
                                                    </p>
                                                    {n.body && <p className="mt-0.5 text-ink-2">{n.body}</p>}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {r.ctaUrl && r.ctaLabel && (
                                <a href={r.ctaUrl} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-violet-700 hover:underline">
                                    {r.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                            )}
                        </article>
                    ))}
                </div>
            </Modal>
        </>
    );
}

function OfferCard({
    offer,
    deciding,
    error,
    onDecide,
}: {
    offer: Offer;
    deciding: string | null;
    error: string | null;
    onDecide: (d: "NOW" | "WINDOW" | "POSTPONE") => void;
}) {
    const busy = deciding !== null;
    return (
        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50">
            <div className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                    {offer.security ? <ShieldAlert className="h-4.5 w-4.5" /> : <Rocket className="h-4.5 w-4.5" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                        {offer.security ? "Mise à jour de sécurité" : "Nouvelle version disponible"}
                    </p>
                    <h3 className="mt-0.5 text-[15px] font-semibold text-ink">{offer.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-2">
                        <span className="rounded-md border border-line bg-white px-1.5 py-0.5 font-mono">{offer.tag.slice(0, 7)}</span>
                        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-1.5 py-0.5">
                            <Clock className="h-3 w-3" /> ~5 min d&apos;interruption
                        </span>
                        {offer.migration && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-800">
                                <Database className="h-3 w-3" /> sauvegarde automatique avant mise à jour
                            </span>
                        )}
                        {offer.deadline && (
                            <span className="rounded-md border border-line bg-white px-1.5 py-0.5">Appliquée d&apos;office le {fmtDate(offer.deadline)}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="border-t border-violet-100 bg-white/70 px-4 py-3">
                {offer.state === "pending" ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="primary" size="sm" disabled={busy} onClick={() => onDecide("WINDOW")}>
                            {deciding === "WINDOW" ? "…" : offer.window ? `Installer ce soir (${offer.window})` : "Installer cette nuit"}
                        </Button>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => onDecide("NOW")}>
                            {deciding === "NOW" ? "…" : "Installer maintenant"}
                        </Button>
                        {!offer.security && (
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDecide("POSTPONE")}>
                                {deciding === "POSTPONE" ? "…" : "Reporter de 7 jours"}
                            </Button>
                        )}
                    </div>
                ) : offer.state === "scheduled" ? (
                    <p className="text-[13px] text-ink-2">
                        ✅ {offer.decision === "NOW" ? "Installation demandée : elle démarre dans quelques minutes." : `Installation prévue ${offer.window ? `ce soir (${offer.window})` : "cette nuit"}.`}
                        {offer.decidedBy && <span className="text-ink-3"> · par {offer.decidedBy}</span>}
                    </p>
                ) : (
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                        <span>⏸ Reportée jusqu&apos;au {fmtDate(offer.postponedUntil, true)}.</span>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => onDecide("WINDOW")}>
                            Finalement, installer ce soir
                        </Button>
                    </div>
                )}
                {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
            </div>
        </section>
    );
}
