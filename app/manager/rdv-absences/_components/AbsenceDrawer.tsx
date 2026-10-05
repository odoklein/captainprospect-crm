"use client";

/**
 * ============================================================
 * ABSENCE DRAWER — what a manager needs to decide, in one place
 * ============================================================
 * The list row says who and when. It cannot say whether anyone already called
 * the contact back, whether a new RDV was booked in the meantime, what the
 * prospect actually needed, or which SDR is a sensible person to hand it to —
 * and those are exactly the questions behind "Réaffecter", "Replacé" and
 * "Hors scope". This drawer answers them from /api/manager/rdv-absences/[id].
 *
 * The row it was opened from renders instantly (header, dates, feedback); the
 * rest streams in. Stand by / hors scope / replacé stay on the page's own
 * confirmation modals — the drawer closes and hands the row over — while
 * "Réaffecter" is done here, because picking the SDR is the whole point.
 */

import { useEffect, useMemo, useState } from "react";
import {
    Building2, CalendarClock, CalendarDays, Ban, Check, Clock, Globe, History,
    Linkedin, Mail, MapPin, MessageSquareQuote, PauseCircle, PlayCircle, Phone, RefreshCw,
    Sparkles, User, Users, Video, Briefcase,
} from "lucide-react";
import { Avatar, Badge, Button, Callout, Drawer, useToast } from "@/components/ui";
import { EYEBROW } from "@/components/ui/recipes";
import { ACTION_RESULT_LABELS, CHANNEL_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
    agingTone, elapsedLabel, fmtDate, RECONTACT_OPTS, SOURCE_LABEL,
    type AbsenceRow, type TabKey,
} from "../_shared";

interface SdrCandidate {
    id: string;
    name: string;
    email: string;
    isBooker: boolean;
    onMission: boolean;
    missionActions: number;
    touchedContact: number;
    openAbsences: number;
}

interface HistoryItem {
    id: string;
    at: string;
    result: string;
    channel: string;
    note: string | null;
    duration: number | null;
    sdrName: string;
    afterAbsence: boolean;
}

interface AbsenceDetail {
    meeting: {
        date: string | null;
        type: string | null;
        category: string | null;
        address: string | null;
        joinUrl: string | null;
        phone: string | null;
        bookedAt: string;
        confirmationStatus: string;
        confirmedAt: string | null;
        confirmedBy: string | null;
        interlocuteur: { name: string; title: string | null } | null;
    };
    contact: {
        name: string | null;
        title: string | null;
        email: string | null;
        phones: string[];
        emails: string[];
        linkedin: string | null;
    } | null;
    company: {
        name: string;
        industry: string | null;
        website: string | null;
        size: string | null;
        country: string | null;
        phone: string | null;
    } | null;
    booker: { id: string; name: string; email: string } | null;
    mission: { id: string; name: string; clientName: string | null; campaignName: string } | null;
    context: {
        bookingNote: string | null;
        callSummary: string | null;
        contexte: string | null;
        besoins: string | null;
        objections: string | null;
        notes: string | null;
    };
    followUp: {
        attemptsSinceAbsence: number;
        lastAttemptAt: string | null;
        newerMeeting: { id: string; date: string | null; type: string | null; confirmationStatus: string } | null;
    };
    history: HistoryItem[];
    sdrs: SdrCandidate[];
}

interface AbsenceDrawerProps {
    row: AbsenceRow | null;
    tab: TabKey;
    onClose: () => void;
    /** A write happened here: the page reloads its lists and the drawer is dropped. */
    onChanged: () => void;
    onStandBy: (row: AbsenceRow) => void;
    onOutOfScope: (row: AbsenceRow) => void;
    onReplace: (row: AbsenceRow) => void;
    onReactivate: (row: AbsenceRow) => void;
    isReactivating: boolean;
}

const MEETING_TYPE_LABEL: Record<string, string> = {
    VISIO: "Visio",
    PHYSIQUE: "Physique",
    TELEPHONIQUE: "Téléphonique",
};

const CONFIRMATION_LABEL: Record<string, string> = {
    PENDING: "En attente de confirmation",
    CONFIRMED: "Confirmé",
    CANCELLED: "Annulé",
};

const RECONTACT_LABEL: Record<string, string> = {
    YES: "À recontacter",
    MAYBE: "Peut-être à recontacter",
    NO: "À clôturer, ne pas recontacter",
};

const SDR_PREVIEW = 5;

function externalUrl(raw: string): string {
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function duration(seconds: number | null): string | null {
    if (!seconds || seconds <= 0) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} min ${s.toString().padStart(2, "0")} s` : `${s} s`;
}

// ----------------------------------------------------------------------------
// Small layout pieces
// ----------------------------------------------------------------------------

function Section({ title, icon: Icon, aside, children }: {
    title: string;
    icon: typeof User;
    aside?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-2">
                <Icon className="size-3.5 text-ink-4" aria-hidden />
                <h3 className={EYEBROW}>{title}</h3>
                <div className="h-px flex-1 bg-line-subtle" />
                {aside}
            </div>
            {children}
        </section>
    );
}

function Fact({ icon: Icon, label, children }: {
    icon: typeof User;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-ink-3">
                <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
                <p className="text-2xs font-medium text-ink-3">{label}</p>
                <div className="break-words text-sm text-ink">{children}</div>
            </div>
        </div>
    );
}

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 text-link hover:underline underline-offset-2"
        >
            <span className="truncate">{children}</span>
        </a>
    );
}

function Quote({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-panel border border-line bg-surface-2 px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{children}</p>
        </div>
    );
}

function DetailSkeleton() {
    return (
        <div className="space-y-6" aria-hidden>
            {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3">
                    <div className="h-3 w-28 animate-pulse rounded bg-surface-3" />
                    <div className="grid grid-cols-2 gap-3">
                        {[0, 1, 2, 3].map((j) => (
                            <div key={j} className="h-9 animate-pulse rounded-lg bg-surface-3" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ----------------------------------------------------------------------------
// Drawer
// ----------------------------------------------------------------------------

export function AbsenceDrawer({
    row, tab, onClose, onChanged, onStandBy, onOutOfScope, onReplace, onReactivate, isReactivating,
}: AbsenceDrawerProps) {
    const { success, error: showError } = useToast();

    const [detail, setDetail] = useState<AbsenceDetail | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [sdrId, setSdrId] = useState("");
    const [recontact, setRecontact] = useState("YES");
    const [showAllSdrs, setShowAllSdrs] = useState(false);
    const [isReassigning, setIsReassigning] = useState(false);

    const rowId = row?.id ?? null;

    useEffect(() => {
        setDetail(null);
        setLoadError(false);
        setSdrId("");
        setShowAllSdrs(false);
        setRecontact(row?.feedback?.recontactRequested ?? "YES");
        if (!rowId) return;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/manager/rdv-absences/${rowId}`);
                const json = await res.json();
                if (cancelled) return;
                if (json.success) setDetail(json.data as AbsenceDetail);
                else setLoadError(true);
            } catch {
                if (!cancelled) setLoadError(true);
            }
        })();
        return () => { cancelled = true; };
        // The row object changes identity on every list refresh; its id is what matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowId]);

    const sdrs = detail?.sdrs ?? [];
    const visibleSdrs = useMemo(() => {
        if (showAllSdrs || sdrs.length <= SDR_PREVIEW) return sdrs;
        const head = sdrs.slice(0, SDR_PREVIEW);
        // A picked SDR below the fold must not vanish from the list.
        const picked = sdrs.find((s) => s.id === sdrId);
        return picked && !head.some((s) => s.id === picked.id) ? [...head, picked] : head;
    }, [sdrs, showAllSdrs, sdrId]);
    const pickedSdr = sdrs.find((s) => s.id === sdrId) ?? null;

    async function reassign() {
        if (!row || !sdrId) return;
        setIsReassigning(true);
        try {
            const res = await fetch("/api/manager/rdv-absences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actionId: row.id, recontactRequested: recontact, reassignSdrId: sdrId }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Échec");
            success(
                pickedSdr ? `Réaffecté à ${pickedSdr.name}` : "RDV réaffecté",
                "Le contact remonte en haut de sa file d'appels avec le tag RDV ABSENT.",
            );
            onChanged();
        } catch (err) {
            showError(err instanceof Error ? err.message : "Réaffectation impossible");
        } finally {
            setIsReassigning(false);
        }
    }

    if (!row) return null;

    const tone = agingTone(row.callbackDate);
    const feedback = row.feedback;
    const isActive = tab !== "outofscope";
    const meeting = detail?.meeting;
    const contact = detail?.contact;
    const company = detail?.company;
    const followUp = detail?.followUp;
    const context = detail?.context;
    const hasContext = !!context && Object.values(context).some(Boolean);

    const statusBadge = tab === "standby"
        ? <Badge variant="default" dot>En stand by</Badge>
        : tab === "outofscope"
            ? <Badge variant="default" dot>Hors scope</Badge>
            : <Badge variant="danger" dot>Absent à traiter</Badge>;

    const footer = (
        <div className="flex flex-wrap items-center gap-2">
            {isActive && (
                <Button
                    variant="primary"
                    onClick={reassign}
                    isLoading={isReassigning}
                    disabled={!sdrId}
                    leftIcon={<RefreshCw className="size-4" />}
                    className="mr-auto"
                    title={sdrId ? undefined : "Choisissez d'abord qui reprend ce contact"}
                >
                    {pickedSdr ? `Réaffecter à ${pickedSdr.name.split(" ")[0]}` : "Réaffecter"}
                </Button>
            )}
            {!isActive && <div className="mr-auto" />}
            {tab !== "reported" && (
                <Button
                    variant="outline"
                    onClick={() => onReactivate(row)}
                    isLoading={isReactivating}
                    leftIcon={<PlayCircle className="size-4" />}
                >
                    Réactiver
                </Button>
            )}
            {tab === "reported" && (
                <Button variant="outline" onClick={() => onStandBy(row)} leftIcon={<PauseCircle className="size-4" />}>
                    Stand by
                </Button>
            )}
            {tab === "reported" && (
                <Button variant="outline" onClick={() => onReplace(row)} leftIcon={<CalendarClock className="size-4" />}>
                    Replacé
                </Button>
            )}
            {tab !== "outofscope" && (
                <Button variant="ghost" onClick={() => onOutOfScope(row)} leftIcon={<Ban className="size-4" />}>
                    Hors scope
                </Button>
            )}
        </div>
    );

    return (
        <Drawer
            isOpen
            onClose={onClose}
            title="Fiche de l'absence"
            description={`${row.contactName} · ${row.companyName}`}
            size="lg"
            footer={footer}
        >
            <div className="space-y-7">
                {/* Hero — straight from the list row, so it never waits on the network */}
                <div className="rounded-panel border border-line bg-surface-2 p-4">
                    <div className="flex items-start gap-3.5">
                        <Avatar name={row.contactName} size="xl" />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {statusBadge}
                                {feedback?.source && (
                                    <Badge variant={feedback.source === "MANAGER_MANUAL" ? "primary" : "default"}>
                                        {SOURCE_LABEL[feedback.source] ?? feedback.source}
                                    </Badge>
                                )}
                            </div>
                            <p className="mt-1.5 truncate text-xl font-semibold leading-tight text-ink">{row.contactName}</p>
                            <p className="mt-0.5 truncate text-sm text-ink-3">
                                {[contact?.title, row.companyName].filter(Boolean).join(" · ")}
                            </p>
                        </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-control border border-line bg-surface px-3 py-2">
                            <dt className="text-2xs font-medium text-ink-3">RDV prévu</dt>
                            <dd className="mt-0.5 text-sm font-semibold text-ink">{fmtDate(row.callbackDate)}</dd>
                        </div>
                        <div className="rounded-control border border-line bg-surface px-3 py-2">
                            <dt className="text-2xs font-medium text-ink-3">Depuis l&apos;absence</dt>
                            <dd
                                className={cn(
                                    "mt-0.5 text-sm font-semibold",
                                    tone === "stale" ? "text-danger" : tone === "late" ? "text-warning-ink" : "text-ink",
                                )}
                            >
                                {elapsedLabel(row.callbackDate)}
                            </dd>
                        </div>
                        <div className="rounded-control border border-line bg-surface px-3 py-2">
                            <dt className="text-2xs font-medium text-ink-3">Signalé</dt>
                            <dd className="mt-0.5 text-sm font-semibold text-ink">
                                {feedback?.reportedBy ?? "—"}
                                <span className="block text-2xs font-normal text-ink-3">
                                    {feedback?.reportedAt ? fmtDate(feedback.reportedAt) : ""}
                                </span>
                            </dd>
                        </div>
                    </dl>
                </div>

                {loadError && (
                    <Callout tone="danger" title="Détails indisponibles">
                        Le détail de ce RDV n&apos;a pas pu être chargé. Les actions ci-dessous restent disponibles.
                    </Callout>
                )}

                {!detail && !loadError && <DetailSkeleton />}

                {detail && (
                    <>
                        {/* Has this already been dealt with? */}
                        {isActive && followUp?.newerMeeting && (
                            <Callout
                                tone="warning"
                                title="Un nouveau RDV existe déjà pour ce contact"
                                action={tab === "reported" ? (
                                    <Button size="sm" variant="outline" onClick={() => onReplace(row)}>
                                        Marquer replacé
                                    </Button>
                                ) : undefined}
                            >
                                Prévu le {fmtDate(followUp.newerMeeting.date)}
                                {followUp.newerMeeting.type ? ` (${MEETING_TYPE_LABEL[followUp.newerMeeting.type] ?? followUp.newerMeeting.type})` : ""}.
                                Ce RDV-ci a probablement déjà été replacé.
                            </Callout>
                        )}

                        {isActive && followUp && followUp.attemptsSinceAbsence > 0 && (
                            <Callout tone="info" title={`${followUp.attemptsSinceAbsence} tentative${followUp.attemptsSinceAbsence > 1 ? "s" : ""} depuis l'absence`}>
                                Dernière {elapsedLabel(followUp.lastAttemptAt)}. Le détail est dans l&apos;historique plus bas.
                            </Callout>
                        )}

                        {tab === "reported" && followUp && followUp.attemptsSinceAbsence === 0 && !followUp.newerMeeting && (
                            <Callout tone="neutral" icon={Clock} title="Personne n'a recontacté ce contact">
                                Aucune action enregistrée sur ce contact depuis le RDV manqué.
                            </Callout>
                        )}

                        {(feedback?.note || feedback?.recontactRequested || feedback?.standByAt || feedback?.outOfScopeAt) && (
                            <Section title="Signalement" icon={MessageSquareQuote}>
                                <div className="space-y-2.5">
                                    {feedback?.note && <Quote label="Ce qu'a dit le client">{feedback.note}</Quote>}
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                                        <span className="text-ink-3">Recontact :</span>
                                        <Badge variant={feedback?.recontactRequested === "NO" ? "default" : "primary"}>
                                            {RECONTACT_LABEL[feedback?.recontactRequested ?? ""] ?? "Non précisé"}
                                        </Badge>
                                    </div>
                                    {feedback?.standByAt && (
                                        <p className="text-sm text-ink-2">
                                            <PauseCircle className="mr-1.5 inline size-3.5 align-[-2px] text-ink-3" />
                                            En stand by depuis le {fmtDate(feedback.standByAt)}
                                            {feedback.standByBy ? ` par ${feedback.standByBy}` : ""}
                                            {feedback.standByReason ? ` — ${feedback.standByReason}` : ""}
                                        </p>
                                    )}
                                    {feedback?.outOfScopeAt && (
                                        <p className="text-sm text-ink-2">
                                            <Ban className="mr-1.5 inline size-3.5 align-[-2px] text-ink-3" />
                                            Hors scope depuis le {fmtDate(feedback.outOfScopeAt)}
                                            {feedback.outOfScopeBy ? ` par ${feedback.outOfScopeBy}` : ""}
                                            {feedback.outOfScopeReason ? ` — ${feedback.outOfScopeReason}` : ""}
                                        </p>
                                    )}
                                </div>
                            </Section>
                        )}

                        <Section title="Le rendez-vous" icon={CalendarDays}>
                            <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                                <Fact icon={Video} label="Format">
                                    {meeting?.type ? (MEETING_TYPE_LABEL[meeting.type] ?? meeting.type) : "Non précisé"}
                                    {meeting?.category && <span className="text-ink-3"> · {meeting.category === "BESOIN" ? "Besoin" : "Exploratoire"}</span>}
                                </Fact>
                                <Fact
                                    icon={meeting?.type === "PHYSIQUE" ? MapPin : meeting?.type === "TELEPHONIQUE" ? Phone : Video}
                                    label={meeting?.type === "PHYSIQUE" ? "Lieu" : meeting?.type === "TELEPHONIQUE" ? "Numéro du RDV" : "Lien visio"}
                                >
                                    {meeting?.type === "PHYSIQUE"
                                        ? (meeting.address || <span className="text-ink-4">Non renseigné</span>)
                                        : meeting?.type === "TELEPHONIQUE"
                                            ? (meeting.phone ? <Anchor href={`tel:${meeting.phone}`}>{meeting.phone}</Anchor> : <span className="text-ink-4">Non renseigné</span>)
                                            : (meeting?.joinUrl ? <Anchor href={meeting.joinUrl}>{meeting.joinUrl}</Anchor> : <span className="text-ink-4">Non renseigné</span>)}
                                </Fact>
                                <Fact icon={User} label="Booké par">
                                    {detail.booker?.name ?? "—"}
                                    {meeting?.bookedAt && <span className="block text-2xs text-ink-3">le {fmtDate(meeting.bookedAt)}</span>}
                                </Fact>
                                <Fact icon={Check} label="Confirmation">
                                    {CONFIRMATION_LABEL[meeting?.confirmationStatus ?? ""] ?? meeting?.confirmationStatus ?? "—"}
                                    {meeting?.confirmedBy && <span className="block text-2xs text-ink-3">par {meeting.confirmedBy}</span>}
                                </Fact>
                                <Fact icon={Briefcase} label="Client · mission">
                                    {detail.mission
                                        ? <>{detail.mission.clientName ?? "Client"} · {detail.mission.name}<span className="block text-2xs text-ink-3">{detail.mission.campaignName}</span></>
                                        : "—"}
                                </Fact>
                                {meeting?.interlocuteur && (
                                    <Fact icon={Users} label="Reçu côté client par">
                                        {meeting.interlocuteur.name}
                                        {meeting.interlocuteur.title && <span className="block text-2xs text-ink-3">{meeting.interlocuteur.title}</span>}
                                    </Fact>
                                )}
                            </div>
                        </Section>

                        <Section title="Pour le recontacter" icon={Phone}>
                            <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                                <Fact icon={Phone} label="Téléphone">
                                    {contact?.phones.length
                                        ? <span className="flex flex-col gap-0.5">{contact.phones.map((p) => <Anchor key={p} href={`tel:${p.replace(/\s+/g, "")}`}>{p}</Anchor>)}</span>
                                        : company?.phone
                                            ? <><Anchor href={`tel:${company.phone.replace(/\s+/g, "")}`}>{company.phone}</Anchor><span className="block text-2xs text-ink-3">Standard société</span></>
                                            : <span className="text-ink-4">Aucun numéro</span>}
                                </Fact>
                                <Fact icon={Mail} label="Email">
                                    {contact?.emails.length
                                        ? <span className="flex flex-col gap-0.5">{contact.emails.map((e) => <Anchor key={e} href={`mailto:${e}`}>{e}</Anchor>)}</span>
                                        : <span className="text-ink-4">Aucun email</span>}
                                </Fact>
                                {contact?.linkedin && (
                                    <Fact icon={Linkedin} label="LinkedIn">
                                        <Anchor href={externalUrl(contact.linkedin)}>Voir le profil</Anchor>
                                    </Fact>
                                )}
                            </div>
                        </Section>

                        {company && (
                            <Section title="L'entreprise" icon={Building2}>
                                <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                                    <Fact icon={Building2} label="Société">{company.name}</Fact>
                                    <Fact icon={Briefcase} label="Secteur">{company.industry || <span className="text-ink-4">Non renseigné</span>}</Fact>
                                    <Fact icon={Users} label="Taille">{company.size || <span className="text-ink-4">Non renseignée</span>}</Fact>
                                    <Fact icon={MapPin} label="Pays">{company.country || <span className="text-ink-4">Non renseigné</span>}</Fact>
                                    {company.website && (
                                        <Fact icon={Globe} label="Site web">
                                            <Anchor href={externalUrl(company.website)}>{company.website.replace(/^https?:\/\//i, "")}</Anchor>
                                        </Fact>
                                    )}
                                </div>
                            </Section>
                        )}

                        {hasContext && context && (
                            <Section title="À savoir pour la relance" icon={Sparkles}>
                                <div className="space-y-2.5">
                                    {context.contexte && <Quote label="Contexte">{context.contexte}</Quote>}
                                    {context.besoins && <Quote label="Besoins / problèmes">{context.besoins}</Quote>}
                                    {context.objections && <Quote label="Objections / freins">{context.objections}</Quote>}
                                    {context.notes && <Quote label="Notes importantes">{context.notes}</Quote>}
                                    {context.callSummary && <Quote label="Résumé de l'appel">{context.callSummary}</Quote>}
                                    {context.bookingNote && <Quote label="Note du booker">{context.bookingNote}</Quote>}
                                </div>
                            </Section>
                        )}

                        <Section
                            title="Historique du contact"
                            icon={History}
                            aside={detail.history.length > 0 ? <span className="text-2xs text-ink-4">{detail.history.length} dernières actions</span> : undefined}
                        >
                            {detail.history.length === 0 ? (
                                <p className="text-sm text-ink-3">Aucune autre action enregistrée sur ce contact.</p>
                            ) : (
                                <ol className="relative space-y-3 border-l border-line pl-5">
                                    {detail.history.map((h) => {
                                        const len = duration(h.duration);
                                        return (
                                            <li key={h.id} className="relative">
                                                <span
                                                    className={cn(
                                                        "absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-surface",
                                                        h.afterAbsence ? "bg-primary-600" : "bg-ink-4",
                                                    )}
                                                    aria-hidden
                                                />
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                    <span className="text-sm font-semibold text-ink">
                                                        {ACTION_RESULT_LABELS[h.result] ?? h.result}
                                                    </span>
                                                    {h.afterAbsence && <Badge size="sm" variant="primary">Depuis l&apos;absence</Badge>}
                                                </div>
                                                <p className="text-xs text-ink-3">
                                                    {fmtDate(h.at)} · {CHANNEL_LABELS[h.channel as keyof typeof CHANNEL_LABELS] ?? h.channel} · {h.sdrName}
                                                    {len ? ` · ${len}` : ""}
                                                </p>
                                                {h.note && (
                                                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs italic text-ink-2">{h.note}</p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </Section>

                        {isActive && (
                            <Section title="Qui reprend ce contact ?" icon={RefreshCw}>
                                <div className="space-y-4">
                                    <div>
                                        <p className="mb-1.5 text-sm font-medium text-ink-2">Le prospect est-il à recontacter ?</p>
                                        <div className="flex flex-wrap gap-2">
                                            {RECONTACT_OPTS.map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => setRecontact(opt.value)}
                                                    className={cn(
                                                        "rounded-control border px-3 py-1.5 text-sm font-medium transition-colors",
                                                        recontact === opt.value
                                                            ? "border-primary-300 bg-primary-50 text-primary-700"
                                                            : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                                                    )}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div role="radiogroup" aria-label="SDR qui reprend le contact" className="space-y-2">
                                        {visibleSdrs.map((s) => {
                                            const picked = s.id === sdrId;
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={picked}
                                                    onClick={() => setSdrId(picked ? "" : s.id)}
                                                    className={cn(
                                                        "flex w-full items-center gap-3 rounded-panel border px-3.5 py-2.5 text-left transition-colors",
                                                        picked
                                                            ? "border-primary-300 bg-primary-50 ring-2 ring-primary-500/15"
                                                            : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                                                    )}
                                                >
                                                    <Avatar name={s.name} size="md" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {s.isBooker && <Badge size="sm">Booker d&apos;origine</Badge>}
                                                            {s.touchedContact > 0 && (
                                                                <Badge size="sm" variant="success">
                                                                    A déjà appelé ce contact{s.touchedContact > 1 ? ` (${s.touchedContact}×)` : ""}
                                                                </Badge>
                                                            )}
                                                            {s.onMission && <Badge size="sm" variant="primary">Sur la mission</Badge>}
                                                            {s.missionActions > 0 && (
                                                                <Badge size="sm" variant="outline">{s.missionActions} actions / 90 j</Badge>
                                                            )}
                                                            <Badge size="sm" variant={s.openAbsences >= 5 ? "warning" : "outline"}>
                                                                {s.openAbsences === 0 ? "Aucun absent en cours" : `${s.openAbsences} absent${s.openAbsences > 1 ? "s" : ""} en cours`}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <span
                                                        className={cn(
                                                            "flex size-5 shrink-0 items-center justify-center rounded-full border",
                                                            picked ? "border-primary-600 bg-primary-600 text-primary-fg" : "border-line-strong bg-surface",
                                                        )}
                                                        aria-hidden
                                                    >
                                                        {picked && <Check className="size-3" />}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                        {sdrs.length > SDR_PREVIEW && (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllSdrs((v) => !v)}
                                                className="text-xs font-semibold text-link hover:underline underline-offset-4"
                                            >
                                                {showAllSdrs ? "Réduire la liste" : `Voir les ${sdrs.length} SDR`}
                                            </button>
                                        )}
                                        {sdrs.length === 0 && <p className="text-sm text-ink-3">Aucun SDR actif.</p>}
                                    </div>
                                    <p className="text-xs text-ink-3">
                                        Classés : ceux qui connaissent déjà ce contact, puis ceux affectés à la mission, puis les moins chargés en absents.
                                    </p>
                                </div>
                            </Section>
                        )}
                    </>
                )}
            </div>
        </Drawer>
    );
}

export default AbsenceDrawer;
