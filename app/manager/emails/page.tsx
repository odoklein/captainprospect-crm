"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui";
import { EmailHubPage } from "@/components/email/EmailHubPage";
import { useOverview } from "@/components/email/dashboard/useOverview";
import {
    ActivitySection,
    KpiStrip,
    MailboxHealthSection,
    SequencesSection,
    SetupChecklist,
    TemplatesSection,
    TriageSection,
} from "@/components/email/dashboard/OverviewSections";

// ============================================
// EMAIL HUB — VUE D'ENSEMBLE (/manager/emails)
// 1. What needs me today (unread replies, bounces, broken mailboxes/sequences)
// 2. Health: send performance, mailboxes, sequences, templates
// 3. Recent activity
// One request (/api/email/dashboard/overview), one state per block.
// ============================================

export default function EmailOverviewPage() {
    const [period, setPeriod] = useState<"7" | "30" | "90">("30");
    const { states, refreshedAt, reloadAll, retry } = useOverview(period);
    const loading = Object.values(states).some((s) => s.status === "loading");
    const setup = states.setup.status === "ready" ? states.setup.data : undefined;

    return (
        <EmailHubPage
            title="Vue d'ensemble"
            description="Ce qui demande votre attention aujourd'hui, l'état des boîtes mail et l'activité récente."
            actions={
                <>
                    {refreshedAt && (
                        <span className="text-xs tabular-nums text-ink-4">
                            Mis à jour à {refreshedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    )}
                    <Button variant="secondary" size="sm" onClick={reloadAll} isLoading={loading} leftIcon={<RotateCw className="size-3.5" />}>
                        Actualiser
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                {setup && setup.mailboxes === 0 && <SetupChecklist setup={setup} />}

                <TriageSection state={states.triage} onRetry={() => retry("triage")} />

                <KpiStrip state={states.kpis} period={period} onPeriod={setPeriod} onRetry={() => retry("kpis")} />

                <div className="grid gap-6 xl:grid-cols-2">
                    <MailboxHealthSection state={states.mailboxes} onRetry={() => retry("mailboxes")} />
                    <SequencesSection state={states.sequences} onRetry={() => retry("sequences")} />
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
                    <TemplatesSection state={states.templates} onRetry={() => retry("templates")} />
                    <ActivitySection state={states.activity} onRetry={() => retry("activity")} />
                </div>
            </div>
        </EmailHubPage>
    );
}
