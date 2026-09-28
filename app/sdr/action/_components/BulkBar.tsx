"use client";

import { Ban, X } from "lucide-react";
import { CpButton, IconButton } from "./primitives";

interface BulkBarProps {
    count: number;
    isWorking: boolean;
    onDisqualify: () => void;
    onClear: () => void;
}

/** Floating action bar shown while rows are selected. */
export function BulkBar({ count, isWorking, onDisqualify, onClear }: BulkBarProps) {
    if (count === 0) return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
            <div
                role="toolbar"
                aria-label="Actions sur la sélection"
                className="cpds-enter pointer-events-auto flex items-center gap-3 rounded-xl border border-cp-inverse bg-cp-inverse py-2 pl-4 pr-2 text-sm text-cp-on-inverse shadow-2xl"
            >
                <span className="tabular-nums">
                    <span className="font-semibold">{count}</span> sélectionné{count > 1 ? "s" : ""}
                </span>
                <CpButton size="sm" variant="danger" icon={Ban} onClick={onDisqualify} isLoading={isWorking}>
                    Disqualifier
                </CpButton>
                <IconButton
                    icon={X}
                    label="Annuler la sélection (Échap)"
                    size="sm"
                    onClick={onClear}
                    className="border-white/15 bg-transparent text-white/70 hover:border-white/30 hover:text-white"
                />
            </div>
        </div>
    );
}
