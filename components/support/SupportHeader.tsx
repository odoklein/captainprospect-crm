"use client";

import { SUP_LIGHT } from "./supportStyles";

const T = SUP_LIGHT;

interface SupportHeaderProps {
    subject?: string;
    isResolved: boolean;
    statusText: string;
    onClose: () => void;
    onBackToList?: () => void;
    onNewRequest?: () => void;
}

export function SupportHeader({
    subject,
    isResolved,
    statusText,
    onClose,
    onBackToList,
    onNewRequest,
}: SupportHeaderProps) {
    return (
        <header
            style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderBottom: `1px solid ${T.line}`,
                background: T.paperRaised,
                flexShrink: 0,
            }}
        >
            {onBackToList && (
                <button
                    type="button"
                    onClick={onBackToList}
                    title="Voir toutes les demandes"
                    style={{
                        padding: "5px 10px",
                        borderRadius: T.radiusS,
                        background: T.paperSunken,
                        border: `1px solid ${T.line}`,
                        color: T.ink2,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0,
                        transition: "background 150ms ease",
                    }}
                >
                    ← Demandes
                </button>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: T.ink,
                        lineHeight: 1.25,
                        letterSpacing: "-0.01em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {subject || "Demande d'assistance"}
                </div>
                <div
                    style={{
                        fontSize: 11,
                        color: isResolved ? T.ink3 : T.brandStrong,
                        marginTop: 2,
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <span>{isResolved ? "✓ Résolue" : "● En cours"}</span>
                    <span>·</span>
                    <span>{statusText}</span>
                </div>
            </div>

            {onNewRequest && (
                <button
                    type="button"
                    onClick={onNewRequest}
                    title="Ouvrir une nouvelle demande"
                    style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: T.brandSoft,
                        border: `1px solid rgba(99,102,241,0.25)`,
                        color: T.brandStrong,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0,
                        transition: "all 150ms ease",
                    }}
                >
                    + Nouvelle
                </button>
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label="Fermer le panneau"
                style={{
                    width: 30,
                    height: 30,
                    borderRadius: T.radiusS,
                    background: T.paperSunken,
                    border: `1px solid ${T.line}`,
                    color: T.ink3,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = T.brandSoft;
                    e.currentTarget.style.color = T.brandStrong;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = T.paperSunken;
                    e.currentTarget.style.color = T.ink3;
                }}
            >
                ✕
            </button>
        </header>
    );
}
