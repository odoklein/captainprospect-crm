"use client";

// ============================================
// SMS THREAD — one conversation with a prospect, from the SDR's number.
//
// Bubbles (mine right in the brand colour, theirs left), delivery ticks,
// day separators; a composer that shows what the SMS will cost as you type
// (160 / 70 characters, why it switched), quick templates with the prospect's
// first name, ⌘/Ctrl + Entrée to send. New replies arrive by polling.
// Blocked states say why and what to do: no number, landline number, STOP.
// ============================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Ban, Check, CheckCheck, Clock3, Loader2, MessageSquareText, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { smsLength } from "@/lib/messaging/segments";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";

export interface SmsMessageView {
    id: string;
    direction: "OUTBOUND" | "INBOUND";
    body: string;
    status: string;
    errorCode: string | null;
    at: string;
    readAt: string | null;
    /** Client-only: not acknowledged by the server yet. */
    pending?: boolean;
}

interface ThreadPayload {
    messages: SmsMessageView[];
    optedOut: string[];
    numbers: string[];
    line: string | null;
    canText: boolean | null;
}

const POLL_MS = 10_000;

function dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 864e5);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (same(d, today)) return "Aujourd'hui";
    if (same(d, yesterday)) return "Hier";
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function StatusTick({ m }: { m: SmsMessageView }) {
    if (m.pending) return <Clock3 className="h-3 w-3" aria-label="Envoi…" />;
    switch (m.status) {
        case "delivered":
            return <CheckCheck className="h-3 w-3" aria-label="Délivré" />;
        case "sent":
            return <Check className="h-3 w-3" aria-label="Envoyé" />;
        case "failed":
        case "undelivered":
            return <AlertCircle className="h-3 w-3" aria-label="Non délivré" />;
        default:
            return <Clock3 className="h-3 w-3" aria-label="En file" />;
    }
}

export function SmsThread({
    number,
    contactId,
    companyId,
    campaignId,
    firstName,
    className,
}: {
    /** A conversation by number (inbox); otherwise the prospect's numbers on file. */
    number?: string | null;
    contactId?: string | null;
    companyId?: string | null;
    campaignId?: string | null;
    /** For the templates (« Bonjour Sophie »). */
    firstName?: string | null;
    className?: string;
}) {
    const [data, setData] = useState<ThreadPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [to, setTo] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const query = useMemo(() => {
        const q = new URLSearchParams();
        if (number) q.set("number", number);
        else {
            if (contactId) q.set("contactId", contactId);
            if (companyId) q.set("companyId", companyId);
        }
        return q.toString();
    }, [number, contactId, companyId]);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/messaging/sms?${query}`, { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (!json?.success) throw new Error(json?.error || "Chargement impossible");
            const next = json.data as ThreadPayload;
            setData((prev) => {
                // Keep optimistic messages the server has not returned yet.
                const pending = prev?.messages.filter((m) => m.pending) ?? [];
                return { ...next, messages: [...next.messages, ...pending] };
            });
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Chargement impossible");
        }
    }, [query]);

    useEffect(() => {
        void load();
        const t = setInterval(() => {
            if (!document.hidden) void load();
        }, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    // The number to text: the conversation's, else the one picked, else the first on file (mobile first).
    const defaultTo = number ?? data?.numbers.find((n) => /^\+33[67]/.test(n)) ?? data?.numbers[0] ?? null;
    const target = to ?? defaultTo;
    const optedOut = Boolean(target && data?.optedOut.includes(target));

    // Stay at the bottom as messages arrive.
    const count = data?.messages.length ?? 0;
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [count]);

    const len = smsLength(draft);
    const templates = useMemo(() => {
        const hi = firstName ? `Bonjour ${firstName},` : "Bonjour,";
        return [
            { label: "Suite à notre appel", text: `${hi} suite à notre échange, je vous envoie comme convenu les informations. Belle journée !` },
            { label: "Je vous rappelle", text: `${hi} j'ai essayé de vous joindre. Quel moment vous arrangerait pour un court échange ?` },
            { label: "Confirmation RDV", text: `${hi} je vous confirme notre rendez-vous. À très vite !` },
        ];
    }, [firstName]);

    const send = async () => {
        const body = draft.trim();
        if (!body || !target || sending) return;
        setSending(true);
        setSendError(null);
        const temp: SmsMessageView = { id: `tmp-${Date.now()}`, direction: "OUTBOUND", body, status: "queued", errorCode: null, at: new Date().toISOString(), readAt: null, pending: true };
        setData((d) => (d ? { ...d, messages: [...d.messages, temp] } : d));
        setDraft("");
        try {
            const res = await fetch("/api/messaging/sms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: target, body, contactId: contactId ?? null, companyId: companyId ?? null, campaignId: campaignId ?? null }),
            });
            const json = await res.json().catch(() => null);
            if (!json?.success) throw new Error(json?.error || "Envoi impossible");
            setData((d) => (d ? { ...d, messages: d.messages.map((m) => (m.id === temp.id ? (json.data as SmsMessageView) : m)) } : d));
        } catch (e) {
            setData((d) => (d ? { ...d, messages: d.messages.filter((m) => m.id !== temp.id) } : d));
            setDraft(body); // nothing lost
            setSendError(e instanceof Error ? e.message : "Envoi impossible");
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    };

    if (error && !data) return <p className={cn("p-4 text-[13px] text-danger-ink", className)}>{error}</p>;
    if (!data) {
        return (
            <div className={cn("space-y-3 p-4", className)} aria-busy="true">
                {[60, 40, 70].map((w, i) => (
                    <div key={i} className={cn("cp-shimmer h-9 rounded-2xl", i % 2 ? "ml-auto" : "")} style={{ width: `${w}%` }} />
                ))}
            </div>
        );
    }

    const blocked = !data.line
        ? { icon: PhoneOff, text: "Pas de numéro Twilio : demandez-en un à votre manager pour envoyer des SMS." }
        : data.canText === false
          ? { icon: PhoneOff, text: `Votre numéro ${formatPhone(data.line)} est un fixe : il ne peut pas envoyer de SMS. Demandez un numéro mobile à votre manager.` }
          : !target
            ? { icon: PhoneOff, text: "Aucun numéro de téléphone sur cette fiche." }
            : optedOut
              ? { icon: Ban, text: "Ce numéro a répondu STOP : il ne recevra plus de SMS." }
              : null;

    // Group by day for separators.
    const groups: { day: string; items: SmsMessageView[] }[] = [];
    for (const m of data.messages) {
        const day = dayLabel(m.at);
        const last = groups.at(-1);
        if (last && last.day === day) last.items.push(m);
        else groups.push({ day, items: [m] });
    }

    return (
        <div className={cn("flex min-h-0 flex-col", className)}>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
                {data.messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary-soft-ink">
                            <MessageSquareText className="h-5 w-5" />
                        </span>
                        <p className="text-[13.5px] font-semibold text-ink">Aucun SMS avec ce prospect</p>
                        <p className="mt-1 max-w-[260px] text-[12px] text-ink-3">Un SMS court après un appel manqué double souvent le taux de rappel.</p>
                    </div>
                ) : (
                    groups.map((g) => (
                        <section key={g.day} className="mb-3">
                            <p className="sticky top-0 z-[1] mx-auto mb-2 w-fit rounded-full bg-surface-2/90 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3 backdrop-blur">
                                {g.day}
                            </p>
                            <ol className="space-y-1.5">
                                {g.items.map((m) => {
                                    const mine = m.direction === "OUTBOUND";
                                    const failed = m.status === "failed" || m.status === "undelivered";
                                    return (
                                        <li key={m.id} className={cn("cp-pop flex", mine ? "justify-end" : "justify-start")}>
                                            <div
                                                className={cn(
                                                    "max-w-[82%] rounded-[18px] px-3.5 py-2 text-[13px] leading-relaxed shadow-[0_1px_1px_rgb(0_0_0/0.04)]",
                                                    mine ? "rounded-br-md bg-primary text-primary-fg" : "rounded-bl-md bg-surface-2 text-ink",
                                                    failed && "bg-danger-soft text-danger-ink",
                                                    m.pending && "opacity-70",
                                                )}
                                            >
                                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                                <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10.5px]", mine && !failed ? "text-primary-fg/70" : "text-ink-3")}>
                                                    {failed && <span>Non délivré{m.errorCode ? ` (${m.errorCode})` : ""} ·</span>}
                                                    {time(m.at)}
                                                    {mine && <StatusTick m={m} />}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </section>
                    ))
                )}
            </div>

            <div className="shrink-0 border-t border-line-subtle bg-surface px-3 pb-3 pt-2.5">
                {blocked ? (
                    <p className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
                        <blocked.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                        {blocked.text}
                    </p>
                ) : (
                    <>
                        {!draft && data.messages.length === 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {templates.map((t) => (
                                    <button
                                        key={t.label}
                                        type="button"
                                        onClick={() => {
                                            setDraft(t.text);
                                            requestAnimationFrame(() => inputRef.current?.focus());
                                        }}
                                        className="cp-press rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2 hover:border-primary/40 hover:text-ink"
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex items-end gap-2 rounded-[20px] border border-line bg-surface-2/50 py-1.5 pl-3.5 pr-1.5 transition-colors focus-within:border-primary/50 focus-within:bg-surface">
                            <textarea
                                ref={inputRef}
                                value={draft}
                                onChange={(e) => {
                                    setDraft(e.target.value);
                                    setSendError(null);
                                    const el = e.target;
                                    el.style.height = "auto";
                                    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        void send();
                                    }
                                }}
                                rows={1}
                                maxLength={900}
                                placeholder="Écrire un SMS…"
                                aria-label="Message"
                                className="max-h-[140px] min-h-[34px] flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-4"
                            />
                            <button
                                type="button"
                                onClick={() => void send()}
                                disabled={!draft.trim() || sending}
                                aria-label="Envoyer (Ctrl + Entrée)"
                                title="Envoyer (Ctrl + Entrée)"
                                className="cp-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition-opacity hover:bg-primary-hover disabled:opacity-30"
                            >
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                            </button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px] text-ink-3">
                            <span className="truncate">
                                {data.numbers.length > 1 && !number ? (
                                    <label className="inline-flex items-center gap-1">
                                        À
                                        <select
                                            value={target ?? ""}
                                            onChange={(e) => setTo(e.target.value)}
                                            className="rounded bg-transparent font-medium text-ink-2 outline-none hover:text-ink"
                                            aria-label="Numéro du destinataire"
                                        >
                                            {data.numbers.map((n) => (
                                                <option key={n} value={n}>
                                                    {formatPhone(n)}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    target && <>À {formatPhone(target)}</>
                                )}
                            </span>
                            {draft && (
                                <span
                                    className={cn("shrink-0 tabular-nums", len.segments > 1 && "font-medium text-warning-ink")}
                                    title={len.encoding === "UCS-2" ? `« ${len.unicodeChars.join(" ")} » passe le SMS en mode Unicode : 70 caractères par SMS` : undefined}
                                >
                                    {len.remaining} · {len.segments} SMS{len.encoding === "UCS-2" ? " · Unicode" : ""}
                                </span>
                            )}
                        </div>
                        {sendError && <p className="mt-1.5 px-1 text-[12px] text-danger-ink">{sendError}</p>}
                    </>
                )}
            </div>
        </div>
    );
}
