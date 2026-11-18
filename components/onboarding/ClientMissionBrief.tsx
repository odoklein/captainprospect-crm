import { missionBriefSchema } from "@/lib/onboarding/self-service-schema";

export function ClientMissionBrief({ playbook }: { playbook?: unknown }) {
    const raw = playbook && typeof playbook === "object" && "clientBrief" in playbook ? playbook.clientBrief : null;
    const parsed = missionBriefSchema.safeParse(raw);
    if (!parsed.success) return null;
    const brief = parsed.data;
    return <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="client-brief-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-ink" id="client-brief-title">Brief du client</h2><span className="text-xs text-ink-3">Portail client</span></div>
        <p className="mb-5 text-sm leading-6 text-ink-3">Informations transmises par le client pour préparer cette mission.</p>
        <dl className="grid gap-6 sm:grid-cols-2">
            {[["Entreprises et interlocuteurs visés", brief.targetAudience], ["Zone géographique", brief.geography], ["Offre à présenter", brief.offer], ["Différenciation et preuves", brief.differentiators], ["Exclusions", brief.exclusions]].map(([label, value]) => value && <div key={label} className="min-w-0"><dt className="mb-2 text-xs font-semibold text-ink-3">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-7 text-ink-2">{value}</dd></div>)}
        </dl>
    </section>;
}
