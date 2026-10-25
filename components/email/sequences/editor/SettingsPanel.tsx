"use client";

import { Callout, Card, Field, Input, SegmentedControl, Select, StatusDot, Switch, Textarea } from "@/components/ui";
import { formatRelative, mailboxHealth, mailboxLabel, TIMEZONES, type MailboxInfo, type SequenceSettings } from "../types";

interface SettingsPanelProps {
    settings: SequenceSettings;
    onChange: (patch: Partial<SequenceSettings>) => void;
    mailboxes: MailboxInfo[];
    /** Show name + description (detail "Réglages" tab); the "new" screen asks them on top. */
    showIdentity?: boolean;
    /** The sequence already has contacts receiving emails. */
    hasActiveContacts?: boolean;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <Card padding="none">
            <div className="border-b border-line-subtle px-5 py-3">
                <h3 className="text-sm font-semibold text-ink">{title}</h3>
                {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
            </div>
            <div className="space-y-4 px-5 py-4">{children}</div>
        </Card>
    );
}

function windowSentence(s: SequenceSettings): string {
    const days = s.sendOnWeekends ? "tous les jours" : "du lundi au vendredi";
    const tz = TIMEZONES.find((t) => t.value === s.timezone)?.label.split(" (")[0] ?? s.timezone;
    if (!s.sendTimeStart || !s.sendTimeEnd) return `Les emails partent ${days}, à toute heure (heure de ${tz}).`;
    return `Les emails partent ${days} entre ${s.sendTimeStart} et ${s.sendTimeEnd} (heure de ${tz}).`;
}

export function SettingsPanel({ settings, onChange, mailboxes, showIdentity, hasActiveContacts }: SettingsPanelProps) {
    const mailbox = mailboxes.find((m) => m.id === settings.mailboxId) ?? null;
    const health = mailboxHealth(mailbox);
    const officeHours = !!settings.sendTimeStart && !!settings.sendTimeEnd;
    const tzOptions = TIMEZONES.some((t) => t.value === settings.timezone)
        ? TIMEZONES
        : [{ value: settings.timezone, label: settings.timezone }, ...TIMEZONES];

    return (
        <div className="space-y-4">
            {showIdentity && (
                <Section title="Séquence">
                    <Input
                        label="Nom"
                        value={settings.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                        maxLength={120}
                        required
                        error={!settings.name.trim() ? "Donnez un nom à la séquence" : undefined}
                    />
                    <Textarea
                        label="Description (interne)"
                        rows={2}
                        value={settings.description}
                        onChange={(e) => onChange({ description: e.target.value })}
                        placeholder="À qui s'adresse cette séquence, quel objectif…"
                    />
                </Section>
            )}

            <Section title="Boîte d'envoi" description="Les emails partent de cette adresse ; les réponses y arrivent.">
                <Field label="Envoyer depuis" required>
                    <Select
                        value={settings.mailboxId}
                        onChange={(v) => onChange({ mailboxId: v })}
                        placeholder={mailboxes.length ? "Choisir une boîte…" : "Aucune boîte connectée"}
                        options={mailboxes.map((m) => ({
                            value: m.id,
                            label: `${mailboxLabel(m)}${m.isActive ? "" : " (désactivée)"}`,
                            disabled: !m.isActive && m.id !== settings.mailboxId,
                        }))}
                    />
                </Field>
                {mailboxes.length === 0 && (
                    <Callout tone="warning" title="Aucune boîte d'envoi disponible">
                        Connectez une boîte dans l'onglet Boîtes mail pour pouvoir envoyer une séquence.
                    </Callout>
                )}
                {mailbox && (
                    <div className="space-y-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px]">
                        <div className="flex items-center gap-2">
                            <StatusDot tone={health.tone === "neutral" ? "info" : health.tone} />
                            <span className="font-medium text-ink">{health.label}</span>
                            {mailbox.lastSyncAt && <span className="text-xs text-ink-4">· synchro {formatRelative(mailbox.lastSyncAt)}</span>}
                        </div>
                        <p className="text-xs text-ink-3">
                            Quota : {mailbox.sentToday} / {mailbox.dailySendLimit} emails envoyés aujourd'hui. La séquence s'arrête pour la journée quand la limite est atteinte.
                        </p>
                        {health.detail && health.tone !== "success" && <p className="text-xs text-warning-ink">{health.detail}</p>}
                    </div>
                )}
            </Section>

            <Section title="Créneaux d'envoi" description={windowSentence(settings)}>
                <Switch
                    checked={officeHours}
                    onChange={(on) => onChange(on ? { sendTimeStart: "09:00", sendTimeEnd: "18:00" } : { sendTimeStart: "", sendTimeEnd: "" })}
                    label="Envoyer uniquement pendant les heures de bureau"
                    description="Recommandé : un email reçu à 3 h du matin trahit l'automatisation."
                />
                {officeHours && (
                    <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                        <Input type="time" label="De" value={settings.sendTimeStart} onChange={(e) => onChange({ sendTimeStart: e.target.value })} />
                        <Input
                            type="time"
                            label="À"
                            value={settings.sendTimeEnd}
                            onChange={(e) => onChange({ sendTimeEnd: e.target.value })}
                            error={settings.sendTimeEnd && settings.sendTimeEnd <= settings.sendTimeStart ? "Doit être après le début" : undefined}
                        />
                    </div>
                )}
                <Field label="Jours d'envoi">
                    <SegmentedControl
                        ariaLabel="Jours d'envoi"
                        value={settings.sendOnWeekends ? "all" : "week"}
                        onChange={(v) => onChange({ sendOnWeekends: v === "all" })}
                        options={[
                            { value: "week", label: "Lundi – vendredi" },
                            { value: "all", label: "Tous les jours" },
                        ]}
                    />
                </Field>
                <Field label="Fuseau horaire" hint="Celui de vos contacts : les heures ci-dessus s'y appliquent.">
                    <div className="sm:max-w-sm">
                        <Select value={settings.timezone} onChange={(v) => onChange({ timezone: v })} options={tzOptions} />
                    </div>
                </Field>
            </Section>

            <Section title="Arrêts automatiques">
                <Switch
                    checked={settings.stopOnReply}
                    onChange={(v) => onChange({ stopOnReply: v })}
                    label="Arrêter dès que le contact répond"
                    description="Fortement recommandé. La réponse est détectée lors de la synchronisation de la boîte."
                />
                <Switch
                    checked={settings.stopOnBounce}
                    onChange={(v) => onChange({ stopOnBounce: v })}
                    label="Arrêter si l'adresse rejette l'email (rebond)"
                />
            </Section>

            <Section title="Suivi">
                <Switch
                    checked={settings.trackOpens}
                    onChange={(v) => onChange({ trackOpens: v, trackClicks: v })}
                    label="Suivre les ouvertures et les clics"
                    description="Ajoute une image invisible et redirige les liens. Désactivez-le pour une meilleure délivrabilité en prospection à froid ; les réponses restent suivies."
                />
            </Section>

            {hasActiveContacts && (
                <Callout tone="info">
                    Les contacts déjà en cours suivront ces réglages à partir de leur prochain envoi.
                </Callout>
            )}
        </div>
    );
}
