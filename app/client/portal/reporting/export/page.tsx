"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { ReportLayout } from "@/components/reporting/ReportLayout";
import type { ReportData } from "@/lib/reporting/types";
import { Loader2 } from "lucide-react";

/**
 * Print-friendly report view.
 * URL: /client/portal/reporting/export?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&missionId=optional&comparePrevious=true|false
 * Use browser Print → Save as PDF for a client-side PDF that matches the preview.
 */
function ExportContent() {
    const searchParams = useSearchParams();
    const [data, setData] = useState<ReportData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";
    const missionId = searchParams.get("missionId") ?? "";
    const comparePrevious = searchParams.get("comparePrevious") !== "false";

    useEffect(() => {
        if (!dateFrom || !dateTo) {
            setError("Paramètres dateFrom et dateTo requis.");
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const params = new URLSearchParams({
                    dateFrom,
                    dateTo,
                    comparePrevious: String(comparePrevious),
                });
                if (missionId) params.set("missionId", missionId);
                const res = await fetch(`/api/client/reporting/data?${params.toString()}`);
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setError(json?.error || "Erreur de chargement");
                    return;
                }
                if (json.success && json.data) setData(json.data);
                else setError("Données invalides");
            } catch {
                if (!cancelled) setError("Impossible de charger le rapport.");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dateFrom, dateTo, missionId, comparePrevious]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-3 p-8">
                <p className="text-sm text-ink-3">{error}</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-surface-3 p-8">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                <p className="text-[13px] text-ink-3 mt-4">Chargement du rapport…</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white print:bg-white">
            <ReportLayout data={data} printMode className="max-w-none border-0 shadow-none rounded-none" />
        </div>
    );
}

export default function ClientPortalReportingExportPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex flex-col items-center justify-center bg-surface-3 p-8">
                    <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                    <p className="text-[13px] text-ink-3 mt-4">Chargement…</p>
                </div>
            }
        >
            <ExportContent />
        </Suspense>
    );
}
