"use client";

import { Card, Badge } from "@/components/ui";
import { CheckCircle, Clock, AlertCircle, XCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProspectPipelineStep, ProspectStatus } from "@prisma/client";

// ============================================
// PIPELINE STAGES
// ============================================

const PIPELINE_STAGES = [
    { id: "INTAKE", label: "Réception", description: "Lead reçu et stocké" },
    { id: "NORMALIZE", label: "Normalisation", description: "Données standardisées" },
    { id: "VALIDATE", label: "Validation", description: "Règles appliquées" },
    { id: "ENRICH", label: "Enrichissement", description: "Données enrichies (optionnel)" },
    { id: "DEDUPLICATE", label: "Déduplication", description: "Vérification doublons" },
    { id: "SCORE", label: "Scoring", description: "Scores calculés" },
    { id: "ROUTE", label: "Routage", description: "Mission/SDR assigné" },
    { id: "ACTIVATE", label: "Activation", description: "Contact créé" },
];

// ============================================
// PIPELINE VIEWER PROPS
// ============================================

interface PipelineViewerProps {
    currentStep: ProspectPipelineStep;
    status: ProspectStatus;
    decisionLogs?: Array<{
        step: ProspectPipelineStep;
        outcome: string;
        reason: string;
        executedAt: string;
    }>;
    className?: string;
}

// ============================================
// PIPELINE VIEWER
// ============================================

export function PipelineViewer({
    currentStep,
    status,
    decisionLogs = [],
    className,
}: PipelineViewerProps) {
    const currentStepIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStep);

    const getStageStatus = (stageIndex: number) => {
        if (status === "REJECTED" || status === "DUPLICATE") {
            return stageIndex < currentStepIndex ? "completed" : "skipped";
        }
        if (status === "ACTIVATED") {
            return "completed";
        }
        if (stageIndex < currentStepIndex) {
            return "completed";
        }
        if (stageIndex === currentStepIndex) {
            return "current";
        }
        return "pending";
    };

    const getStageIcon = (status: "completed" | "current" | "pending" | "skipped") => {
        switch (status) {
            case "completed":
                return <CheckCircle className="w-5 h-5 text-emerald-600" />;
            case "current":
                return <Clock className="w-5 h-5 text-primary-600" />;
            case "skipped":
                return <XCircle className="w-5 h-5 text-slate-400" />;
            default:
                return <div className="w-5 h-5 rounded-full border-2 border-slate-300" />;
        }
    };

    const getDecisionLogForStep = (step: ProspectPipelineStep) => {
        return decisionLogs.find((log) => log.step === step);
    };

    return (
        <Card className={cn("p-6", className)}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Pipeline de traitement</h3>
                <Badge className="bg-primary-100 text-primary-700 text-xs">
                    Étape actuelle: {PIPELINE_STAGES.find((s) => s.id === currentStep)?.label || currentStep}
                </Badge>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-700 leading-relaxed">
                    <strong>Comment ça fonctionne:</strong> Le prospect passe automatiquement par ces étapes. 
                    L'<strong>activation</strong> (dernière étape) crée le Contact et la Company dans le CRM, 
                    les ajoute à la mission sélectionnée, et les rend visibles pour les SDRs. 
                    Vous pouvez activer manuellement un prospect "En attente" ou "Approuvé" en cliquant sur le bouton "Activer".
                </p>
            </div>
            <div className="space-y-4">
                {PIPELINE_STAGES.map((stage, index) => {
                    const stageStatus = getStageStatus(index);
                    const decisionLog = getDecisionLogForStep(stage.id as ProspectPipelineStep);

                    return (
                        <div key={stage.id} className="flex items-start gap-4">
                            {/* Stage Icon */}
                            <div className="flex-shrink-0 mt-1">
                                {getStageIcon(stageStatus)}
                            </div>

                            {/* Stage Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h4
                                        className={cn(
                                            "font-medium",
                                            stageStatus === "current" && "text-primary-600",
                                            stageStatus === "completed" && "text-emerald-600",
                                            stageStatus === "pending" && "text-slate-400",
                                            stageStatus === "skipped" && "text-slate-400"
                                        )}
                                    >
                                        {stage.label}
                                    </h4>
                                    {stageStatus === "current" && (
                                        <Badge className="bg-primary-100 text-primary-700">En cours</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-slate-600">{stage.description}</p>
                                {decisionLog && (
                                    <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded p-2">
                                        <div className="font-medium">{decisionLog.outcome}</div>
                                        <div>{decisionLog.reason}</div>
                                    </div>
                                )}
                            </div>

                            {/* Arrow */}
                            {index < PIPELINE_STAGES.length - 1 && (
                                <div className="absolute left-6 top-12 w-0.5 h-12 bg-slate-200" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Status Summary */}
            <div className="mt-6 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-600">Statut actuel</p>
                        <p className="font-medium text-slate-900">
                            {status === "ACTIVATED" && "Activé - Contact créé"}
                            {status === "IN_REVIEW" && "En révision - Action requise"}
                            {status === "REJECTED" && "Rejeté"}
                            {status === "DUPLICATE" && "Doublon"}
                            {status === "PENDING" && "En traitement"}
                            {status === "APPROVED" && "Approuvé - Prêt pour activation"}
                        </p>
                    </div>
                    <Badge
                        className={
                            status === "ACTIVATED"
                                ? "bg-emerald-100 text-emerald-700"
                                : status === "IN_REVIEW"
                                ? "bg-amber-100 text-amber-700"
                                : status === "REJECTED" || status === "DUPLICATE"
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-100 text-slate-700"
                        }
                    >
                        {status}
                    </Badge>
                </div>
            </div>
        </Card>
    );
}

export default PipelineViewer;
