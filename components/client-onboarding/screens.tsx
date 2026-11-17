"use client";

import { useRef, useState, type ReactNode } from "react";
import {
    Ban, CalendarDays, ClipboardCheck, FileUp, Flag, Globe, Linkedin, Mail, Phone, Plus, Radar, Search, Target,
    Trash2, UserRound, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    CHANNELS, MAX_COLLABORATORS, MEETING_CRITERIA, MISSION_TYPES, WEEKDAYS, parseExclusions,
    type Answers, type ChannelKey, type MissionTypeKey,
} from "@/lib/client-onboarding/questionnaire";
import { CARD, Chip, ChoiceCard, Field, FOCUS, Question, TextArea, TextInput, Token } from "./ui";

export interface ScreenProps {
    answers: Answers;
    update: (fn: (a: Answers) => void) => void;
    clientName: string;
}

const CHANNEL_ICONS: Record<ChannelKey, typeof Phone> = { CALL: Phone, EMAIL: Mail, LINKEDIN: Linkedin };
const MISSION_ICONS: Record<MissionTypeKey, typeof Phone> = { RDV: CalendarDays, DETECTION: Radar, QUALIFICATION: ClipboardCheck, SURVEY: Search };

function Narrow({ children, wide }: { children: ReactNode; wide?: boolean }) {
    return <div className={cn("mx-auto w-full", wide ? "max-w-5xl" : "max-w-3xl")}>{children}</div>;
}

// ── Votre entreprise ────────────────────────────────────────────────────────

export function PitchScreen({ answers, update, clientName }: ScreenProps) {
    const len = answers.company.pitch.length;
    return (
        <Narrow>
            <Question
                eyebrow={clientName}
                title="En une phrase, que vendez-vous ?"
                subtitle="C'est la phrase que nos équipes utiliseront pour se présenter en votre nom. Simple et concrète, comme vous la diriez à un prospect."
            />
            <div className="space-y-6">
                <div>
                    <TextArea
                        aria-label="Ce que vous vendez, en une phrase"
                        autoFocus
                        value={answers.company.pitch}
                        maxLength={600}
                        placeholder="Ex. Nous installons et maintenons des bornes de recharge pour les flottes d'entreprise."
                        onChange={(e) => update((a) => { a.company.pitch = e.target.value; })}
                        className="min-h-[132px] text-lg"
                    />
                    <p className={cn("mt-1.5 text-right text-xs tabular-nums", len > 220 ? "text-amber-600" : "text-ink-4")}>
                        {len > 220 ? "Un peu long : visez une phrase courte · " : ""}{len} / 600
                    </p>
                </div>
                <Field label="Votre site web" optional>
                    {(id) => (
                        <TextInput id={id} icon={Globe} inputMode="url" value={answers.company.website} maxLength={200} placeholder="www.votre-entreprise.fr" onChange={(e) => update((a) => { a.company.website = e.target.value; })} />
                    )}
                </Field>
            </div>
        </Narrow>
    );
}

export function MissionScreen({ answers, update }: ScreenProps) {
    const toggle = (k: ChannelKey) => update((a) => {
        a.channels = a.channels.includes(k) ? a.channels.filter((c) => c !== k) : [...a.channels, k];
    });
    return (
        <Narrow wide>
            <Question title="Quelle mission nous confiez-vous ?" subtitle="Votre objectif principal, puis les canaux que nos équipes peuvent utiliser." />
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Type de mission">
                {MISSION_TYPES.map((m) => {
                    const on = answers.mission.type === m.key;
                    const IconC = MISSION_ICONS[m.key];
                    return (
                        <button
                            key={m.key}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => update((a) => { a.mission.type = m.key; })}
                            className={cn(
                                "flex items-start gap-4 rounded-[20px] border-2 p-5 text-left transition-all",
                                on ? "border-primary bg-primary-50/50 shadow-[0_12px_32px_-16px_color-mix(in_oklab,var(--brand-primary)_55%,transparent)]" : "border-line bg-surface hover:border-line-strong",
                                FOCUS,
                            )}
                        >
                            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", on ? "bg-primary text-primary-fg" : "bg-surface-2 text-ink-2")} aria-hidden>
                                <IconC className="size-6" />
                            </span>
                            <span>
                                <span className="block font-display text-lg font-bold text-ink">{m.label}</span>
                                <span className="mt-0.5 block text-sm leading-relaxed text-ink-3">{m.hint}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            <h2 className="mb-3 mt-10 font-display text-xl font-bold text-ink">Quels canaux voulez-vous activer ?</h2>
            <div className="grid gap-4 md:grid-cols-3">
                {CHANNELS.map((c) => (
                    <ChoiceCard key={c.key} selected={answers.channels.includes(c.key)} onClick={() => toggle(c.key)} icon={CHANNEL_ICONS[c.key]} title={c.label} hint={c.hint} />
                ))}
            </div>
        </Narrow>
    );
}

export function OfferScreen({ answers, update }: ScreenProps) {
    return (
        <Narrow>
            <Question title="Quelle offre voulez-vous mettre en avant ?" subtitle="Le produit ou service que nous allons pousser en priorité, et ce qu'il représente pour vous." />
            <div className="space-y-6">
                <TextArea
                    aria-label="Le produit ou service à promouvoir"
                    autoFocus
                    value={answers.company.offer}
                    maxLength={1500}
                    placeholder="Ex. Un abonnement tout compris : installation, maintenance et supervision des bornes, à partir de 49 € par borne et par mois."
                    onChange={(e) => update((a) => { a.company.offer = e.target.value; })}
                />
                <Field label="Panier moyen / valeur d'un contrat" optional>
                    {(id) => <TextInput id={id} value={answers.company.dealValue} maxLength={120} placeholder="Ex. 15 000 € HT/an" onChange={(e) => update((a) => { a.company.dealValue = e.target.value; })} />}
                </Field>
            </div>
        </Narrow>
    );
}

export function ReferentScreen({ answers, update }: ScreenProps) {
    const r = answers.referent;
    return (
        <Narrow>
            <Question title="Faisons connaissance" subtitle="Vous serez notre interlocuteur principal : nous vous tiendrons informé de l'avancement et des rendez-vous." />
            <div className={cn(CARD, "grid gap-5 p-6 sm:grid-cols-2")}>
                <Field label="Nom et prénom">
                    {(id) => <TextInput id={id} autoFocus autoComplete="name" value={r.name} maxLength={120} placeholder="Thomas Mercier" onChange={(e) => update((a) => { a.referent.name = e.target.value; })} />}
                </Field>
                <Field label="Votre rôle">
                    {(id) => <TextInput id={id} autoComplete="organization-title" value={r.role} maxLength={120} placeholder="Directeur commercial" onChange={(e) => update((a) => { a.referent.role = e.target.value; })} />}
                </Field>
                <Field label="Email">
                    {(id) => <TextInput id={id} type="email" autoComplete="email" icon={Mail} value={r.email} maxLength={200} placeholder="thomas@entreprise.fr" onChange={(e) => update((a) => { a.referent.email = e.target.value.trim(); })} />}
                </Field>
                <Field label="Téléphone" optional>
                    {(id) => <TextInput id={id} type="tel" autoComplete="tel" icon={Phone} value={r.phone} maxLength={40} placeholder="06 12 34 56 78" onChange={(e) => update((a) => { a.referent.phone = e.target.value; })} />}
                </Field>
            </div>

            <section className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
                        <Users className="size-[18px] text-ink-3" aria-hidden /> Collaborateurs à inviter <span className="text-xs font-medium text-ink-4">· facultatif</span>
                    </h2>
                </div>
                <p className="mb-3 text-sm text-ink-3">Vos commerciaux ou toute personne qui suivra la mission.</p>
                <ul className="space-y-2.5">
                    {answers.collaborators.map((c, i) => (
                        <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
                            <TextInput aria-label={`Nom du collaborateur ${i + 1}`} value={c.name} maxLength={120} placeholder="Nom" onChange={(e) => update((a) => { a.collaborators[i].name = e.target.value; })} />
                            <TextInput aria-label={`Rôle du collaborateur ${i + 1}`} value={c.role} maxLength={120} placeholder="Rôle" onChange={(e) => update((a) => { a.collaborators[i].role = e.target.value; })} />
                            <TextInput aria-label={`Email du collaborateur ${i + 1}`} type="email" value={c.email} maxLength={200} placeholder="email@entreprise.fr" onChange={(e) => update((a) => { a.collaborators[i].email = e.target.value.trim(); })} />
                            <button type="button" aria-label={`Retirer le collaborateur ${i + 1}`} onClick={() => update((a) => { a.collaborators.splice(i, 1); })} className={cn("justify-self-start rounded-lg p-2.5 text-ink-4 hover:bg-rose-50 hover:text-rose-600", FOCUS)}>
                                <Trash2 className="size-4" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
                {answers.collaborators.length < MAX_COLLABORATORS && (
                    <button
                        type="button"
                        onClick={() => update((a) => { a.collaborators.push({ name: "", role: "", email: "" }); })}
                        className={cn("mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3.5 py-2 text-sm font-bold text-ink-2 hover:border-primary hover:text-primary-700", FOCUS)}
                    >
                        <Plus className="size-4" aria-hidden /> Ajouter un collaborateur
                    </button>
                )}
            </section>
        </Narrow>
    );
}

// ── Votre discours ──────────────────────────────────────────────────────────

const BENEFIT_PLACEHOLDERS = [
    "Ex. Déploiement en 3 semaines, sans travaux lourds",
    "Ex. ROI mesurable dès le premier trimestre",
    "Ex. Un interlocuteur unique, disponible 7j/7",
];

export function ValueScreen({ answers, update }: ScreenProps) {
    const benefits = [0, 1, 2].map((i) => answers.message.benefits[i] ?? "");
    const competitors = [0, 1, 2].map((i) => answers.message.competitors[i] ?? { name: "", website: "" });
    const setCompetitor = (i: number, patch: Partial<{ name: string; website: string }>) => update((a) => {
        const next = [0, 1, 2].map((j) => a.message.competitors[j] ?? { name: "", website: "" });
        next[i] = { ...next[i], ...patch };
        a.message.competitors = next;
    });
    return (
        <Narrow>
            <Question title="Pourquoi vos clients vous choisissent-ils ?" subtitle="Votre proposition de valeur et ce qui vous distingue : c'est le cœur du discours de nos équipes." />
            <div className="space-y-7">
                <Field label="Proposition de valeur en 2 phrases">
                    {(id) => (
                        <TextArea id={id} autoFocus value={answers.message.valueProposition} maxLength={600} placeholder="Quel problème résolvez-vous, et avec quel bénéfice ?" onChange={(e) => update((a) => { a.message.valueProposition = e.target.value; })} />
                    )}
                </Field>
                <fieldset>
                    <legend className="mb-1.5 text-sm font-semibold text-ink">3 avantages concurrentiels</legend>
                    <ol className="space-y-2.5">
                        {benefits.map((b, i) => (
                            <li key={i} className="flex items-center gap-3">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-extrabold text-primary-700" aria-hidden>{i + 1}</span>
                                <TextInput
                                    aria-label={`Avantage ${i + 1}`}
                                    value={b}
                                    maxLength={300}
                                    placeholder={BENEFIT_PLACEHOLDERS[i]}
                                    onChange={(e) => update((a) => {
                                        const next = [0, 1, 2].map((j) => a.message.benefits[j] ?? "");
                                        next[i] = e.target.value;
                                        a.message.benefits = next;
                                    })}
                                />
                            </li>
                        ))}
                    </ol>
                </fieldset>
                <fieldset>
                    <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm font-semibold text-ink">
                        <span>Vos 3 principaux concurrents</span>
                        <span className="text-xs font-medium text-ink-4">Facultatif</span>
                    </legend>
                    <ol className="space-y-2.5">
                        {competitors.map((c, i) => (
                            <li key={i} className="grid gap-2 sm:grid-cols-[2rem_1fr_1fr] sm:items-center">
                                <span className="hidden size-8 items-center justify-center rounded-xl bg-surface-2 text-sm font-extrabold text-ink-3 sm:flex" aria-hidden>{i + 1}</span>
                                <TextInput aria-label={`Nom du concurrent ${i + 1}`} value={c.name} maxLength={120} placeholder="Nom" onChange={(e) => setCompetitor(i, { name: e.target.value })} />
                                <TextInput aria-label={`Site web du concurrent ${i + 1}`} icon={Globe} inputMode="url" value={c.website} maxLength={200} placeholder="www.concurrent.fr" onChange={(e) => setCompetitor(i, { website: e.target.value.trim() })} />
                            </li>
                        ))}
                    </ol>
                </fieldset>
                <Field label="Une preuve qui rassure" optional hint="Clients de référence, chiffres clés, labels, témoignages…">
                    {(id) => (
                        <TextArea id={id} value={answers.message.proof} maxLength={1500} placeholder="Ex. 120 entreprises équipées dont Rhonalog et Axiom Industrie ; 98 % de disponibilité des bornes." onChange={(e) => update((a) => { a.message.proof = e.target.value; })} />
                    )}
                </Field>
            </div>
        </Narrow>
    );
}

export function MeetingsScreen({ answers, update }: ScreenProps) {
    const m = answers.meetings;
    const g = answers.goals;
    const isRdv = answers.mission.type === "RDV" || !answers.mission.type;
    const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    return (
        <Narrow>
            <Question
                title={isRdv ? "Qu'est-ce qu'un bon rendez-vous pour vous ?" : "Ce qui compte pour vous"}
                subtitle={isRdv ? "Nous ne posons que des rendez-vous qui respectent vos critères." : "Vos critères de qualité et votre objectif de volume."}
            />
            <div className="space-y-6">
                <fieldset>
                    <legend className="mb-2.5 text-sm font-semibold text-ink">
                        {isRdv ? "Critères d'un RDV qualifié" : "Critères d'un contact qualifié"}
                        {!isRdv && <span className="ml-2 text-xs font-medium text-ink-4">Facultatif</span>}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                        {MEETING_CRITERIA.map((c) => (
                            <Chip key={c} selected={m.criteria.includes(c)} onClick={() => update((a) => { a.meetings.criteria = toggle(a.meetings.criteria, c); })}>{c}</Chip>
                        ))}
                    </div>
                </fieldset>
                <div className={cn(CARD, "grid gap-5 p-6 sm:grid-cols-2")}>
                    <Field label={isRdv ? "Objectif mensuel de RDV" : "Objectif mensuel"} optional>
                        {(id) => (
                            <TextInput id={id} icon={Target} inputMode="numeric" value={g.monthlyMeetings} maxLength={4} placeholder="Ex. 15" onChange={(e) => update((a) => { a.goals.monthlyMeetings = e.target.value.replace(/\D/g, "").slice(0, 4); })} />
                        )}
                    </Field>
                    <Field label="Date de lancement souhaitée" optional hint="Votre souhait : la date est fixée avec votre chef de projet.">
                        {(id) => <TextInput id={id} type="date" icon={Flag} value={g.launchDate} onChange={(e) => update((a) => { a.goals.launchDate = e.target.value; })} />}
                    </Field>
                </div>
            </div>
        </Narrow>
    );
}

// ── Prochaines étapes (after approval) ──────────────────────────────────────

export function BlacklistEditor({ answers, update }: Omit<ScreenProps, "clientName">) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [fileNote, setFileNote] = useState<string | null>(null);
    const names = parseExclusions(answers.exclusions.text);

    const importFile = async (file: File) => {
        const text = await file.text();
        // First column of each row, header dropped when it looks like one.
        const rows = text.split(/\r?\n/).map((l) => l.split(/[;,\t]/)[0]?.trim().replace(/^"|"$/g, "") ?? "").filter(Boolean);
        if (rows.length && /^(nom|name|entreprise|company|société|raison sociale)$/i.test(rows[0])) rows.shift();
        const before = names.length;
        const merged = [answers.exclusions.text.trim(), ...rows].filter(Boolean).join("\n").slice(0, 20_000);
        update((a) => { a.exclusions.text = merged; });
        setFileNote(`${file.name} : ${parseExclusions(merged).length - before} entreprises ajoutées`);
    };

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Ban className="size-4 text-ink-3" aria-hidden />
                    <span className="font-display text-2xl font-extrabold tabular-nums">{names.length.toLocaleString("fr-FR")}</span>
                    entreprise{names.length > 1 ? "s" : ""} à ne pas contacter
                </p>
                <button type="button" onClick={() => fileRef.current?.click()} className={cn("inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2 text-sm font-bold text-ink-2 ring-1 ring-line hover:bg-surface-3", FOCUS)}>
                    <FileUp className="size-4" aria-hidden /> Importer un CSV
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importFile(f);
                        e.target.value = "";
                    }}
                />
            </div>
            <TextArea
                aria-label="Entreprises à ne pas contacter, une par ligne"
                value={answers.exclusions.text}
                maxLength={20_000}
                placeholder={"Vos clients actuels, partenaires, concurrents…\nUne entreprise par ligne"}
                onChange={(e) => update((a) => { a.exclusions.text = e.target.value; })}
                className="min-h-[140px] font-mono text-sm"
            />
            {fileNote && <p className="mt-2 text-xs font-semibold text-emerald-700" role="status">{fileNote}</p>}
            {names.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {names.slice(0, 10).map((n) => <Token key={n}>{n}</Token>)}
                    {names.length > 10 && <span className="px-1 py-1 text-xs font-semibold text-ink-3">+ {names.length - 10} autres</span>}
                </div>
            )}
        </div>
    );
}

export function CalendarEditor({ answers, update }: Omit<ScreenProps, "clientName">) {
    const m = answers.meetings;
    const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    return (
        <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Lien de prise de RDV" hint="Calendly, Cal.com, Google Agenda, Outlook…">
                {(id) => <TextInput id={id} icon={CalendarDays} inputMode="url" value={m.bookingUrl} maxLength={400} placeholder="https://calendly.com/…" onChange={(e) => update((a) => { a.meetings.bookingUrl = e.target.value.trim(); })} />}
            </Field>
            <Field label="Qui participera aux RDV ?" optional>
                {(id) => <TextInput id={id} icon={UserRound} value={m.attendee} maxLength={200} placeholder="Ex. Thomas Mercier, DG" onChange={(e) => update((a) => { a.meetings.attendee = e.target.value; })} />}
            </Field>
            <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-semibold text-ink">Jours préférés <span className="text-xs font-medium text-ink-4">· facultatif</span></legend>
                <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => (
                        <Chip key={d.key} size="sm" selected={m.days.includes(d.key)} onClick={() => update((a) => { a.meetings.days = toggle(a.meetings.days, d.key) as typeof a.meetings.days; })}>{d.label}</Chip>
                    ))}
                </div>
            </fieldset>
        </div>
    );
}

export function DocumentsEditor({ answers, update }: Omit<ScreenProps, "clientName">) {
    return (
        <Field label="Liens vers vos documents" hint="Plaquette, présentation, grille tarifaire, cas clients, FAQ… Un lien par ligne (Drive, Dropbox, site).">
            {(id) => (
                <TextArea
                    id={id}
                    value={answers.documents.links}
                    maxLength={3000}
                    placeholder={"https://drive.google.com/…/plaquette.pdf\nhttps://www.votre-site.fr/references"}
                    onChange={(e) => update((a) => { a.documents.links = e.target.value; })}
                    className="font-mono text-sm"
                />
            )}
        </Field>
    );
}
