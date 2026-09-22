"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Ban, Building2, User } from "lucide-react";
import { Button, Modal, ModalFooter } from "@/components/ui";
import {
    EXCLUSION_DURATIONS,
    EXCLUSION_REASON_PRESETS,
    EXCLUSION_SCOPE_HINTS,
    EXCLUSION_SCOPE_LABELS,
    MAX_EXCLUSION_REASON_LENGTH,
} from "@/lib/exclusions/constants";
import { cn } from "@/lib/utils";

export type ExclusionTargetChoice = "COMPANY" | "CONTACT";
export type ExclusionScopeChoice = "GLOBAL" | "CLIENT" | "MISSION";

export interface ExcludePayload {
    target: ExclusionTargetChoice;
    scope: ExclusionScopeChoice;
    reason: string;
    duration: string;
}

/**
 * The one place a "ne plus contacter" is composed, shared by the SDR drawer,
 * the manager console and the client portal.
 *
 * Two things are deliberately non-optional: a reason, because someone will read
 * it months later deciding whether to lift the rule, and an explicit level,
 * because "this contact" and "the whole company" are very different promises to
 * make to a client and must never be picked by accident.
 */
export function ExcludeDialog({
    isOpen,
    onClose,
    onConfirm,
    companyName,
    contactName,
    defaultTarget = "CONTACT",
    availableScopes = ["CLIENT"],
    defaultScope = "CLIENT",
    allowTargetChoice = true,
    isSubmitting = false,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (payload: ExcludePayload) => void | Promise<void>;
    companyName: string;
    contactName?: string | null;
    defaultTarget?: ExclusionTargetChoice;
    availableScopes?: ExclusionScopeChoice[];
    defaultScope?: ExclusionScopeChoice;
    allowTargetChoice?: boolean;
    isSubmitting?: boolean;
}) {
    const [target, setTarget] = useState<ExclusionTargetChoice>(defaultTarget);
    const [scope, setScope] = useState<ExclusionScopeChoice>(defaultScope);
    const [reason, setReason] = useState("");
    const [duration, setDuration] = useState("permanent");

    // Reopening on a different prospect must not inherit the previous answers —
    // a stale reason on a new company is how wrong rules get created. Adjusted
    // during render rather than in an effect, so the first paint of a reopened
    // dialog is already clean (React's "adjusting state when a prop changes").
    const [wasOpen, setWasOpen] = useState(isOpen);
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setTarget(defaultTarget);
            setScope(defaultScope);
            setReason("");
            setDuration("permanent");
        }
    }

    const canSubmit = reason.trim().length >= 3 && !isSubmitting;

    const targetOptions = useMemo(
        () =>
            [
                {
                    value: "CONTACT" as const,
                    icon: User,
                    title: contactName ? `Ce contact — ${contactName}` : "Ce contact",
                    hint: "Les autres personnes de la société restent appelables.",
                    disabled: !contactName,
                },
                {
                    value: "COMPANY" as const,
                    icon: Building2,
                    title: `Toute la société — ${companyName}`,
                    hint: "Aucun salarié de cette société ne sera plus contacté, sur aucun canal.",
                    disabled: false,
                },
            ].filter((option) => allowTargetChoice || option.value === defaultTarget),
        [companyName, contactName, allowTargetChoice, defaultTarget]
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Ne plus contacter"
            description="La fiche sort des files d'appel et des séquences email, et le restera après un ré-import."
            size="lg"
        >
            <div className="space-y-5">
                {/* Level */}
                <div>
                    <p className="text-sm font-semibold text-slate-800 mb-2">Portée de l&apos;exclusion</p>
                    <div className="grid gap-2">
                        {targetOptions.map((option) => {
                            const Icon = option.icon;
                            const active = target === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    disabled={option.disabled}
                                    onClick={() => setTarget(option.value)}
                                    className={cn(
                                        "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                                        active
                                            ? "border-red-300 bg-red-50 ring-2 ring-red-100"
                                            : "border-slate-200 bg-white hover:border-slate-300",
                                        option.disabled && "opacity-40 cursor-not-allowed"
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            "w-5 h-5 shrink-0 mt-0.5",
                                            active ? "text-red-600" : "text-slate-400"
                                        )}
                                    />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-slate-900 break-words">
                                            {option.title}
                                        </span>
                                        <span className="block text-xs text-slate-500 mt-0.5">{option.hint}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Scope — hidden when there is only one choice, to keep the SDR path short */}
                {availableScopes.length > 1 && (
                    <div>
                        <p className="text-sm font-semibold text-slate-800 mb-2">Sur quel périmètre ?</p>
                        <div className="grid gap-2">
                            {availableScopes.map((value) => {
                                const active = scope === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setScope(value)}
                                        className={cn(
                                            "rounded-xl border p-3 text-left transition-all",
                                            active
                                                ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100"
                                                : "border-slate-200 bg-white hover:border-slate-300"
                                        )}
                                    >
                                        <span className="block text-sm font-medium text-slate-900">
                                            {EXCLUSION_SCOPE_LABELS[value]}
                                        </span>
                                        <span className="block text-xs text-slate-500 mt-0.5">
                                            {EXCLUSION_SCOPE_HINTS[value]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Reason */}
                <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                        Motif <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {EXCLUSION_REASON_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setReason(preset)}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value.slice(0, MAX_EXCLUSION_REASON_LENGTH))}
                        rows={3}
                        placeholder="Ex : le client ne souhaite plus que l'on appelle ses salariés sur leur téléphone personnel"
                        className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                        {reason.trim().length}/{MAX_EXCLUSION_REASON_LENGTH} — visible par le manager et le client.
                    </p>
                </div>

                {/* Duration */}
                <div>
                    <p className="text-sm font-semibold text-slate-800 mb-2">Durée</p>
                    <div className="flex flex-wrap gap-2">
                        {EXCLUSION_DURATIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setDuration(option.value)}
                                className={cn(
                                    "rounded-lg border px-3 py-1.5 text-sm transition-all",
                                    duration === option.value
                                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {target === "COMPANY" && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                            Tous les contacts de <strong>{companyName}</strong> vont sortir des files d&apos;appel et
                            leurs séquences email en cours seront arrêtées. Un manager peut lever l&apos;exclusion à
                            tout moment.
                        </p>
                    </div>
                )}
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                    Annuler
                </Button>
                <Button
                    variant="danger"
                    isLoading={isSubmitting}
                    disabled={!canSubmit}
                    onClick={() => onConfirm({ target, scope, reason: reason.trim(), duration })}
                >
                    <Ban className="w-4 h-4" />
                    Exclure
                </Button>
            </ModalFooter>
        </Modal>
    );
}
