"use client";

/**
 * Create or edit a scheduled agent task, in a Dialog. Creating starts from
 * the playbook catalog (AGENT_API.playbooks); the form then asks for a name,
 * a scope, a schedule (ScheduleBuilder), the playbook's own settings
 * (ConfigForm, from its JSON Schema), the dry-run switch and how to notify.
 */

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Loader2, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Switch } from "@/components/ui/shadcn/switch";
import type { AgentJobItem, AgentPlaybookItem } from "@/lib/assistant/api-contract";
import { buildConfigFields, initialDraft, optionLabel, readDraft, schemaEnum, type ConfigDraft } from "@/lib/agent/client/config-form";
import { describeCron } from "@/lib/agent/client/schedule";
import { createJob, patchJob, useClientOptions, usePlaybooks } from "@/lib/agent/client/hooks";
import { ConfigForm } from "./ConfigForm";
import { ScheduleBuilder } from "./ScheduleBuilder";
import { EmptyState, FormField, KIND_ICON, KindTag, SectionTitle, StaticField, stagger } from "./shared";

export interface JobFormTarget {
    /** Edit this job; omit to create. */
    job?: AgentJobItem | null;
    /** Create: preselect this playbook (skips the catalog). */
    playbook?: string | null;
    /** Create: lock the scope to this client. */
    client?: { clientId: string; folderId: string | null; name: string } | null;
}

const AGENCY = "__agency";
const FORM_ID = "agent-job-form";

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
    const canGoBack = !editing && picked && !target?.playbook;

    let body: ReactNode = null;
    if (target !== null) {
        if (isLoading && playbooks.length === 0) {
            body = (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-panel" style={stagger(i)} />
                    ))}
                </div>
            );
        } else if (error && playbooks.length === 0) {
            body = <EmptyState compact icon={PackageOpen} title="Catalogue indisponible" hint={error instanceof Error ? error.message : undefined} />;
        } else if (playbook) {
            body = <JobFormBody key={`${editing?.id ?? "new"}-${playbook.id}`} playbook={playbook} job={editing} lockedClient={lockedClient} onDone={close} />;
        } else if (editing) {
            body = <EmptyState compact icon={PackageOpen} title="Playbook introuvable" hint={`« ${editing.playbook} » n’existe plus dans cette version.`} />;
        } else if (catalog.length === 0) {
            body = <EmptyState compact icon={PackageOpen} title="Aucun playbook disponible" />;
        } else {
            body = (
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
                                        "transition-[border-color,box-shadow,transform] duration-150 ease-snappy hover:border-line-strong hover:shadow-card active:scale-[0.995]",
                                        FOCUS_RING,
                                    )}
                                >
                                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-accent-200 bg-accent-soft text-accent-soft-ink">
                                        <Icon className="size-4" aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-ink">{p.label}</span>
                                            <KindTag kind={p.kind} />
                                        </span>
                                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{p.description}</span>
                                        {p.defaultSchedule && <span className="mt-1.5 block text-2xs font-medium text-ink-4">Par défaut : {describeCron(p.defaultSchedule)}</span>}
                                    </span>
                                    <ChevronRight className="mt-2 size-4 shrink-0 text-ink-4 transition-transform duration-150 ease-snappy group-hover:translate-x-0.5" aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            );
        }
    }

    return (
        <Dialog open={target !== null} onOpenChange={(o) => !o && close()}>
            <DialogContent className="flex max-h-[min(860px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                <DialogHeader className="border-b border-line-subtle px-6 pt-5 pb-4">
                    <div className="flex items-center gap-2">
                        {canGoBack && (
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPicked(null)} aria-label="Revenir au catalogue" className="-ml-2">
                                <ArrowLeft aria-hidden />
                            </Button>
                        )}
                        <DialogTitle>{editing ? "Modifier la tâche" : playbook ? playbook.label : "Nouvelle tâche"}</DialogTitle>
                    </div>
                    <DialogDescription>{editing ? editing.playbookLabel : playbook ? "Réglages de la tâche" : "Choisis ce que l’agent doit faire"}</DialogDescription>
                </DialogHeader>
                {playbook && target !== null ? (
                    body
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
                )}
            </DialogContent>
        </Dialog>
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
        <>
            <form
                id={FORM_ID}
                className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5"
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <p className="rounded-panel border border-line bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-3">{playbook.description}</p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Nom" htmlFor="agent-job-name" error={errors.__name} required>
                        <Input id="agent-job-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-invalid={Boolean(errors.__name) || undefined} />
                    </FormField>

                    {lockedClient ? (
                        <FormField label="Périmètre">
                            <StaticField>{lockedClient.name}</StaticField>
                        </FormField>
                    ) : job ? (
                        <FormField label="Périmètre">
                            <StaticField>{job.clientName ?? "Vue agence"}</StaticField>
                        </FormField>
                    ) : playbook.scope !== "agency" ? (
                        <FormField label="Périmètre" htmlFor="agent-job-scope" error={errors.__client} required={playbook.scope === "client"}>
                            <Select value={clientId === "" && playbook.scope === "any" ? AGENCY : clientId} onValueChange={(v) => setClientId(v === AGENCY ? "" : v)}>
                                <SelectTrigger id="agent-job-scope" className="w-full" aria-invalid={Boolean(errors.__client) || undefined}>
                                    <SelectValue placeholder="Choisir un client…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {playbook.scope === "any" && (
                                        <>
                                            <SelectItem value={AGENCY}>Vue agence (tous les clients)</SelectItem>
                                            <SelectSeparator />
                                        </>
                                    )}
                                    {clients.map((c) => (
                                        <SelectItem key={c.clientId} value={c.clientId}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormField>
                    ) : null}
                </div>

                <div className="space-y-1.5">
                    <ScheduleBuilder
                        value={schedule}
                        allowNone
                        timezone={job?.timezone}
                        onChange={(cron, valid) => {
                            setSchedule(cron);
                            setScheduleValid(valid);
                        }}
                    />
                    {errors.__schedule && (
                        <p className="text-2xs font-medium text-danger-ink" role="alert">
                            {errors.__schedule}
                        </p>
                    )}
                </div>

                {fields.length > 0 && (
                    <section className="space-y-3">
                        <SectionTitle>Réglages du playbook</SectionTitle>
                        <ConfigForm fields={fields} draft={draft} errors={errors} onChange={setDraft} />
                    </section>
                )}

                <section className="space-y-3">
                    <SectionTitle>Comportement</SectionTitle>
                    <div className="divide-y divide-line-subtle rounded-panel border border-line bg-surface">
                        <SwitchRow
                            id="agent-job-dry"
                            label="Mode essai"
                            description="L’agent analyse et propose, mais aucune écriture n’est exécutée, même approuvée."
                            checked={dryRun}
                            onChange={setDryRun}
                        />
                        {!job && (
                            <SwitchRow
                                id="agent-job-enabled"
                                label="Activer dès maintenant"
                                description="Désactivée, la tâche reste prête mais ne tourne pas."
                                checked={enabled}
                                onChange={setEnabled}
                            />
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
                            <div>
                                <Label htmlFor="agent-job-notify" className="text-sm font-medium text-ink">
                                    Notification
                                </Label>
                                <p className="mt-1 text-2xs text-ink-3">Quand un constat ou une proposition arrive.</p>
                            </div>
                            <Select value={notify} onValueChange={setNotify}>
                                <SelectTrigger id="agent-job-notify" size="sm" className="w-48">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align="end">
                                    {notifyOptions.map((o) => (
                                        <SelectItem key={o} value={o}>
                                            {optionLabel(o)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </section>
            </form>
            <DialogFooter className="border-t border-line-subtle bg-surface-2/50 px-6 py-3.5">
                <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
                    Annuler
                </Button>
                <Button type="submit" form={FORM_ID} disabled={saving}>
                    {saving && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
                    {job ? "Enregistrer" : "Créer la tâche"}
                </Button>
            </DialogFooter>
        </>
    );
}

function SwitchRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-start justify-between gap-4 px-3.5 py-3">
            <div className="min-w-0">
                <Label htmlFor={id} className="text-sm font-medium text-ink">
                    {label}
                </Label>
                <p className="mt-1 text-2xs leading-relaxed text-ink-3">{description}</p>
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
        </div>
    );
}
