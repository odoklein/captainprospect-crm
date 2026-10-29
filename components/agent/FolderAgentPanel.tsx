"use client";

/**
 * The folder « Agent » tab: the Captain Agent screen narrowed to one folder.
 * Its open findings and pending proposals, its tasks (with a one-click
 * « Activer le bilan hebdo » when the client has none), its recent runs, and
 * « Déléguer une mission pour ce client ».
 */

import { useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { AiMark } from "@/components/ui/AiMark";
import { SegmentedControl } from "@/components/accueil/AccueilUI";
import { describeCron } from "@/lib/agent/client/schedule";
import { createJob, useAgentJobs, useClientOptions, usePendingProposals, usePlaybooks, type ClientOption } from "@/lib/agent/client/hooks";
import { DelegateComposer } from "./DelegateComposer";
import { Inbox } from "./Inbox";
import { RunDetail } from "./RunDetail";
import { RunsTimeline } from "./RunsTimeline";
import { SettingsTab } from "./SettingsTab";
import { MINI_BUTTON, MINI_PRIMARY } from "./shared";

const WEEKLY_BILAN = "report.weekly_bilan";

type PanelTab = "inbox" | "jobs" | "runs";

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
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-accent-200 bg-accent-50 text-accent-700">
                        <AiMark className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-ink">Captain Agent</h2>
                        <p className="truncate text-[11px] text-ink-3">Veille, rapports et missions {client ? `pour ${client.name}` : "de ce dossier"}</p>
                    </div>
                </div>
                <button type="button" className={MINI_PRIMARY} onClick={() => setComposing(true)}>
                    <AiMark className="size-3.5" aria-hidden />
                    {client ? "Déléguer une mission pour ce client" : "Déléguer une mission"}
                </button>
            </div>

            {offerBilan && bilanPlaybook && (
                <div className="flex flex-wrap items-center gap-3 rounded-panel border border-accent-200 bg-accent-50/60 px-3.5 py-3 motion-safe:animate-ds-enter">
                    <CalendarCheck className="size-4 shrink-0 text-accent-700" aria-hidden />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">Bilan hebdomadaire</p>
                        <p className="text-xs text-ink-3">
                            {bilanPlaybook.description}
                            {bilanPlaybook.defaultSchedule && ` ${describeCron(bilanPlaybook.defaultSchedule)}.`}
                        </p>
                    </div>
                    <button type="button" className={MINI_BUTTON} onClick={() => void activateBilan()} disabled={activating}>
                        {activating && <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />}
                        Activer le bilan hebdo
                    </button>
                </div>
            )}

            <SegmentedControl<PanelTab>
                ariaLabel="Sections de l’agent"
                value={tab}
                onChange={setTab}
                options={[
                    { value: "inbox", label: proposals.length > 0 ? `À traiter · ${proposals.length}` : "À traiter" },
                    { value: "jobs", label: jobs.length > 0 ? `Tâches · ${jobs.length}` : "Tâches" },
                    { value: "runs", label: "Activité" },
                ]}
            />

            <div key={tab} className="motion-safe:animate-ds-enter">
                {tab === "inbox" && <Inbox folderId={folderId} onOpenRun={setRunId} compact />}
                {tab === "jobs" && (
                    <SettingsTab compact onOpenRun={setRunId} scope={{ folderId, clientId, clientName: client?.name ?? "ce dossier" }} />
                )}
                {tab === "runs" && <RunsTimeline folderId={folderId} onOpenRun={setRunId} compact limit={8} />}
            </div>

            <RunDetail runId={runId} onClose={() => setRunId(null)} />
            <DelegateComposer open={composing} onClose={() => setComposing(false)} client={client} onLaunched={setRunId} />
        </div>
    );
}
