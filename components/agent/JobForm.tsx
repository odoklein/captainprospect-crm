"use client";

/**
 * Create or edit a scheduled agent task. Creating starts from the playbook
 * catalog (AGENT_API.playbooks); the form then asks for a name, a scope, a
 * schedule (ScheduleBuilder), the playbook's own settings (ConfigForm, from
 * its JSON Schema), the dry-run switch and how to notify.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { FOCUS_RING } from "@/components/ui/recipes";
import { EmptyBlock, PRIMARY_BUTTON, SECONDARY_BUTTON, SelectField, Shimmer } from "@/components/accueil/AccueilUI";
import type { AgentJobItem, AgentPlaybookItem } from "@/lib/assistant/api-contract";
import { buildConfigFields, initialDraft, optionLabel, readDraft, schemaEnum, type ConfigDraft } from "@/lib/agent/client/config-form";
import { describeCron } from "@/lib/agent/client/schedule";
import { createJob, patchJob, useClientOptions, usePlaybooks } from "@/lib/agent/client/hooks";
import { ConfigForm } from "./ConfigForm";
import { ScheduleBuilder } from "./ScheduleBuilder";
import { KIND_ICON, KindTag, stagger } from "./shared";

export interface JobFormTarget {
    /** Edit this job; omit to create. */
    job?: AgentJobItem | null;
    /** Create: preselect this playbook (skips the catalog). */
    playbook?: string | null;
    /** Create: lock the scope to this client. */
    client?: { clientId: string; folderId: string | null; name: string } | null;
}

export function JobForm({ target, onClose }: { target: JobFormTarget | null; onClose: () => void }) {
    const { playbooks, isLoading, error } = usePlaybooks();
    const editing = target?.job ?? null;
    const [picked, setPicked] = useState<string | null>(null);
    const playbookId = editing?.playbook ?? picked ?? target?.playbook ?? null;
    const playbook = playbooks.find((p) => p.id === playbookId) ?? null;
    const lockedClient = target?.client ?? null;

    const close = () => {
        setPicked(null);
        onClose();
    };

    const catalog = playbooks.filter((p) => !lockedClient || p.scope !== "agency");

    return (
        <Drawer
            isOpen={target !== null}
            onClose={close}
            size="md"
            title={editing ? "Modifier la tâche" : playbook ? playbook.label : "Nouvelle tâche"}
            description={editing ? editing.playbookLabel : playbook ? "Réglages de la tâche" : "Choisis ce que l’agent doit faire"}
            headerLeft={
                !editing && picked && !target?.playbook ? (
                    <button type="button" onClick={() => setPicked(null)} aria-label="Revenir au catalogue" className={cn("rounded-lg p-2 text-ink-3 hover:bg-surface-3 hover:text-ink", FOCUS_RING)}>
                        <ArrowLeft className="size-4" />
                    </button>
                ) : undefined
            }
        >
            {target === null ? null : isLoading && playbooks.length === 0 ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Shimmer key={i} className="h-20 rounded-panel" style={stagger(i)} />
                    ))}
                </div>
            ) : error && playbooks.length === 0 ? (
                <EmptyBlock tone="rose" title="Catalogue indisponible" hint={error instanceof Error ? error.message : undefined} />
            ) : playbook ? (
                <JobFormBody
                    key={`${editing?.id ?? "new"}-${playbook.id}`}
                    playbook={playbook}
                    job={editing}
                    lockedClient={lockedClient}
                    onDone={close}
                />
            ) : editing ? (
                <EmptyBlock tone="amber" title="Playbook introuvable" hint={`« ${editing.playbook} » n’existe plus dans cette version.`} />
            ) : catalog.length === 0 ? (
                <EmptyBlock tone="slate" title="Aucun playbook disponible" />
            ) : (
                <ul className="space-y-2">
                    {catalog.map((p, i) => {
                        const Icon = KIND_ICON[p.kind];
                        return (
                            <li key={p.id} className="motion-safe:animate-ds-enter" style={stagger(i)}>
                                <button
                                    type="button"
                                    onClick={() => setPicked(p.id)}
                                    className={cn(
                                        "group flex w-full items-start gap-3 rounded-panel border border-line bg-surface p-3.5 text-left shadow-2xs",
                                        "transition-[border-color,box-shadow] duration-150 ease-snappy hover:border-line-strong hover:shadow-raised",
                                        FOCUS_RING,
                                    )}
                                >
                                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-accent-200 bg-accent-50 text-accent-700">
                                        <Icon className="size-4" aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold text-ink">{p.label}</span>
                                            <KindTag kind={p.kind} />
                                        </span>
                                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{p.description}</span>
                                        {p.defaultSchedule && <span className="mt-1.5 block text-[11px] font-medium text-ink-4">Par défaut : {describeCron(p.defaultSchedule)}</span>}
                                    </span>
                                    <ChevronRight className="mt-2 size-4 shrink-0 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Drawer>
    );
}

function JobFormBody({
    playbook,
    job,
    lockedClient,
    onDone,
}: {
    playbook: AgentPlaybookItem;
    job: AgentJobItem | null;
    lockedClient: JobFormTarget["client"];
    onDone: () => void;
}) {
    const toast = useToast();
    const needsClientPicker = !job && !lockedClient && playbook.scope !== "agency";
    const { clients } = useClientOptions(needsClientPicker);
    const fields = useMemo(() => buildConfigFields(playbook.configSchema), [playbook.configSchema]);
    const notifyOptions = useMemo(() => {
        const fromSchema = schemaEnum(playbook.configSchema, "notify");
        return fromSchema.length > 0 ? fromSchema : ["immediate", "digest"];
    }, [playbook.configSchema]);

    const [name, setName] = useState(job?.name ?? (lockedClient ? `${playbook.label} · ${lockedClient.name}` : playbook.label));
    const [clientId, setClientId] = useState<string>(job?.clientId ?? lockedClient?.clientId ?? "");
    const [schedule, setSchedule] = useState<string | null>(job ? job.schedule : playbook.defaultSchedule);
    const [scheduleValid, setScheduleValid] = useState(true);
    const [draft, setDraft] = useState<ConfigDraft>(() => initialDraft(fields, job?.config));
    const [dryRun, setDryRun] = useState<boolean>(job?.config?.dryRun === true);
    const [notify, setNotify] = useState<string>(typeof job?.config?.notify === "string" ? (job.config.notify as string) : notifyOptions[0]);
    const [enabled, setEnabled] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        const read = readDraft(fields, draft);
        const nextErrors: Record<string, string> = { ...read.errors };
        if (!name.trim()) nextErrors.__name = "Donne un nom à la tâche.";
        if (playbook.scope === "client" && !clientId) nextErrors.__client = "Choisis le client concerné.";
        if (!scheduleValid) nextErrors.__schedule = "Planification incomplète.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        const config = { ...(job?.config ?? {}), ...read.values, dryRun, notify };
        for (const f of fields) if (!(f.key in read.values)) delete (config as Record<string, unknown>)[f.key];
        setSaving(true);
        try {
            if (job) {
                await patchJob(job.id, { name: name.trim(), schedule, config });
                toast.success("Tâche enregistrée", name.trim());
            } else {
                const client = lockedClient ?? clients.find((c) => c.clientId === clientId) ?? null;
                await createJob({
                    playbook: playbook.id,
                    name: name.trim(),
                    clientId: client?.clientId ?? null,
                    folderId: client?.folderId ?? null,
                    schedule,
                    enabled,
                    config,
                });
                toast.success("Tâche créée", schedule ? describeCron(schedule) : "Lancement manuel");
            }
            onDone();
        } catch (e) {
            toast.error("Enregistrement impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form
            className="space-y-5"
            onSubmit={(e) => {
                e.preventDefault();
                void submit();
            }}
        >
            <p className="rounded-panel border border-line bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-3">{playbook.description}</p>

            <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required error={errors.__name} />

            {lockedClient ? (
                <Field label="Périmètre">
                    <p className="flex h-10 items-center rounded-control border border-line bg-surface-2 px-3.5 text-sm font-semibold text-ink-2">{lockedClient.name}</p>
                </Field>
            ) : job ? (
                <Field label="Périmètre">
                    <p className="flex h-10 items-center rounded-control border border-line bg-surface-2 px-3.5 text-sm font-semibold text-ink-2">{job.clientName ?? "Vue agence"}</p>
                </Field>
            ) : playbook.scope !== "agency" ? (
                <Field label="Périmètre" error={errors.__client} required={playbook.scope === "client"}>
                    <SelectField value={clientId} onChange={setClientId} ariaLabel="Périmètre">
                        {playbook.scope === "any" ? <option value="">Vue agence (tous les clients)</option> : <option value="">Choisir un client…</option>}
                        {clients.map((c) => (
                            <option key={c.clientId} value={c.clientId}>
                                {c.name}
                            </option>
                        ))}
                    </SelectField>
                </Field>
            ) : null}

            <ScheduleBuilder
                value={schedule}
                allowNone
                timezone={job?.timezone}
                onChange={(cron, valid) => {
                    setSchedule(cron);
                    setScheduleValid(valid);
                }}
            />
            {errors.__schedule && <p className="-mt-3 text-xs font-medium text-danger-ink">{errors.__schedule}</p>}

            {fields.length > 0 && (
                <section className="space-y-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Réglages du playbook</h3>
                    <ConfigForm fields={fields} draft={draft} errors={errors} onChange={setDraft} />
                </section>
            )}

            <section className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Comportement</h3>
                <div className="space-y-3 rounded-panel border border-line bg-surface p-3.5">
                    <Switch
                        checked={dryRun}
                        onChange={setDryRun}
                        label="Mode essai"
                        description="L’agent analyse et propose, mais aucune écriture n’est exécutée, même approuvée."
                    />
                    {!job && <Switch checked={enabled} onChange={setEnabled} label="Activer dès maintenant" description="Désactivée, la tâche reste prête mais ne tourne pas." />}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-ink">Notification</p>
                            <p className="mt-0.5 text-xs text-ink-3">Quand un constat ou une proposition arrive.</p>
                        </div>
                        <SelectField value={notify} onChange={setNotify} ariaLabel="Notification" className="w-48">
                            {notifyOptions.map((o) => (
                                <option key={o} value={o}>
                                    {optionLabel(o)}
                                </option>
                            ))}
                        </SelectField>
                    </div>
                </div>
            </section>

            <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-end gap-2 border-t border-line-subtle bg-surface px-6 py-4">
                <button type="button" className={SECONDARY_BUTTON} onClick={onDone} disabled={saving}>
                    Annuler
                </button>
                <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
                    {saving && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
                    {job ? "Enregistrer" : "Créer la tâche"}
                </button>
            </div>
        </form>
    );
}
