"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { Badge, Card, EmptyState, LoadingState, PageHeader } from "@/components/ui";
import type { RoadmapItem } from "@/lib/tickets/public";

type ChangelogEntry = Omit<RoadmapItem, "completedAt" | "updatedAt"> & {
    completedAt: string | null;
    updatedAt: string;
};

function formatDate(value: string): string {
    return format(new Date(value), "d MMMM yyyy", { locale: fr });
}

function formatMonth(value: string): string {
    return format(new Date(value), "MMMM yyyy", { locale: fr });
}

export default function ClientPortalChangelogPage() {
    const [items, setItems] = useState<ChangelogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadChangelog = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/client/changelog");
            const json = await res.json();
            if (json.success) setItems(json.data as ChangelogEntry[]);
            else setError(json.error ?? "Impossible de charger les nouveautés.");
        } catch {
            setError("Impossible de charger les nouveautés.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadChangelog();
    }, [loadChangelog]);

    const groups = useMemo(() => {
        const map = new Map<string, ChangelogEntry[]>();
        for (const item of items) {
            const key = item.completedAt ? formatMonth(item.completedAt) : "Date inconnue";
            const bucket = map.get(key);
            if (bucket) bucket.push(item);
            else map.set(key, [item]);
        }
        return [...map.entries()];
    }, [items]);

    return (
        <div className="min-h-full bg-gradient-to-br from-[#F8F9FC] via-[#F4F6F9] to-[#ECEEF4] p-4 md:p-6 space-y-6">
            <PageHeader
                title="Nouveautés"
                subtitle="Toutes les améliorations livrées sur votre espace, de la plus récente à la plus ancienne"
                onRefresh={loadChangelog}
                isRefreshing={isLoading}
            />

            {isLoading ? (
                <LoadingState message="Chargement des nouveautés..." />
            ) : error ? (
                <EmptyState
                    icon={AlertCircle}
                    title="Une erreur est survenue"
                    description={error}
                />
            ) : items.length === 0 ? (
                <EmptyState
                    icon={Sparkles}
                    title="Aucune nouveauté pour le moment"
                    description="Les évolutions livrées sur votre espace seront listées ici."
                />
            ) : (
                <div className="space-y-8">
                    {groups.map(([month, entries]) => (
                        <section key={month} className="space-y-3">
                            <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 first-letter:uppercase">
                                {month}
                            </h2>
                            <div className="space-y-3">
                                {entries.map((item) => (
                                    <Card
                                        key={item.id}
                                        className="p-5 rounded-2xl border-l-4 border-l-emerald-400 shadow-sm hover:shadow-md"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                                                        {item.title}
                                                    </h3>
                                                    {item.completedAt && (
                                                        <Badge variant="success">
                                                            {formatDate(item.completedAt)}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {item.description && (
                                                    <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
