"use client";

/**
 * The folder « Agent » panel: the Captain Agent screen narrowed to one
 * folder. Compact tabs — its open findings and pending proposals, its tasks,
 * its recent runs — and quick actions: « Déléguer une mission », a one-click
 * « Activer le bilan hebdo » when the client has none, and a link to the
 * full agent screen.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Loader2 } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/shadcn/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { describeCron } from "@/lib/agent/client/schedule";
import { createJob, useAgentJobs, useClientOptions, usePendingProposals, usePlaybooks, type ClientOption } from "@/lib/agent/client/hooks";
import { DelegateComposer } from "./DelegateComposer";
import { Inbox } from "./Inbox";
import { RunDetail } from "./RunDetail";
import { RunsTimeline } from "./RunsTimeline";
import { SettingsTab } from "./SettingsTab";
import { CountChip } from "./shared";

const WEEKLY_BILAN = "report.weekly_bilan";

type PanelTab = "inbox" | "jobs" | "runs";

const PANEL_CONTENT = "outline-none motion-safe:data-[state=active]:animate-in motion-safe:data-[state=active]:fade-in-0 motion-safe:duration-200 ease-snappy";

export function FolderAgentPanel(props: { folderId: string; clientId: string | null }) {
    const { folderId, clientId } = props;
    const toast = useToast();
    const [tab, setTab] = useState<PanelTab>("inbox");
    const [runId, setRunId] = useState<string | null>(null);
    const [composing, setComposing] = useState(false);
    const [activating, setActivating] = useState(false);

    const { clients } = useClientOptions(Boolean(clientId));
    const { playbooks } = usePlaybooks();
    const { jobs, isLoading: jobsLoading } = useAgentJobs({ folderId, clientId });
    const { proposals } = usePendingProposals(folderId);

    const known = clientId ? clients.find((c) => c.clientId === clientId) : undefined;
    const client: ClientOption | null = clientId ? { clientId, folderId, name: known?.name ?? "ce client" } : null;
    const bilanPlaybook = playbooks.find((p) => p.id === WEEKLY_BILAN) ?? null;
    const hasBilan = jobs.some((j) => j.playbook === WEEKLY_BILAN);
    const offerBilan = Boolean(clientId && bilanPlaybook && !hasBilan && !jobsLoading);

    const activateBilan = async () => {
        if (!bilanPlaybook || !clientId) return;
        setActivating(true);
        try {
            await createJob({
                playbook: WEEKLY_BILAN,
                clientId,
                folderId,
                name: `${bilanPlaybook.label} · ${client?.name ?? ""}`.trim(),
                schedule: bilanPlaybook.defaultSchedule,
                enabled: true,
            });
            toast.success("Bilan hebdo activé", bilanPlaybook.defaultSchedule ? describeCron(bilanPlaybook.defaultSchedule) : undefined);
        } catch (e) {
            toast.error("Activation impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setActivating(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg shadow-2xs">
                        <AiMark className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-ink">Captain Agent</h2>
                        <p className="truncate text-2xs text-ink-3">Veille, rapports et missions {client ? `pour ${client.name}` : "de ce dossier"}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button asChild variant="ghost" size="icon-sm">
                                <Link href="/manager/assistant/agent" aria-label="Ouvrir Captain Agent">
                                    <ArrowUpRight aria-hidden />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Ouvrir Captain Agent</TooltipContent>
                    </Tooltip>
                    <Button type="button" variant="ai" size="sm" onClick={() => setComposing(true)}>
                        <AiMark aria-hidden />
                        {client ? "Déléguer pour ce client" : "Déléguer une mission"}
                    </Button>
                </div>
            </div>

            {offerBilan && bilanPlaybook && (
                <div className="flex flex-wrap items-center gap-3 rounded-panel border border-accent-200 bg-accent-soft/60 px-3.5 py-3 motion-safe:animate-ds-enter">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-accent-200 bg-surface text-accent-soft-ink">
                        <CalendarCheck className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">Bilan hebdomadaire</p>
                        <p className="text-xs text-ink-3">
                            {bilanPlaybook.description}
                            {bilanPlaybook.defaultSchedule && ` ${describeCron(bilanPlaybook.defaultSchedule)}.`}
                        </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void activateBilan()} disabled={activating}>
                        {activating && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
                        Activer le bilan hebdo
                    </Button>
                </div>
            )}

            <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)} className="gap-4">
                <TabsList aria-label="Sections de l’agent">
                    <TabsTrigger value="inbox">
                        À traiter
                        {proposals.length > 0 && <CountChip count={proposals.length} tone="primary" />}
                    </TabsTrigger>
                    <TabsTrigger value="jobs">
                        Tâches
                        {jobs.length > 0 && <CountChip count={jobs.length} />}
                    </TabsTrigger>
                    <TabsTrigger value="runs">Activité</TabsTrigger>
                </TabsList>
                <TabsContent value="inbox" className={PANEL_CONTENT}>
                    <Inbox folderId={folderId} onOpenRun={setRunId} compact />
                </TabsContent>
                <TabsContent value="jobs" className={PANEL_CONTENT}>
                    <SettingsTab compact onOpenRun={setRunId} scope={{ folderId, clientId, clientName: client?.name ?? "ce dossier" }} />
                </TabsContent>
                <TabsContent value="runs" className={PANEL_CONTENT}>
                    <RunsTimeline folderId={folderId} onOpenRun={setRunId} activeRunId={runId} compact limit={8} />
                </TabsContent>
            </Tabs>

            <RunDetail runId={runId} onClose={() => setRunId(null)} />
            <DelegateComposer open={composing} onClose={() => setComposing(false)} client={client} onLaunched={setRunId} />
        </div>
    );
}
