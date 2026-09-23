"use client";

import { SUP_LIGHT } from "./supportStyles";

const T = SUP_LIGHT;

interface SupportResolvedBannerProps {
    onReopen: () => void;
    isReopening: boolean;
    /** Starts a separate request instead of appending to this resolved thread. */
    onNewRequest?: () => void;
}

export function SupportResolvedBanner({ onReopen, isReopening, onNewRequest }: SupportResolvedBannerProps) {
    return (
        <div
            style={{
                padding: "12px 16px",
                background: T.brandSoft,
                borderTop: `1px solid rgba(99,102,241,0.2)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                animation: "cpSupSlideDown 0.3s ease both",
                flexShrink: 0,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span style={{ fontSize: 13, color: T.brandStrong, fontWeight: 600 }}>
                    Cette demande est marquée comme résolue
                </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
            {onNewRequest && (
                <button
                    type="button"
                    onClick={onNewRequest}
                    style={{
                        padding: "5px 14px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: T.brandStrong,
                        border: `1px solid ${T.brandStrong}`,
                        color: "#FFFFFF",
                        cursor: "pointer",
                        transition: "all 150ms ease",
                    }}
                >
                    Nouvelle demande
                </button>
            )}
            <button
                type="button"
                onClick={onReopen}
                disabled={isReopening}
                style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "#FFFFFF",
                    border: `1px solid ${T.brand}`,
                    color: T.brandStrong,
                    cursor: isReopening ? "not-allowed" : "pointer",
                    opacity: isReopening ? 0.6 : 1,
                    transition: "all 150ms ease",
                }}
            >
                {isReopening ? "Réouverture…" : "Rouvrir"}
            </button>
            </div>
        </div>
    );
}
