"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, PhoneCall, Copy, History, Building2, User, Calendar, MessageSquare, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AlreadyContactedInfo {
    phone: string;
    targetName?: string;
    companyName?: string;
    actionIntent: "CALL" | "COPY";
    lastAction: {
        result: string;
        note?: string | null;
        createdAt: string;
        callbackDate?: string | null;
        scope?: "CONTACT" | "COMPANY" | null;
    };
    lastActionBy?: {
        id: string;
        name: string | null;
    } | null;
    currentUserId?: string;
    statusLabel?: string;
}

interface AlreadyContactedModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onOpenDetails?: () => void;
    info: AlreadyContactedInfo | null;
}

export function AlreadyContactedModal({
    isOpen,
    onClose,
    onConfirm,
    onOpenDetails,
    info,
}: AlreadyContactedModalProps) {
    if (!info) return null;

    const {
        phone,
        targetName,
        companyName,
        actionIntent,
        lastAction,
        lastActionBy,
        currentUserId,
        statusLabel,
    } = info;

    const isByMe = !!lastActionBy?.id && lastActionBy.id === currentUserId;
    const authorName = isByMe ? "Vous-même" : lastActionBy?.name || "un autre SDR";
    const isCompanyScope = lastAction.scope === "COMPANY";

    // Format date in French
    const dateFormatted = (() => {
        try {
            const date = new Date(lastAction.createdAt);
            const now = new Date();
            const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

            let relative = "";
            if (diffDays === 0) relative = "Aujourd'hui";
            else if (diffDays === 1) relative = "Hier";
            else if (diffDays < 30) relative = `Il y a ${diffDays} jours`;
            else relative = `Il y a plus d'un mois`;

            const full = date.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
            });

            return `${relative} (${full})`;
        } catch {
            return lastAction.createdAt;
        }
    })();

    const displayStatus = statusLabel || lastAction.result;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="md"
            className="border border-amber-200"
        >
            <div className="p-6">
                {/* Header Icon + Title */}
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0 text-amber-600 shadow-sm shadow-amber-200/50">
                        <AlertTriangle className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 mb-1.5">
                            {isCompanyScope ? "Entreprise déjà contactée" : "Prospect déjà contacté"}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 leading-snug">
                            {actionIntent === "CALL" ? "Confirmer l'appel téléphonique" : "Confirmer la copie du numéro"}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {isCompanyScope
                                ? `Une interaction récente a déjà eu lieu avec l'entreprise ${companyName ? `"${companyName}"` : ""}.`
                                : `Ce contact a déjà été sollicité récemment par un membre de l'équipe.`}
                        </p>
                    </div>
                </div>

                {/* Target info pill */}
                <div className="mt-4 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    {targetName && (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-900">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            {targetName}
                        </span>
                    )}
                    {companyName && (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {companyName}
                        </span>
                    )}
                    <span className="font-mono font-medium text-slate-800 ml-auto bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {phone}
                    </span>
                </div>

                {/* Detailed Action Card */}
                <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-wide font-semibold text-amber-800 flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5 text-amber-600" />
                            Dernière interaction
                        </span>
                        <span className="text-[11px] font-medium text-amber-700">
                            {dateFormatted}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-900 shadow-xs">
                            {displayStatus}
                        </span>
                        <span className="text-xs text-amber-800 font-medium">
                            Par <span className="font-semibold">{authorName}</span>
                        </span>
                    </div>

                    {lastAction.note && (
                        <div className="mt-2 text-xs text-amber-950 bg-white/80 p-2.5 rounded-lg border border-amber-200/70 leading-relaxed italic flex items-start gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>"{lastAction.note}"</span>
                        </div>
                    )}

                    {lastAction.callbackDate && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50/80 border border-indigo-200 px-2.5 py-1.5 rounded-lg font-medium">
                            <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            Rappel initialement prévu le{" "}
                            {new Date(lastAction.callbackDate).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </div>
                    )}
                </div>

                {/* Question warning */}
                <p className="mt-4 text-xs font-medium text-slate-600 text-center">
                    Êtes-vous sûr(e) de vouloir {actionIntent === "CALL" ? "appeler ce numéro" : "copier ce numéro"} ?
                </p>

                {/* Action buttons */}
                <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                    {onOpenDetails && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                onClose();
                                onOpenDetails();
                            }}
                            className="text-xs text-slate-600 hover:text-slate-900 justify-center"
                        >
                            <History className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            Voir l'historique
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        className="text-xs border-slate-300 text-slate-700 hover:bg-slate-100 justify-center"
                    >
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            onClose();
                            onConfirm();
                        }}
                        className={cn(
                            "text-xs font-semibold justify-center text-white shadow-sm",
                            actionIntent === "CALL"
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-violet-600 hover:bg-violet-700"
                        )}
                    >
                        {actionIntent === "CALL" ? (
                            <>
                                <PhoneCall className="w-3.5 h-3.5 mr-1.5" />
                                Appeler quand même
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5 mr-1.5" />
                                Copier quand même
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
