// ============================================
// INSTANCE CRON CATALOG — the scheduled jobs an instance needs, so the control
// plane runs ONE scheduler for every agency instead of five per-agency
// schedules to configure by hand.
//
//   GET  /api/instance/cron                  → this catalog (id, schedule, description)
//   POST /api/instance/cron { "job": "<id>" } → runs one job now, in this process
//
// The control plane reads the catalog from each instance (it is versioned with
// the image, so a release that adds a job needs no Console change) and calls
// POST on each schedule. Calls are signed with INSTANCE_ADMIN_SECRET like the
// rest of /api/instance/*; the job handlers are the existing /api/cron/* routes,
// called in-process with this container's CRON_SECRET, which therefore never
// travels over the network.
// ============================================

import { NextRequest } from "next/server";

export type CronJob = {
    id: string;
    /** Five-field cron expression, evaluated in UTC. */
    schedule: string;
    description: string;
    /** Why a missed run matters. */
    missedRun: string;
    run: (request: NextRequest) => Promise<Response>;
};

export const CRON_JOBS: CronJob[] = [
    {
        id: "email-sequences",
        schedule: "*/5 * * * *",
        description: "Envoie les étapes d'emailing dues (séquences) dans la limite quotidienne de chaque boîte.",
        missedRun: "Aucun email de séquence ne part. La page Séquences alerte après 15 minutes.",
        run: async (r) => (await import("@/app/api/cron/email-sequences/route")).GET(r),
    },
    {
        id: "messaging-outbox",
        schedule: "* * * * *",
        description: "Publie dans Slack les notifications en attente (file d'envoi).",
        missedRun: "Les notifications Slack arrivent en retard.",
        run: async (r) => (await import("@/app/api/cron/messaging-outbox/route")).GET(r),
    },
    {
        id: "meeting-reminders",
        schedule: "0 * * * *",
        description: "Rappelle aux clients leurs rendez-vous des prochaines 24 h.",
        missedRun: "Pas de rappel de rendez-vous aux clients.",
        run: async (r) => (await import("@/app/api/cron/meeting-reminders/route")).GET(r),
    },
    {
        id: "exclusion-sweep",
        schedule: "0 4 * * *",
        description: "Libère les prospects dont l'exclusion temporaire est arrivée à échéance.",
        missedRun: "Les exclusions « 3 mois » restent actives au-delà de leur date.",
        run: async (r) => (await import("@/app/api/cron/exclusion-sweep/route")).GET(r),
    },
    {
        id: "agent-tick",
        schedule: "*/5 * * * *",
        description: "Met en file les veilles de l'agent arrivées à échéance ; exécute une veille courte lui-même quand le worker agent est absent (mode lite).",
        missedRun: "Les veilles de l'agent ne démarrent pas ; sans worker dédié, rien ne tourne.",
        run: async (r) => (await import("@/app/api/cron/agent-tick/route")).GET(r),
    },
    {
        id: "billing-month-end",
        schedule: "0 2 1 * *",
        description: "Génère les brouillons de facture du mois écoulé.",
        missedRun: "Les brouillons de facture du mois ne sont pas créés (rattrapables à la main).",
        run: async (r) => (await import("@/app/api/billing/cron/month-end/route")).GET(r),
    },
];

export function findCronJob(id: unknown): CronJob | null {
    return typeof id === "string" ? (CRON_JOBS.find((j) => j.id === id) ?? null) : null;
}

/** The request a job handler receives: its own CRON_SECRET as bearer, as a scheduler would send it. */
export function cronRequestFor(job: CronJob, baseUrl: string, cronSecret: string | undefined): NextRequest {
    const headers: Record<string, string> = { "x-instance-cron": job.id };
    if (cronSecret) headers.authorization = `Bearer ${cronSecret}`;
    return new NextRequest(new URL(`/api/instance/cron/${job.id}`, baseUrl), { method: "GET", headers });
}
