"use client";

import { useRef, useState, type ReactNode } from "react";
import {
    Ban, CalendarDays, Clock, FileUp, Flag, Globe, Linkedin, Mail, Phone, Plus, Target, Trash2, TrendingUp, UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    CHANNELS, MEETING_CRITERIA, OBJECTION_SUGGESTIONS, SALES_CYCLES, WEEKDAYS, parseExclusions,
    type Answers, type ChannelKey,
} from "@/lib/client-onboarding/questionnaire";
import { CARD, Chip, ChoiceCard, Field, FOCUS, Question, TextArea, TextInput, Token } from "./ui";

export interface ScreenProps {
    answers: Answers;
    update: (fn: (a: Answers) => void) => void;
    clientName: string;
}

const CHANNEL_ICONS: Record<ChannelKey, typeof Phone> = { CALL: Phone, EMAIL: Mail, LINKEDIN: Linkedin };

function Narrow({ children }: { children: ReactNode }) {
    return <div className="mx-auto w-full max-w-3xl">{children}</div>;
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
                        <TextInput
                            id={id}
                            icon={Globe}
                            inputMode="url"
                            value={answers.company.website}
                            maxLength={200}
                            placeholder="www.votre-entreprise.fr"
                            onChange={(e) => update((a) => { a.company.website = e.target.value; })}
                        />
                    )}
                </Field>
            </div>
        </Narrow>
    );
}

export function OfferScreen({ answers, update }: ScreenProps) {
    return (
        <Narrow>
            <Question
                title="Quelle offre voulez-vous mettre en avant ?"
                subtitle="Le produit ou service que nous allons pousser en priorité, et ce qu'il représente pour vous."
            />
            <div className="space-y-6">
                <TextArea
                    aria-label="L'offre à mettre en avant"
                    autoFocus
                    value={answers.company.offer}
                    maxLength={1500}
                    placeholder="Ex. Un abonnement tout compris : installation, maintenance et supervision des bornes, à partir de 49 € par borne et par mois."
                    onChange={(e) => update((a) => { a.company.offer = e.target.value; })}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Panier moyen / valeur d'un contrat" optional>
                        {(id) => (
                            <TextInput
                                id={id}
                                value={answers.company.dealValue}
                                maxLength={120}
                                placeholder="Ex. 15 000 € HT/an"
                                onChange={(e) => update((a) => { a.company.dealValue = e.target.value; })}
                            />
                        )}
                    </Field>
                    <Field label="Durée habituelle du cycle de vente" optional>
                        {(id) => (
                            <select
                                id={id}
                                value={answers.company.salesCycle}
                                onChange={(e) => update((a) => { a.company.salesCycle = e.target.value; })}
                                className="w-full appearance-none rounded-xl border border-line bg-surface bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22><path d=%22m4 6 4 4 4-4%22/></svg>')] bg-[right_0.9rem_center] bg-no-repeat px-3.5 py-2.5 pr-10 text-[15px] text-ink hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                            >
                                <option value="">Sélectionner une réponse</option>
                                {SALES_CYCLES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                        )}
                    </Field>
                </div>
            </div>
        </Narrow>
    );
}

export function ChannelsScreen({ answers, update }: ScreenProps) {
    const toggle = (k: ChannelKey) => update((a) => {
        a.channels = a.channels.includes(k) ? a.channels.filter((c) => c !== k) : [...a.channels, k];
    });
    return (
        <div className="mx-auto w-full max-w-5xl">
            <Question
                title="Quels canaux voulez-vous activer ?"
                subtitle="Sélectionnez les canaux que nous devons utiliser pour contacter vos prospects. Vous pourrez en ajouter d'autres plus tard."
            />
            <div className="grid gap-4 md:grid-cols-3">
                {CHANNELS.map((c) => (
                    <ChoiceCard
                        key={c.key}
                        selected={answers.channels.includes(c.key)}
                        onClick={() => toggle(c.key)}
                        icon={CHANNEL_ICONS[c.key]}
                        title={c.label}
                        hint={c.hint}
                    />
                ))}
            </div>
        </div>
    );
}

export function ReferentScreen({ answers, update }: ScreenProps) {
    const r = answers.referent;
    return (
        <Narrow>
            <Question
                title="Qui sera notre interlocuteur chez vous ?"
                subtitle="La personne que nous tiendrons informée de l'avancement et qui validera les rendez-vous."
            />
            <div className={cn(CARD, "grid gap-5 p-6 sm:grid-cols-2")}>
                <Field label="Nom et prénom">
                    {(id) => <TextInput id={id} autoFocus autoComplete="name" value={r.name} maxLength={120} placeholder="Thomas Mercier" onChange={(e) => update((a) => { a.referent.name = e.target.value; })} />}
                </Field>
                <Field label="Fonction" optional>
                    {(id) => <TextInput id={id} autoComplete="organization-title" value={r.role} maxLength={120} placeholder="Directeur commercial" onChange={(e) => update((a) => { a.referent.role = e.target.value; })} />}
                </Field>
                <Field label="Email">
                    {(id) => <TextInput id={id} type="email" autoComplete="email" icon={Mail} value={r.email} maxLength={200} placeholder="thomas@entreprise.fr" onChange={(e) => update((a) => { a.referent.email = e.target.value.trim(); })} />}
                </Field>
                <Field label="Téléphone" optional>
                    {(id) => <TextInput id={id} type="tel" autoComplete="tel" icon={Phone} value={r.phone} maxLength={40} placeholder="06 12 34 56 78" onChange={(e) => update((a) => { a.referent.phone = e.target.value; })} />}
                </Field>
            </div>
        </Narrow>
    );
}

// ── Vos cibles (exclusions; the builder is TargetsScreen) ───────────────────

export function ExclusionsScreen({ answers, update }: ScreenProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [fileNote, setFileNote] = useState<string | null>(null);
    const names = parseExclusions(answers.exclusions.text);

    const importFile = async (file: File) => {
        const text = await file.text();
        // First column of each row, header dropped when it looks like one.
        const rows = text.split(/\r?\n/).map((l) => l.split(/[;,\t]/)[0]?.trim().replace(/^"|"$/g, "") ?? "").filter(Boolean);
        if (rows.length && /^(nom|name|entreprise|company|société|raison sociale)$/i.test(rows[0])) rows.shift();
        const before = parseExclusions(answers.exclusions.text).length;
        const merged = [answers.exclusions.text.trim(), ...rows].filter(Boolean).join("\n").slice(0, 20_000);
        update((a) => { a.exclusions.text = merged; });
        setFileNote(`${file.name} : ${parseExclusions(merged).length - before} entreprises ajoutées`);
    };

    return (
        <Narrow>
            <Question
                title="Des entreprises à ne pas contacter ?"
                subtitle="Vos clients actuels, partenaires, concurrents ou comptes déjà en discussion. Nous les retirerons de toutes nos listes."
            />
            <div className={cn(CARD, "p-6")}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Ban className="size-4 text-ink-3" aria-hidden />
                        <span className="font-display text-2xl font-extrabold tabular-nums text-ink">{names.length.toLocaleString("fr-FR")}</span>
                        entreprise{names.length > 1 ? "s" : ""} exclue{names.length > 1 ? "s" : ""}
                    </p>
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className={cn("inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2 text-sm font-bold text-ink-2 ring-1 ring-line hover:bg-surface-3", FOCUS)}
                    >
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
                    aria-label="Entreprises à exclure, une par ligne"
                    value={answers.exclusions.text}
                    maxLength={20_000}
                    placeholder={"Une entreprise par ligne\nAcme Industries\nRhonalog\n…"}
                    onChange={(e) => update((a) => { a.exclusions.text = e.target.value; })}
                    className="min-h-[180px] font-mono text-sm"
                />
                {fileNote && <p className="mt-2 text-xs font-semibold text-emerald-700" role="status">{fileNote}</p>}
                {names.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                        {names.slice(0, 12).map((n) => <Token key={n}>{n}</Token>)}
                        {names.length > 12 && <span className="px-1 py-1 text-xs font-semibold text-ink-3">+ {names.length - 12} autres</span>}
                    </div>
                )}
                <p className="mt-4 text-xs text-ink-3">Doublons retirés automatiquement. Vous pouvez aussi passer cette étape.</p>
            </div>
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
    return (
        <Narrow>
            <Question
                title="Pourquoi vos clients vous choisissent-ils ?"
                subtitle="Votre proposition de valeur et ce qui vous distingue : c'est le cœur du discours de nos équipes."
            />
            <div className="space-y-6">
                <Field label="Proposition de valeur en 2 phrases">
                    {(id) => (
                        <TextArea
                            id={id}
                            autoFocus
                            value={answers.message.valueProposition}
                            maxLength={600}
                            placeholder="Quel problème résolvez-vous, et avec quel bénéfice ?"
                            onChange={(e) => update((a) => { a.message.valueProposition = e.target.value; })}
                        />
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
                <Field label="Une preuve qui rassure" optional hint="Clients de référence, chiffres clés, labels, témoignages…">
                    {(id) => (
                        <TextArea
                            id={id}
                            value={answers.message.proof}
                            maxLength={1500}
                            placeholder="Ex. 120 entreprises équipées dont Rhonalog et Axiom Industrie ; 98 % de disponibilité des bornes."
                            onChange={(e) => update((a) => { a.message.proof = e.target.value; })}
                        />
                    )}
                </Field>
            </div>
        </Narrow>
    );
}

export function ObjectionsScreen({ answers, update }: ScreenProps) {
    const [draft, setDraft] = useState("");
    const list = answers.message.objections;
    const add = (text: string) => {
        const v = text.trim().slice(0, 120);
        if (!v || list.some((o) => o.objection.toLowerCase() === v.toLowerCase()) || list.length >= 12) return;
        update((a) => { a.message.objections.push({ objection: v, answer: "" }); });
    };
    return (
        <Narrow>
            <Question
                title="Quelles objections entendez-vous le plus ?"
                subtitle="Et comment y répondez-vous. Nos équipes s'en serviront pour ne jamais être prises de court."
            />
            <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                    {OBJECTION_SUGGESTIONS.filter((o) => !list.some((x) => x.objection === o)).map((o) => (
                        <button key={o} type="button" onClick={() => add(o)} className={cn("inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-1.5 text-sm font-semibold text-ink-2 hover:border-primary hover:bg-primary-50 hover:text-primary-800", FOCUS)}>
                            <Plus className="size-3.5" aria-hidden /> {o}
                        </button>
                    ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); add(draft); setDraft(""); }} className="flex gap-2">
                    <TextInput aria-label="Autre objection" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Une autre objection ? Tapez-la puis Entrée" />
                    <button type="submit" className={cn("shrink-0 rounded-xl bg-surface-2 px-4 text-sm font-bold text-ink-2 ring-1 ring-line hover:bg-surface-3", FOCUS)}>Ajouter</button>
                </form>
                {list.length > 0 && (
                    <ul className="space-y-3">
                        {list.map((o, i) => (
                            <li key={o.objection} className={cn(CARD, "p-4")}>
                                <div className="flex items-start justify-between gap-3">
                                    <p className="font-bold text-ink">« {o.objection} »</p>
                                    <button type="button" aria-label={`Retirer l'objection ${o.objection}`} onClick={() => update((a) => { a.message.objections.splice(i, 1); })} className={cn("rounded-lg p-1.5 text-ink-4 hover:bg-rose-50 hover:text-rose-600", FOCUS)}>
                                        <Trash2 className="size-4" aria-hidden />
                                    </button>
                                </div>
                                <TextArea
                                    aria-label={`Votre réponse à « ${o.objection} »`}
                                    value={o.answer}
                                    maxLength={600}
                                    placeholder="Votre réponse habituelle (facultatif)"
                                    onChange={(e) => update((a) => { a.message.objections[i].answer = e.target.value; })}
                                    className="mt-2 min-h-[64px] text-sm"
                                />
                            </li>
                        ))}
                    </ul>
                )}
                <Field label="Vos principaux concurrents" optional>
                    {(id) => <TextInput id={id} value={answers.message.competitors} maxLength={600} placeholder="Ex. ChargeCo, Volta Pro…" onChange={(e) => update((a) => { a.message.competitors = e.target.value; })} />}
                </Field>
            </div>
        </Narrow>
    );
}

export function MeetingsScreen({ answers, update }: ScreenProps) {
    const m = answers.meetings;
    const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    return (
        <Narrow>
            <Question
                title="Qu'est-ce qu'un bon rendez-vous pour vous ?"
                subtitle="Nous ne posons que des rendez-vous qui respectent vos critères. Dites-nous aussi où et quand les placer."
            />
            <div className="space-y-6">
                <fieldset>
                    <legend className="mb-2.5 text-sm font-semibold text-ink">Critères d&apos;un RDV qualifié</legend>
                    <div className="flex flex-wrap gap-2">
                        {MEETING_CRITERIA.map((c) => (
                            <Chip key={c} selected={m.criteria.includes(c)} onClick={() => update((a) => { a.meetings.criteria = toggle(a.meetings.criteria, c); })}>{c}</Chip>
                        ))}
                    </div>
                </fieldset>
                <div className={cn(CARD, "grid gap-5 p-6 sm:grid-cols-2")}>
                    <Field label="Qui participera aux RDV ?" optional>
                        {(id) => <TextInput id={id} icon={UserRound} value={m.attendee} maxLength={200} placeholder="Ex. Thomas Mercier, DG" onChange={(e) => update((a) => { a.meetings.attendee = e.target.value; })} />}
                    </Field>
                    <Field label="Lien de prise de RDV" optional hint="Calendly, Google Agenda, Outlook…">
                        {(id) => <TextInput id={id} icon={CalendarDays} inputMode="url" value={m.bookingUrl} maxLength={400} placeholder="https://calendly.com/…" onChange={(e) => update((a) => { a.meetings.bookingUrl = e.target.value.trim(); })} />}
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
            </div>
        </Narrow>
    );
}

// ── Vos objectifs ───────────────────────────────────────────────────────────

function todayIso(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

export function GoalsScreen({ answers, update }: ScreenProps) {
    const g = answers.goals;
    const endBeforeStart = !!g.launchDate && !!g.missionEndDate && g.missionEndDate < g.launchDate;
    return (
        <Narrow>
            <Question
                title="Quels sont vos objectifs ?"
                subtitle="Votre calendrier et ce que vous attendez de la mission. Nous construirons le plan de lancement à partir de là."
            />
            <div className={cn(CARD, "grid gap-5 p-6 sm:grid-cols-2")}>
                <Field label="Date de lancement souhaitée">
                    {(id) => <TextInput id={id} type="date" icon={Flag} min={todayIso()} value={g.launchDate} onChange={(e) => update((a) => { a.goals.launchDate = e.target.value; })} />}
                </Field>
                <Field label="Fin prévisionnelle de la mission" optional>
                    {(id) => (
                        <TextInput
                            id={id}
                            type="date"
                            icon={Clock}
                            min={g.launchDate || todayIso()}
                            value={g.missionEndDate}
                            aria-invalid={endBeforeStart}
                            onChange={(e) => update((a) => { a.goals.missionEndDate = e.target.value; })}
                        />
                    )}
                </Field>
                {endBeforeStart && <p className="-mt-3 text-xs font-semibold text-amber-700 sm:col-span-2" role="alert">La fin de mission est avant la date de lancement.</p>}
                <Field label="Objectif mensuel de RDV" optional>
                    {(id) => (
                        <TextInput
                            id={id}
                            icon={Target}
                            inputMode="numeric"
                            value={g.monthlyMeetings}
                            maxLength={4}
                            placeholder="Ex. 15"
                            onChange={(e) => update((a) => { a.goals.monthlyMeetings = e.target.value.replace(/\D/g, "").slice(0, 4); })}
                        />
                    )}
                </Field>
                <div className="hidden sm:block" />
                <div className="sm:col-span-2">
                    <Field label="Résultat commercial attendu à 3 mois" optional>
                        {(id) => (
                            <TextArea
                                id={id}
                                value={g.expectedOutcome}
                                maxLength={1000}
                                placeholder="Ex. 30 RDV réalisés, 8 opportunités ouvertes, 3 clients signés."
                                onChange={(e) => update((a) => { a.goals.expectedOutcome = e.target.value; })}
                            />
                        )}
                    </Field>
                </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
                <TrendingUp className="size-4" aria-hidden />
                Ces objectifs servent à dimensionner l&apos;équipe : ils ne sont pas un engagement contractuel.
            </p>
        </Narrow>
    );
}
