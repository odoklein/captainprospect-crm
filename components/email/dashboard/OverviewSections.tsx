"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Circle,
    Clock,
    FileText,
    Inbox,
    MailCheck,
    MailWarning,
    MailX,
    Megaphone,
    MousePointerClick,
    Plus,
    Reply,
    Send,
    Server,
    Workflow,
    XCircle,
    Eye,
    RotateCw,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Button, Callout, EmptyState, KpiCard, Section, SegmentedControl, Skeleton, StatusDot, Tooltip } from "@/components/ui";
import { FOCUS_RING, TONE_SOFT, TONE_TEXT, type Tone } from "@/components/ui/recipes";
import type { BlockState } from "./useOverview";
import type { ActivityEvent, KpisData, MailboxHealthRow, SequencesData, SetupData, TemplatesData, TriageData } from "./types";
import {
    PROVIDER_LABEL,
    contactHref,
    formatAgo,
    formatDuration,
    formatInt,
    formatPercent,
    formatWhen,
    inboxThreadHref,
} from "./format";

// ── Block frame: loading / error + retry / data ──────────────────────

function BlockBody<T>({
    state,
    onRetry,
    skeleton,
    children,
}: {
    state: BlockState<T>;
    onRetry: () => void;
    skeleton: ReactNode;
    children: (data: T) => ReactNode;
}) {
    if (state.data === undefined) {
        if (state.status === "error") {
            return (
                <Callout
                    tone="danger"
                    title="Ce bloc n'a pas pu être chargé"
                    action={
                        <Button size="xs" variant="secondary" leftIcon={<RotateCw className="size-3.5" />} onClick={onRetry}>
                            Réessayer
                        </Button>
                    }
                >
                    {state.error}
                </Callout>
            );
        }
        return <div aria-busy>{skeleton}</div>;
    }
    return (
        <div className={cn(state.status === "loading" && "opacity-60 transition-opacity")} aria-busy={state.status === "loading" || undefined}>
            {state.status === "error" && (
                <Callout
                    tone="warning"
                    className="mb-3"
                    title="Données peut-être obsolètes"
                    action={
                        <Button size="xs" variant="secondary" leftIcon={<RotateCw className="size-3.5" />} onClick={onRetry}>
                            Réessayer
                        </Button>
                    }
                >
                    {state.error}
                </Callout>
            )}
            {children(state.data)}
        </div>
    );
}

const RowsSkeleton = ({ rows = 4 }: { rows?: number }) => (
    <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            </div>
        ))}
    </div>
);

const IconTile = ({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) => (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg border", TONE_SOFT[tone])}>
        <Icon className={cn("size-4", TONE_TEXT[tone])} aria-hidden />
    </span>
);

const InlineLink = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <Link href={href} className={cn("inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline underline-offset-4", FOCUS_RING, "rounded", className)}>
        {children}
    </Link>
);

// ── Setup checklist (no mailbox yet) ─────────────────────────────────

export function SetupChecklist({ setup }: { setup: SetupData }) {
    const steps = [
        { done: setup.mailboxes > 0, label: "Connecter une boîte mail", hint: "Gmail, Outlook ou IMAP : pour envoyer et recevoir les réponses dans le CRM.", href: "/manager/emails/mailboxes", cta: "Connecter" },
        { done: setup.templates > 0, label: "Créer un template", hint: "Un modèle d'email réutilisable, rattaché aux missions.", href: "/manager/emails/templates?new=1", cta: "Créer" },
        { done: setup.reachInbox, label: "Connecter ReachInbox", hint: "Pour suivre ici les campagnes d'envoi en masse.", href: "/manager/emails/campaigns", cta: "Connecter" },
        { done: setup.sequences > 0, label: "Créer une séquence", hint: "Des relances automatiques en plusieurs étapes.", href: "/manager/emails/sequences/new", cta: "Créer" },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    return (
        <Section title="Mettre en place l'email" icon={MailCheck} count={`${doneCount}/${steps.length}`} subtitle="Aucune boîte mail n'est connectée : rien ne peut encore être envoyé ni reçu ici.">
            <ol className="grid gap-3 md:grid-cols-2">
                {steps.map((s, i) => (
                    <li key={s.label} className={cn("flex items-start gap-3 rounded-panel border p-4", s.done ? "border-success-line bg-success-soft" : "border-line bg-surface-2")}>
                        {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-ink-4" aria-hidden />}
                        <div className="min-w-0 flex-1">
                            <p className={cn("text-sm font-semibold", s.done ? "text-success-ink" : "text-ink")}>
                                <span className="sr-only">Étape {i + 1} : </span>
                                {s.label}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-3">{s.hint}</p>
                        </div>
                        {!s.done && (
                            <Link href={s.href} className={cn("shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover", FOCUS_RING)}>
                                {s.cta}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </Section>
    );
}

// ── À traiter ────────────────────────────────────────────────────────

export function TriageSection({ state, onRetry }: { state: BlockState<TriageData>; onRetry: () => void }) {
    const d = state.data;
    const count = d ? d.unread.total + d.problems.bounced + d.problems.failed + d.mailboxErrors.length + d.sequenceIssues.length : undefined;
    return (
        <Section
            title="À traiter"
            icon={Inbox}
            count={count !== undefined ? formatInt(count) : undefined}
            subtitle="Réponses non lues, rebonds, boîtes en erreur et séquences bloquées"
            actions={<InlineLink href="/manager/emails/inbox">Ouvrir la réception <ArrowRight className="size-3.5" aria-hidden /></InlineLink>}
        >
            <BlockBody state={state} onRetry={onRetry} skeleton={<RowsSkeleton rows={5} />}>
                {(t) => {
                    const nothing = t.unread.total === 0 && t.problems.items.length === 0 && t.mailboxErrors.length === 0 && t.sequenceIssues.length === 0;
                    if (nothing) {
                        return (
                            <Callout tone="success" title="Rien à traiter">
                                Les nouvelles réponses de prospects, les rebonds et les erreurs de boîtes mail apparaîtront ici.
                            </Callout>
                        );
                    }
                    return (
                        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                            <UnreadReplies unread={t.unread} />
                            <Problems t={t} />
                        </div>
                    );
                }}
            </BlockBody>
        </Section>
    );
}

function UnreadReplies({ unread }: { unread: TriageData["unread"] }) {
    return (
        <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Réponses non lues</h3>
                <Badge size="sm" variant={unread.total ? "primary" : "default"}>{formatInt(unread.total)}</Badge>
            </div>
            {unread.items.length === 0 ? (
                <p className="rounded-panel border border-dashed border-line px-4 py-6 text-center text-xs text-ink-3">Toutes les réponses ont été lues.</p>
            ) : (
                <ul className="divide-y divide-line-subtle rounded-panel border border-line">
                    {unread.items.map((r) => {
                        const sender = r.contact?.name || r.fromName || r.fromAddress || "Expéditeur inconnu";
                        const cHref = contactHref(r.contact);
                        return (
                            <li key={r.id} className="group relative flex gap-3 px-3.5 py-3 hover:bg-surface-2">
                                <StatusDot tone="primary" className="mt-1.5" label="Non lu" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <Link href={inboxThreadHref(r.id)} className={cn("min-w-0 truncate text-sm font-semibold text-ink after:absolute after:inset-0", FOCUS_RING, "rounded")}>
                                            {sender}
                                        </Link>
                                        <time className="shrink-0 text-xs tabular-nums text-ink-3" dateTime={r.receivedAt}>{formatWhen(r.receivedAt)}</time>
                                    </div>
                                    <p className="truncate text-[13px] text-ink-2">{r.subject || "(sans objet)"}</p>
                                    {r.snippet && <p className="truncate text-xs text-ink-3">{r.snippet}</p>}
                                    <div className="relative z-10 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                                        {r.contact?.companyName &&
                                            (cHref ? (
                                                <Link href={cHref} className="font-medium text-ink-2 hover:text-link hover:underline">{r.contact.companyName}</Link>
                                            ) : (
                                                <span className="font-medium text-ink-2">{r.contact.companyName}</span>
                                            ))}
                                        {r.mission && <span>Mission {r.mission.name}</span>}
                                        {!r.contact && r.fromAddress && r.fromName && <span>{r.fromAddress}</span>}
                                        <span className="truncate">via {r.mailbox.email}</span>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {unread.total > unread.items.length && (
                <InlineLink href="/manager/emails/inbox" className="mt-2">
                    Voir les {formatInt(unread.total)} conversations non lues <ArrowRight className="size-3.5" aria-hidden />
                </InlineLink>
            )}
        </div>
    );
}

function Problems({ t }: { t: TriageData }) {
    const items: { key: string; icon: LucideIcon; tone: Tone; title: string; detail?: string | null; href: string; cta: string }[] = [
        ...t.mailboxErrors.map((m) => ({
            key: `mb-${m.id}`,
            icon: Server,
            tone: "danger" as Tone,
            title: `${m.email} ${m.disabled ? "désactivée" : "en erreur de synchronisation"}`,
            detail: [PROVIDER_LABEL[m.provider] ?? m.provider, m.error, m.lastSyncAt ? `dernière synchro ${formatAgo(m.lastSyncAt)}` : "jamais synchronisée"].filter(Boolean).join(" · "),
            href: `/manager/emails/mailboxes?mailbox=${m.id}`,
            cta: "Réglages",
        })),
        ...t.sequenceIssues.map((s) => ({
            key: `seq-${s.id}`,
            icon: Workflow,
            tone: (s.reason === "mailbox" ? "danger" : "warning") as Tone,
            title: s.name,
            detail: s.detail,
            href: `/manager/emails/sequences/${s.id}`,
            cta: "Ouvrir",
        })),
        ...t.problems.items.map((e) => ({
            key: `em-${e.id}`,
            icon: e.status === "BOUNCED" ? MailX : XCircle,
            tone: (e.status === "BOUNCED" ? "warning" : "danger") as Tone,
            title: `${e.status === "BOUNCED" ? "Rebond" : "Échec d'envoi"} : ${e.contact?.name || e.to || "destinataire inconnu"}`,
            detail: [e.subject, e.error || (e.bounceType ? `rebond ${e.bounceType === "hard" ? "définitif" : "temporaire"}` : null), formatWhen(e.at)].filter(Boolean).join(" · "),
            href: inboxThreadHref(e.threadId),
            cta: "Voir",
        })),
    ];
    const sentProblems = t.problems.bounced + t.problems.failed;
    return (
        <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Problèmes</h3>
                {sentProblems > 0 && (
                    <InlineLink href="/manager/emails/sent?status=BOUNCED">
                        {formatInt(t.problems.bounced)} rebond{t.problems.bounced > 1 ? "s" : ""} · {formatInt(t.problems.failed)} échec{t.problems.failed > 1 ? "s" : ""} sur 7 j
                    </InlineLink>
                )}
            </div>
            {items.length === 0 ? (
                <p className="flex items-center gap-2 rounded-panel border border-dashed border-line px-4 py-6 text-xs text-ink-3">
                    <CheckCircle2 className="size-4 text-success" aria-hidden /> Aucune boîte en erreur, aucun rebond sur 7 jours.
                </p>
            ) : (
                <ul className="space-y-2">
                    {items.map((it) => (
                        <li key={it.key} className="flex items-start gap-3 rounded-panel border border-line bg-surface px-3 py-2.5">
                            <IconTile icon={it.icon} tone={it.tone} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-semibold text-ink">{it.title}</p>
                                {it.detail && <p className="line-clamp-2 text-xs text-ink-3">{it.detail}</p>}
                            </div>
                            <InlineLink href={it.href} className="mt-1 shrink-0">{it.cta}</InlineLink>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── KPIs (Email table, selectable period) ─────────────────────────────

const parisDate = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

export function KpiStrip({
    state,
    period,
    onPeriod,
    onRetry,
}: {
    state: BlockState<KpisData>;
    period: "7" | "30" | "90";
    onPeriod: (p: "7" | "30" | "90") => void;
    onRetry: () => void;
}) {
    return (
        <section aria-labelledby="email-kpis-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 id="email-kpis-title" className="text-[15px] font-semibold tracking-tight text-ink">Performance des envois</h2>
                    <p className="text-xs text-ink-3">Calculée sur les emails du CRM (hors campagnes ReachInbox)</p>
                </div>
                <SegmentedControl
                    ariaLabel="Période des indicateurs"
                    size="sm"
                    value={period}
                    onChange={onPeriod}
                    options={[
                        { value: "7", label: "7 jours" },
                        { value: "30", label: "30 jours" },
                        { value: "90", label: "90 jours" },
                    ]}
                />
            </div>
            <BlockBody
                state={state}
                onRetry={onRetry}
                skeleton={
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-card" />)}
                    </div>
                }
            >
                {(k) => {
                    const range = `from=${parisDate(k.period.from)}&to=${parisDate(k.period.to)}`;
                    const noTracking = k.totals.tracked === 0;
                    return (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                            <KpiCard
                                label="Envoyés"
                                icon={Send}
                                value={formatInt(k.totals.sent)}
                                hint={k.totals.failed ? `${formatInt(k.totals.failed)} échec${k.totals.failed > 1 ? "s" : ""}` : `${formatInt(k.totals.delivered)} délivrés`}
                                href={`/manager/emails/sent?${range}`}
                            />
                            <KpiCard
                                label="Réponses"
                                icon={Reply}
                                tone="success"
                                value={formatInt(k.totals.replied)}
                                hint={`${formatPercent(k.rates.replyRate)} des envois${k.responseTime.medianMinutes !== null ? ` · ${formatDuration(k.responseTime.medianMinutes)} en médiane` : ""}`}
                                href={`/manager/emails/sent?status=REPLIED&${range}`}
                            />
                            <KpiCard
                                label="Ouvertures"
                                icon={Eye}
                                tone="info"
                                value={
                                    noTracking ? (
                                        <Tooltip content="Aucun email de la période n'avait de pixel de suivi : le taux d'ouverture n'est pas mesurable.">
                                            <span className="cursor-help">—</span>
                                        </Tooltip>
                                    ) : (
                                        formatPercent(k.rates.openRate)
                                    )
                                }
                                hint={noTracking ? "Suivi des ouvertures inactif" : `${formatInt(k.totals.opened)} sur ${formatInt(k.totals.tracked)} suivis`}
                                href={noTracking ? undefined : `/manager/emails/sent?status=OPENED&${range}`}
                            />
                            <KpiCard
                                label="Rebonds"
                                icon={MailWarning}
                                tone="warning"
                                value={formatInt(k.totals.bounced)}
                                hint={k.totals.sent ? `${formatPercent(k.rates.bounceRate)} des envois` : "Aucun envoi"}
                                href={`/manager/emails/sent?status=BOUNCED&${range}`}
                            />
                            <KpiCard
                                label="Emails reçus"
                                icon={Inbox}
                                tone="neutral"
                                value={formatInt(k.totals.inbound)}
                                hint="Réponses et messages entrants"
                                href="/manager/emails/inbox"
                            />
                        </div>
                    );
                }}
            </BlockBody>
        </section>
    );
}

// ── Santé des boîtes ─────────────────────────────────────────────────

const SYNC: Record<string, { tone: Tone; label: string }> = {
    SYNCED: { tone: "success", label: "Synchronisée" },
    SYNCING: { tone: "info", label: "Synchronisation…" },
    PENDING: { tone: "neutral", label: "En attente" },
    ERROR: { tone: "danger", label: "En erreur" },
};

export function MailboxHealthSection({ state, onRetry }: { state: BlockState<MailboxHealthRow[]>; onRetry: () => void }) {
    const rows = state.data;
    const errors = rows?.filter((m) => m.syncStatus === "ERROR" || !m.isActive).length ?? 0;
    return (
        <Section
            title="Santé des boîtes"
            icon={Server}
            tone={errors ? "danger" : "primary"}
            count={rows ? formatInt(rows.length) : undefined}
            subtitle={rows ? (errors ? `${errors} boîte${errors > 1 ? "s" : ""} à vérifier` : "Toutes les boîtes fonctionnent") : "Synchronisation et envois du jour"}
            actions={<InlineLink href="/manager/emails/mailboxes">Gérer <ArrowRight className="size-3.5" aria-hidden /></InlineLink>}
            flush
        >
            <BlockBody state={state} onRetry={onRetry} skeleton={<div className="p-5"><RowsSkeleton rows={3} /></div>}>
                {(list) =>
                    list.length === 0 ? (
                        <EmptyState
                            variant="inline"
                            icon={Server}
                            title="Aucune boîte connectée"
                            description="Connectez une boîte pour envoyer depuis le CRM et y recevoir les réponses."
                            action={
                                <Link href="/manager/emails/mailboxes" className={cn("rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover", FOCUS_RING)}>
                                    Connecter une boîte
                                </Link>
                            }
                        />
                    ) : (
                        <ul className="divide-y divide-line-subtle">
                            {list.map((m) => {
                                const s = !m.isActive ? { tone: "neutral" as Tone, label: "Désactivée" } : SYNC[m.syncStatus] ?? { tone: "neutral" as Tone, label: m.syncStatus };
                                const ratio = m.dailySendLimit > 0 ? m.sentToday / m.dailySendLimit : 0;
                                return (
                                    <li key={m.id}>
                                        <Link href={`/manager/emails/mailboxes?mailbox=${m.id}`} className={cn("flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6", FOCUS_RING)}>
                                            <StatusDot tone={s.tone} label={s.label} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[13px] font-semibold text-ink">{m.email}</p>
                                                <p className="truncate text-xs text-ink-3">
                                                    {PROVIDER_LABEL[m.provider] ?? m.provider} · {s.label}
                                                    {m.syncStatus !== "ERROR" && m.isActive && ` ${formatAgo(m.lastSyncAt)}`}
                                                    {m.ownerName && ` · ${m.ownerName}`}
                                                </p>
                                                {m.error && <p className="mt-0.5 line-clamp-1 text-xs text-danger-ink">{m.error}</p>}
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className={cn("text-[13px] font-semibold tabular-nums", ratio >= 1 ? "text-danger" : ratio >= 0.9 ? "text-warning-ink" : "text-ink")}>
                                                    {formatInt(m.sentToday)}
                                                    <span className="font-medium text-ink-4"> / {formatInt(m.dailySendLimit)}</span>
                                                </p>
                                                <p className="text-2xs text-ink-4">envois aujourd&apos;hui</p>
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )
                }
            </BlockBody>
        </Section>
    );
}

// ── Séquences ────────────────────────────────────────────────────────

function Spark({ values }: { values: number[] }) {
    const max = Math.max(1, ...values);
    const total = values.reduce((a, b) => a + b, 0);
    return (
        <span className="inline-flex h-6 items-end gap-0.5" role="img" aria-label={`${total} envois sur 7 jours`}>
            {values.map((v, i) => (
                <span key={i} className={cn("w-1.5 rounded-sm", v ? "bg-primary-500" : "bg-surface-3")} style={{ height: `${Math.max(12, (v / max) * 100)}%` }} />
            ))}
        </span>
    );
}

export function SequencesSection({ state, onRetry }: { state: BlockState<SequencesData>; onRetry: () => void }) {
    const d = state.data;
    return (
        <Section
            title="Séquences"
            icon={Workflow}
            count={d ? formatInt(d.counts.active) : undefined}
            subtitle={d ? `${d.counts.active} active${d.counts.active > 1 ? "s" : ""} · ${d.counts.paused} en pause · ${d.counts.draft} brouillon${d.counts.draft > 1 ? "s" : ""}` : "Relances automatiques"}
            actions={<InlineLink href="/manager/emails/sequences">Toutes <ArrowRight className="size-3.5" aria-hidden /></InlineLink>}
        >
            <BlockBody state={state} onRetry={onRetry} skeleton={<RowsSkeleton rows={3} />}>
                {(s) => (
                    <div className="space-y-4">
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                                { label: "Inscrits", value: formatInt(s.enrolled) },
                                { label: "En cours", value: formatInt(s.inProgress) },
                                { label: "Réponses", value: formatInt(s.replied) },
                                { label: "Prochain envoi", value: s.nextSendAt ? formatWhen(s.nextSendAt) : "—" },
                            ].map((x) => (
                                <div key={x.label} className="rounded-panel border border-line bg-surface-2 px-3 py-2">
                                    <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">{x.label}</dt>
                                    <dd className="mt-0.5 text-base font-bold tabular-nums text-ink">{x.value}</dd>
                                </div>
                            ))}
                        </dl>
                        {s.rows.length === 0 ? (
                            <EmptyState
                                variant="inline"
                                icon={Workflow}
                                title="Aucune séquence active"
                                description={s.counts.draft ? `${s.counts.draft} brouillon${s.counts.draft > 1 ? "s" : ""} attend${s.counts.draft > 1 ? "ent" : ""} d'être activé${s.counts.draft > 1 ? "s" : ""}.` : "Créez une séquence pour relancer automatiquement vos prospects."}
                                action={
                                    <Link href={s.counts.draft ? "/manager/emails/sequences" : "/manager/emails/sequences/new"} className={cn("rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover", FOCUS_RING)}>
                                        {s.counts.draft ? "Voir les brouillons" : "Créer une séquence"}
                                    </Link>
                                }
                            />
                        ) : (
                            <ul className="divide-y divide-line-subtle rounded-panel border border-line">
                                {s.rows.map((r) => (
                                    <li key={r.id}>
                                        <Link href={`/manager/emails/sequences/${r.id}`} className={cn("flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2", FOCUS_RING)}>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-[13px] font-semibold text-ink">{r.name}</p>
                                                    <Badge size="xs" variant={r.status === "ACTIVE" ? "success" : "warning"} dot>{r.status === "ACTIVE" ? "Active" : "En pause"}</Badge>
                                                </div>
                                                <p className="truncate text-xs text-ink-3">
                                                    {r.steps} étape{r.steps > 1 ? "s" : ""} · {formatInt(r.inProgress)} en cours / {formatInt(r.enrolled)} inscrits · {formatInt(r.replied)} réponse{r.replied > 1 ? "s" : ""}
                                                    {r.mission && ` · ${r.mission.name}`}
                                                </p>
                                            </div>
                                            <Spark values={r.sent7d} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </BlockBody>
        </Section>
    );
}

// ── Templates ────────────────────────────────────────────────────────

export function TemplatesSection({ state, onRetry }: { state: BlockState<TemplatesData>; onRetry: () => void }) {
    const d = state.data;
    return (
        <Section
            title="Templates"
            icon={FileText}
            count={d ? formatInt(d.total) : undefined}
            subtitle={d ? (d.missionsWithout.total ? `${d.missionsWithout.total} mission${d.missionsWithout.total > 1 ? "s" : ""} active${d.missionsWithout.total > 1 ? "s" : ""} sans template` : "Chaque mission active a ses templates") : "Modèles d'emails"}
            actions={
                <Link href="/manager/emails/templates?new=1" className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-ink", FOCUS_RING)}>
                    <Plus className="size-3.5" aria-hidden /> Nouveau template
                </Link>
            }
        >
            <BlockBody state={state} onRetry={onRetry} skeleton={<RowsSkeleton rows={4} />}>
                {(t) => (
                    <div className="grid gap-5 md:grid-cols-2">
                        <div className="min-w-0">
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Les plus utilisés</h3>
                            {t.top.length === 0 ? (
                                <p className="rounded-panel border border-dashed border-line px-4 py-5 text-center text-xs text-ink-3">
                                    Aucun template n&apos;a encore servi à un envoi.
                                </p>
                            ) : (
                                <ul className="space-y-1">
                                    {t.top.map((x) => (
                                        <li key={x.id}>
                                            <Link href={`/manager/emails/templates?template=${x.id}`} className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2", FOCUS_RING)}>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[13px] font-semibold text-ink">{x.name}</span>
                                                    <span className="block truncate text-xs text-ink-3">
                                                        {x.missions} mission{x.missions > 1 ? "s" : ""}{x.lastUsedAt && ` · utilisé ${formatWhen(x.lastUsedAt)}`}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2">{formatInt(x.uses)} util.</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Missions sans template</h3>
                            {t.missionsWithout.items.length === 0 ? (
                                <p className="flex items-center gap-2 rounded-panel border border-dashed border-line px-4 py-5 text-xs text-ink-3">
                                    <CheckCircle2 className="size-4 text-success" aria-hidden /> Toutes les missions actives en ont.
                                </p>
                            ) : (
                                <ul className="space-y-1">
                                    {t.missionsWithout.items.map((m) => (
                                        <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-semibold text-ink">{m.name}</span>
                                                {m.clientName && <span className="block truncate text-xs text-ink-3">{m.clientName}</span>}
                                            </span>
                                            <InlineLink href={`/manager/emails/templates?mission=${m.id}`}>Ajouter</InlineLink>
                                        </li>
                                    ))}
                                    {t.missionsWithout.total > t.missionsWithout.items.length && (
                                        <li className="px-2 pt-1 text-xs text-ink-3">et {t.missionsWithout.total - t.missionsWithout.items.length} autre{t.missionsWithout.total - t.missionsWithout.items.length > 1 ? "s" : ""}</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </BlockBody>
        </Section>
    );
}

// ── Activité récente ─────────────────────────────────────────────────

const KIND: Record<ActivityEvent["kind"], { icon: LucideIcon; tone: Tone; verb: string }> = {
    received: { icon: Reply, tone: "success", verb: "Réponse de" },
    sent: { icon: Send, tone: "primary", verb: "Envoyé à" },
    queued: { icon: Clock, tone: "neutral", verb: "En attente d'envoi à" },
    opened: { icon: MousePointerClick, tone: "info", verb: "Ouvert par" },
    bounced: { icon: MailX, tone: "warning", verb: "Rebond :" },
    failed: { icon: AlertTriangle, tone: "danger", verb: "Échec d'envoi à" },
};

export function ActivitySection({ state, onRetry }: { state: BlockState<ActivityEvent[]>; onRetry: () => void }) {
    return (
        <Section title="Activité récente" icon={Megaphone} subtitle="Derniers emails envoyés, reçus et ouverts" flush>
            <BlockBody state={state} onRetry={onRetry} skeleton={<div className="p-5"><RowsSkeleton rows={5} /></div>}>
                {(events) =>
                    events.length === 0 ? (
                        <EmptyState variant="inline" icon={Inbox} title="Aucune activité" description="Les envois depuis l'écran d'appel et les réponses reçues apparaîtront ici." />
                    ) : (
                        <ul className="divide-y divide-line-subtle">
                            {events.map((e) => {
                                const k = KIND[e.kind];
                                const who = e.contact?.name || e.counterpart || "destinataire inconnu";
                                const cHref = contactHref(e.contact);
                                return (
                                    <li key={e.id} className="relative flex items-start gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                                        <IconTile icon={k.icon} tone={k.tone} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] text-ink-2">
                                                <span>{k.verb} </span>
                                                <Link href={inboxThreadHref(e.threadId)} className={cn("font-semibold text-ink after:absolute after:inset-0", FOCUS_RING, "rounded")}>
                                                    {who}
                                                </Link>
                                                {e.kind === "opened" && e.openCount ? <span className="text-ink-3"> ({e.openCount} fois)</span> : null}
                                            </p>
                                            <p className="truncate text-xs text-ink-3">{e.subject || "(sans objet)"}</p>
                                            <div className="relative z-10 mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
                                                {e.contact?.companyName &&
                                                    (cHref ? (
                                                        <Link href={cHref} className="font-medium text-ink-2 hover:text-link hover:underline">{e.contact.companyName}</Link>
                                                    ) : (
                                                        <span>{e.contact.companyName}</span>
                                                    ))}
                                                {e.sequence && (
                                                    <Link href={`/manager/emails/sequences/${e.sequence.id}`} className="hover:text-link hover:underline">
                                                        {e.sequence.name} · étape {e.sequence.step}
                                                    </Link>
                                                )}
                                                {e.sentByName && e.kind !== "received" && <span>par {e.sentByName}</span>}
                                                {e.mission && <span>{e.mission.name}</span>}
                                            </div>
                                        </div>
                                        <time className="shrink-0 text-xs tabular-nums text-ink-3" dateTime={e.at}>{formatWhen(e.at)}</time>
                                    </li>
                                );
                            })}
                        </ul>
                    )
                }
            </BlockBody>
        </Section>
    );
}
