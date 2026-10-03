"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    ArrowLeft,
    Edit2,
    Repeat,
    AlertTriangle,
    Loader2,
    CalendarDays,
} from "lucide-react";
import { Button, Card, PageHeader, Badge } from "@/components/ui";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface EngagementDetail {
    id: string;
    clientId: string;
    client: { id: string; name: string; email: string | null };
    offreTarifId: string;
    offreTarif: {
        id: string;
        nom: string;
        fixeMensuel: number;
        prixParRdv: number;
        description: string | null;
    };
    fixeOverride: number | null;
    rdvOverride: number | null;
    dureeMois: number;
    debut: string;
    fin: string;
    statut: string;
    penaliteResiliation: string | null;
    renouvellement: string | null;
    createdAt: string;
    updatedAt: string;
}

interface RdvCountResult {
    total: number;
    byMission: { missionId: string; missionName: string; rdvCount: number }[];
}

const STATUT_LABEL: Record<string, string> = {
    BROUILLON: "Brouillon",
    ACTIF: "Actif",
    EXPIRE: "Expiré",
    RENOUVELE: "Renouvelé",
    RESILIE: "Résilié",
    ARCHIVE: "Archivé",
};

export default function EngagementDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { success, error: showError } = useToast();
    const [engagement, setEngagement] = useState<EngagementDetail | null>(null);
    const [rdvCount, setRdvCount] = useState<RdvCountResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [actioning, setActioning] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                const res = await fetch(`/api/billing/engagements/${id}`);
                const json = await res.json();
                if (json.success) {
                    setEngagement(json.data);
                    const now = new Date();
                    const r = await fetch(
                        `/api/billing/rdv-count?clientId=${encodeURIComponent(json.data.clientId)}&periodYear=${now.getFullYear()}&periodMonth=${now.getMonth() + 1}`
                    );
                    const rJson = await r.json();
                    if (rJson.success) setRdvCount(rJson.data);
                } else {
                    showError("Erreur", json.error);
                }
            } catch {
                showError("Erreur", "Impossible de charger l'engagement");
            } finally {
                setIsLoading(false);
            }
        })();
    }, [id, showError]);

    const handleActiver = async () => {
        if (!engagement) return;
        setActioning("activer");
        try {
            const res = await fetch(`/api/billing/engagements/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statut: "ACTIF" }),
            });
            const json = await res.json();
            if (json.success) {
                success("Engagement activé", "La facturation mensuelle pourra être générée.");
                setEngagement((e) => (e ? { ...e, statut: "ACTIF" } : null));
            } else showError("Erreur", json.error);
        } catch {
            showError("Erreur", "Impossible d'activer");
        } finally {
            setActioning(null);
        }
    };

    const handleResilier = async () => {
        if (!confirm("Résilier cet engagement ? Le statut passera à Résilié.")) return;
        setActioning("resilier");
        try {
            const res = await fetch(`/api/billing/engagements/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statut: "RESILIE" }),
            });
            const json = await res.json();
            if (json.success) {
                success("Engagement résilié", "");
                setEngagement((e) => (e ? { ...e, statut: "RESILIE" } : null));
            } else showError("Erreur", json.error);
        } catch {
            showError("Erreur", "Impossible de résilier");
        } finally {
            setActioning(null);
        }
    };

    if (isLoading || !engagement) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );
    }

    const fixe = engagement.fixeOverride ?? engagement.offreTarif.fixeMensuel;
    const rdv = engagement.rdvOverride ?? engagement.offreTarif.prixParRdv;
    const totalRdv = rdvCount?.total ?? 0;
    const estimatedVariable = totalRdv * rdv;
    const estimatedTotal = fixe + estimatedVariable;

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center gap-2 text-sm text-slate-500">
                <Link href="/manager/billing/engagements" className="text-primary-600 hover:text-primary-700 flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" />
                    Retour aux engagements
                </Link>
            </div>

            <Card className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-lg">
                            {engagement.client.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">{engagement.client.name}</h1>
                            <Badge
                                                variant={engagement.statut === "ACTIF" ? "default" : "outline"}
                                className={
                                    engagement.statut === "EXPIRE" ? "bg-amber-50 text-amber-700" :
                                    engagement.statut === "RESILIE" ? "bg-red-50 text-red-700" :
                                    engagement.statut === "BROUILLON" ? "bg-slate-100 text-slate-600" : ""
                                }
                            >
                                {STATUT_LABEL[engagement.statut] ?? engagement.statut}
                            </Badge>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {engagement.statut === "BROUILLON" && (
                            <Button onClick={handleActiver} disabled={actioning !== null}>
                                {actioning === "activer" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Activer
                            </Button>
                        )}
                        {engagement.statut === "ACTIF" && (
                            <Button variant="secondary" onClick={handleResilier} disabled={actioning !== null} className="text-red-600 border-red-200 hover:bg-red-50">
                                {actioning === "resilier" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                                Résilier
                            </Button>
                        )}
                        {engagement.statut === "EXPIRE" && (
                            <span className="text-sm text-amber-600">Renouvellement manuel à prévoir</span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Offre de base</div>
                        <div className="font-medium text-slate-900">{engagement.offreTarif.nom}</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Durée</div>
                        <div className="font-medium text-slate-900">{engagement.dureeMois} mois</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date de début</div>
                        <div className="font-medium text-slate-900">{format(new Date(engagement.debut), "dd MMMM yyyy", { locale: fr })}</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date de fin</div>
                        <div className="font-medium text-slate-900">{format(new Date(engagement.fin), "dd MMMM yyyy", { locale: fr })}</div>
                    </div>
                </div>
                {engagement.penaliteResiliation && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pénalité de résiliation</div>
                        <div className="text-slate-700">{engagement.penaliteResiliation}</div>
                    </div>
                )}
            </Card>

            <Card className="p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">Tarification effective</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Forfait mensuel</div>
                        <div className="text-2xl font-bold text-slate-900">{fixe} €</div>
                        {(engagement.fixeOverride != null) && (
                            <span className="text-sm text-slate-400 line-through">{engagement.offreTarif.fixeMensuel} € (offre)</span>
                        )}
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Prix par RDV</div>
                        <div className="text-2xl font-bold text-slate-900">{rdv} €</div>
                        {(engagement.rdvOverride != null) && (
                            <span className="text-sm text-slate-400 line-through">{engagement.offreTarif.prixParRdv} € (offre)</span>
                        )}
                    </div>
                </div>
            </Card>

            <Card className="p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">Résumé du mois</h3>
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <span className="text-slate-600">RDVs ce mois</span>
                        <span className="font-bold text-slate-900">{totalRdv}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-3">
                        <span className="text-slate-600">Forfait</span>
                        <span className="font-medium text-slate-900">{fixe} €</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-600">Variable ({totalRdv} × {rdv} €)</span>
                        <span className="font-medium text-slate-900">{estimatedVariable} €</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-slate-200">
                        <span className="font-bold text-slate-900">Total estimé</span>
                        <span className="text-lg font-bold text-primary-600">{estimatedTotal} €</span>
                    </div>
                </div>
                {rdvCount && rdvCount.byMission.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Détail par mission</div>
                        <ul className="space-y-1 text-sm text-slate-700">
                            {rdvCount.byMission.map((m) => (
                                <li key={m.missionId} className="flex justify-between">
                                    <span>{m.missionName}</span>
                                    <span>{m.rdvCount} RDV{m.rdvCount !== 1 ? "s" : ""}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </Card>
        </div>
    );
}
