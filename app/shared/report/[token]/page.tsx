import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { brand } from "@/lib/brand";

interface Props {
    params: Promise<{ token: string }>;
}

const MONTH_NAMES = [
    "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default async function SharedReportPage({ params }: Props) {
    const { token } = await params;

    const link = await prisma.sharedReportLink.findUnique({
        where: { token },
        include: {
            client: { select: { name: true } },
            mission: { select: { name: true, id: true } },
        },
    });

    if (!link) return notFound();

    if (new Date() > link.expiresAt) {
        return (
            <div className="min-h-screen bg-surface-2 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl border border-line p-10 max-w-md text-center shadow-xl">
                    <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-ink mb-2">Ce lien a expiré</h1>
                    <p className="text-sm text-ink-3">
                        Demandez un nouveau lien à votre contact pour accéder au rapport.
                    </p>
                </div>
            </div>
        );
    }

    const missionIds = link.missionId
        ? [link.missionId]
        : (await prisma.mission.findMany({
            where: { clientId: link.clientId },
            select: { id: true },
        })).map((m) => m.id);

    const actions = await prisma.action.findMany({
        where: {
            campaign: { missionId: { in: missionIds } },
            createdAt: { gte: link.dateFrom, lte: link.dateTo },
        },
        include: {
            contact: {
                include: { company: { select: { name: true } } },
            },
        },
    });

    const totalCalls = actions.length;
    const meetings = actions.filter((a) => a.result === "MEETING_BOOKED");
    const contactsReached = new Set(actions.filter((a) => a.contactId).map((a) => a.contactId)).size;
    const contactRate = totalCalls > 0 ? Math.round((contactsReached / totalCalls) * 100) : 0;

    const fromMonth = link.dateFrom.getMonth() + 1;
    const fromYear = link.dateFrom.getFullYear();
    const toMonth = link.dateTo.getMonth() + 1;
    const toYear = link.dateTo.getFullYear();
    const periodLabel = fromMonth === toMonth && fromYear === toYear
        ? `${MONTH_NAMES[fromMonth]} ${fromYear}`
        : `${MONTH_NAMES[fromMonth]} ${fromYear} — ${MONTH_NAMES[toMonth]} ${toYear}`;

    const statItems = [
        { label: "RDV obtenus", value: meetings.length.toString(), accent: "text-primary-600" },
        { label: "Appels réalisés", value: totalCalls.toString(), accent: "text-blue-600" },
        { label: "Taux de contact", value: `${contactRate}%`, accent: "text-emerald-600" },
    ];

    return (
        <div className="min-h-screen bg-surface-2">
            <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-8">
                {/* Header */}
                <div className="relative overflow-hidden rounded-2xl shadow-sm bg-inverse">
                    <div className="relative p-8 text-center">
                        <p className="text-xs font-bold text-primary-200 uppercase tracking-[0.2em] mb-3">
                            Rapport de prospection
                        </p>
                        <h1 className="text-2xl font-black text-white">{link.client.name}</h1>
                        {link.mission && (
                            <p className="text-sm text-primary-200/80 mt-1.5 font-medium">Mission : {link.mission.name}</p>
                        )}
                        <p className="text-sm text-primary-200/60 mt-1">{periodLabel}</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {statItems.map((item) => (
                        <div key={item.label} className="bg-white rounded-2xl border border-line p-6 shadow-sm hover:shadow-md transition-shadow duration-200 text-center">
                            <p className="text-sm font-medium text-ink-3 mb-2">{item.label}</p>
                            <p className={`text-4xl font-black ${item.accent} tabular-nums`}>
                                {item.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Meeting List */}
                {meetings.length > 0 && (
                    <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-line bg-primary-50">
                            <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
                                Rendez-vous ({meetings.length})
                            </h2>
                        </div>
                        <div className="p-6 space-y-3">
                            {meetings.map((m) => {
                                const contactName = [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(" ") || "Contact";
                                const companyName = m.contact?.company?.name || "—";
                                const date = new Date(m.callbackDate || m.createdAt).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                });
                                return (
                                    <div key={m.id} className="p-4 rounded-xl bg-primary-50 border border-line/50 hover:border-primary-500/15 transition-all duration-200">
                                        <p className="font-bold text-ink">
                                            {contactName}
                                            <span className="font-normal text-ink-3"> &middot; {companyName}</span>
                                        </p>
                                        <p className="text-sm text-ink-4 mt-1">{date}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center text-xs text-ink-4 py-4">
                    Rapport généré via <span className="font-semibold text-ink-3">{brand.name}</span>
                </div>
            </div>
        </div>
    );
}
