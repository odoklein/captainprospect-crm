"use client";

import { CheckCircle2, AlertCircle, ArrowRight, Circle } from "lucide-react";

interface ReadinessPanelProps {
    readiness?: {
        activeLists: number;
        readyLists: number;
        missingStrategy: number;
        missingIcp: number;
        missingPitch: number;
        missingScript: number;
    };
    /**
     * Jump to the tab that fixes a given gap. Every unmet item is a button, so
     * the panel ends in an action instead of just reporting a number.
     */
    onFix?: (tab: string) => void;
}

const C = {
    text: "#0F172A",
    textMuted: "#64748B",
    emerald: "#059669",
    emeraldBg: "#ECFDF5",
    emeraldBorder: "#A7F3D0",
    amber: "#D97706",
    amberBg: "#FFFBEB",
    amberBorder: "#FCD34D",
    indigo: "#4F46E5",
};

interface GapItem {
    key: string;
    label: string;
    tab: string;
    cta: string;
}

export function ReadinessPanel({ readiness, onFix }: ReadinessPanelProps) {
    if (!readiness) return null;
    const { activeLists, readyLists, missingStrategy, missingIcp, missingPitch, missingScript } = readiness;

    const gaps: GapItem[] = [];

    if (activeLists === 0) {
        gaps.push({
            key: "lists",
            label: "Aucune base active sur cette mission",
            tab: "audience",
            cta: "Ajouter une base",
        });
    } else {
        if (missingStrategy > 0) {
            gaps.push({
                key: "strategy",
                label: `${missingStrategy} base${missingStrategy > 1 ? "s" : ""} sans stratégie`,
                tab: "strategies",
                cta: "Assigner une stratégie",
            });
        }
        if (missingIcp > 0) {
            gaps.push({
                key: "icp",
                label: `${missingIcp} base${missingIcp > 1 ? "s" : ""} sans ICP`,
                tab: "strategies",
                cta: "Définir l'ICP",
            });
        }
        if (missingPitch > 0) {
            gaps.push({
                key: "pitch",
                label: `${missingPitch} base${missingPitch > 1 ? "s" : ""} sans pitch`,
                tab: "strategies",
                cta: "Écrire le pitch",
            });
        }
        if (missingScript > 0) {
            gaps.push({
                key: "script",
                label: `${missingScript} base${missingScript > 1 ? "s" : ""} sans script`,
                tab: "strategies",
                cta: "Écrire le script",
            });
        }
    }

    const allReady = gaps.length === 0 && activeLists > 0;
    const accent = allReady ? C.emerald : C.amber;
    const accentBg = allReady ? C.emeraldBg : C.amberBg;
    const accentBorder = allReady ? C.emeraldBorder : C.amberBorder;
    const percent = activeLists > 0 ? Math.round((readyLists / activeLists) * 100) : 0;

    return (
        <div
            style={{
                background: accentBg,
                border: `1px solid ${accentBorder}`,
                borderRadius: 18,
                padding: 18,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <div
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    {allReady ? (
                        <CheckCircle2 style={{ width: 22, height: 22, color: "#FFFFFF" }} />
                    ) : (
                        <AlertCircle style={{ width: 22, height: 22, color: "#FFFFFF" }} />
                    )}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                        {allReady
                            ? "Toutes les bases sont prêtes pour les SDR"
                            : activeLists === 0
                                ? "Mission sans base active"
                                : `${activeLists - readyLists} base${activeLists - readyLists > 1 ? "s" : ""} à configurer`}
                    </div>
                    {activeLists > 0 && (
                        <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 2 }}>
                            {readyLists} sur {activeLists} base{activeLists > 1 ? "s" : ""} active
                            {activeLists > 1 ? "s" : ""} prête{readyLists > 1 ? "s" : ""} ({percent}%)
                        </div>
                    )}
                </div>
            </div>

            {gaps.length > 0 && (
                <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 6 }}>
                    {gaps.map((gap) => (
                        <li key={gap.key}>
                            <button
                                type="button"
                                onClick={() => onFix?.(gap.tab)}
                                disabled={!onFix}
                                style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "9px 12px",
                                    background: "#FFFFFF",
                                    border: `1px solid ${accentBorder}`,
                                    borderRadius: 10,
                                    cursor: onFix ? "pointer" : "default",
                                    textAlign: "left",
                                }}
                            >
                                <Circle style={{ width: 13, height: 13, color: accent, flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: C.text, flex: 1, minWidth: 0 }}>{gap.label}</span>
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 5,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: C.indigo,
                                        flexShrink: 0,
                                    }}
                                >
                                    {gap.cta}
                                    <ArrowRight style={{ width: 13, height: 13 }} />
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
