"use client";

import { AlertTriangle, Ban, Building2, User } from "lucide-react";
import { EXCLUSION_DURATIONS, EXCLUSION_REASON_PRESETS } from "@/lib/exclusions/constants";
import { cn } from "@/lib/utils";

export type PanelTarget = "COMPANY" | "CONTACT";

export interface ExclusionPanelState {
    armed: boolean;
    target: PanelTarget;
    reason: string;
    duration: string;
}

export const EMPTY_EXCLUSION_PANEL: ExclusionPanelState = {
    armed: false,
    target: "CONTACT",
    reason: "",
    duration: "permanent",
};

/**
 * Inline "ne plus contacter" block inside the SDR action drawer.
 *
 * Why inline rather than a modal: the SDR is closing a call, and a second
 * dialog is exactly the friction that made everyone fall back to "put a status
 * on it and hope". Pre-armed when the chosen status is a genuine dead end, and
 * always un-checkable — a mis-click must cost one click, not a support ticket.
 */
export function ExclusionActionPanel({
    state,
    onChange,
    companyName,
    contactName,
    statusLabel,
    disabled = false,
}: {
    state: ExclusionPanelState;
    onChange: (next: ExclusionPanelState) => void;
    companyName: string | null;
    contactName?: string | null;
    statusLabel: string;
    disabled?: boolean;
}) {
    const set = (patch: Partial<ExclusionPanelState>) => onChange({ ...state, ...patch });

    return (
        <div
            className={cn(
                "rounded-xl border transition-all",
                state.armed ? "border-red-200 bg-red-50/70" : "border-slate-200 bg-slate-50/60"
            )}
        >
            <label className="flex items-start gap-2.5 p-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={state.armed}
                    disabled={disabled}
                    onChange={(e) => set({ armed: e.target.checked })}
                    className="mt-0.5 w-4 h-4 accent-red-600 cursor-pointer"
                />
                <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Ne plus contacter
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                        «&nbsp;{statusLabel}&nbsp;» est un statut définitif : retirer la fiche de la prospection, pour
                        de bon. Sans cette case, elle reviendra au prochain import.
                    </span>
                </span>
            </label>

            {state.armed && (
                <div className="px-3 pb-3 space-y-3 border-t border-red-200/70 pt-3">
                    {/* Level */}
                    <div className="flex flex-wrap gap-2">
                        {(
                            [
                                { value: "CONTACT" as const, icon: User, label: contactName || "Ce contact" },
                                {
                                    value: "COMPANY" as const,
                                    icon: Building2,
                                    label: `Toute la société${companyName ? ` — ${companyName}` : ""}`,
                                },
                            ] as const
                        ).map((option) => {
                            const Icon = option.icon;
                            const active = state.target === option.value;
                            const unavailable = option.value === "CONTACT" && !contactName;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    disabled={unavailable}
                                    onClick={() => set({ target: option.value })}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                                        active
                                            ? "border-red-400 bg-white text-red-700"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                                        unavailable && "opacity-40 cursor-not-allowed"
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Reason */}
                    <div>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {EXCLUSION_REASON_PRESETS.slice(0, 4).map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => set({ reason: preset })}
                                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-300"
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            value={state.reason}
                            onChange={(e) => set({ reason: e.target.value.slice(0, 500) })}
                            placeholder="Motif de l'exclusion (obligatoire)"
                            className={cn(
                                "w-full rounded-lg border px-3 py-2 text-sm bg-white outline-none transition-all",
                                state.reason.trim().length < 3
                                    ? "border-red-300 focus:border-red-400"
                                    : "border-slate-200 focus:border-indigo-400"
                            )}
                        />
                    </div>

                    {/* Duration */}
                    <div className="flex flex-wrap gap-1.5">
                        {EXCLUSION_DURATIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => set({ duration: option.value })}
                                className={cn(
                                    "rounded-lg border px-2.5 py-1 text-xs transition-all",
                                    state.duration === option.value
                                        ? "border-indigo-400 bg-white text-indigo-700 font-medium"
                                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {state.target === "COMPANY" && (
                        <p className="flex items-start gap-2 text-[11px] text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                            Tous les contacts de cette société sortiront des files d&apos;appel et leurs séquences
                            email seront arrêtées.
                        </p>
                    )}

                    {state.reason.trim().length < 3 && (
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-red-600">
                            <Ban className="w-3.5 h-3.5" />
                            Un motif est requis pour enregistrer l&apos;exclusion.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
