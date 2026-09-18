"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    Clock,
    Map as MapIcon,
    Sparkles,
} from "lucide-react";
import { Badge, Card, EmptyState, LoadingState, PageHeader } from "@/components/ui";
import { ROADMAP_BUCKET_LABELS, type RoadmapBucket } from "@/lib/tickets/constants";
import type { RoadmapItem } from "@/lib/tickets/public";
import { cn } from "@/lib/utils";

type RoadmapEntry = Omit<RoadmapItem, "completedAt" | "updatedAt"> & {
    completedAt: string | null;
    updatedAt: string;
};

const BUCKET_ORDER: RoadmapBucket[] = ["UPCOMING", "IN_PROGRESS", "DONE"];

const BUCKET_STYLES: Record<
    RoadmapBucket,
    { icon: typeof Clock; dot: string; accent: string; column: string }
> = {
    UPCOMING: {
        icon: CalendarClock,
        dot: "bg-slate-400",
        accent: "border-l-slate-300",
        column: "bg-slate-50/80 border-slate-200",
    },
    IN_PROGRESS: {
        icon: Clock,
        dot: "bg-indigo-500",
        accent: "border-l-indigo-400",
        column: "bg-indigo-50/60 border-indigo-200",
    },
    DONE: {
        icon: CheckCircle2,
        dot: "bg-emerald-500",
        accent: "border-l-emerald-400",
        column: "bg-emerald-50/50 border-emerald-200",
    },
};

function formatDate(value: string): string {
    return format(new Date(value), "d MMMM yyyy", { locale: fr });
}

function RoadmapCard({ item, bucket }: { item: RoadmapEntry; bucket: RoadmapBucket }) {
    const styles = BUCKET_STYLES[bucket];

    return (
        <Card
            className={cn(
                "p-4 rounded-xl border-l-4 shadow-sm hover:shadow-md",
                styles.accent
            )}
        >
            <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                {item.title}
            </h3>
            {item.description && (
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                    {item.description}
                </p>
            )}
            {bucket === "DONE" && item.completedAt && (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Livré le {formatDate(item.completedAt)}
                </p>
            )}
        </Card>
    );
}

export default function ClientPortalRoadmapPage() {
    const [items, setItems] = useState<RoadmapEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadRoadmap = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/client/roadmap");
            const json = await res.json();
            if (json.success) setItems(json.data as RoadmapEntry[]);
            else setError(json.error ?? "Impossible de charger la roadmap.");
        } catch {
            setError("Impossible de charger la roadmap.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRoadmap();
    }, [loadRoadmap]);

    const byBucket = useMemo(() => {
        const map: Record<RoadmapBucket, RoadmapEntry[]> = {
            UPCOMING: [],
            IN_PROGRESS: [],
            DONE: [],
        };
        for (const item of items) map[item.bucket]?.push(item);
        return map;
    }, [items]);

    return (
        <div className="min-h-full bg-gradient-to-br from-[#F8F9FC] via-[#F4F6F9] to-[#ECEEF4] p-4 md:p-6 space-y-6">
            <PageHeader
                title="Roadmap"
                subtitle="Les évolutions de votre espace, à venir, en cours et livrées"
                onRefresh={loadRoadmap}
                isRefreshing={isLoading}
            />

            {isLoading ? (
                <LoadingState message="Chargement de la roadmap..." />
            ) : error ? (
                <EmptyState
                    icon={AlertCircle}
                    title="Une erreur est survenue"
                    description={error}
                />
            ) : items.length === 0 ? (
                <EmptyState
                    icon={MapIcon}
                    title="Aucune évolution publiée"
                    description="Les développements prévus pour votre espace apparaîtront ici dès qu'ils seront publiés."
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {BUCKET_ORDER.map((bucket) => {
                        const bucketItems = byBucket[bucket];
                        const styles = BUCKET_STYLES[bucket];
                        const Icon = styles.icon;
                        return (
                            <section
                                key={bucket}
                                className={cn(
                                    "rounded-2xl border p-4 space-y-3",
                                    styles.column
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("w-2 h-2 rounded-full", styles.dot)} />
                                        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                                            {ROADMAP_BUCKET_LABELS[bucket]}
                                        </h2>
                                    </div>
                                    <Badge variant={bucket === "DONE" ? "success" : bucket === "IN_PROGRESS" ? "primary" : "default"}>
                                        <Icon className="w-3 h-3" />
                                        {bucketItems.length}
                                    </Badge>
                                </div>

                                {bucketItems.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-6 text-center">
                                        Aucun élément dans cette colonne.
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {bucketItems.map((item) => (
                                            <RoadmapCard key={item.id} item={item} bucket={bucket} />
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            {!isLoading && !error && items.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    Cette roadmap est mise à jour par votre équipe Captain Prospect.
                </p>
            )}
        </div>
    );
}
