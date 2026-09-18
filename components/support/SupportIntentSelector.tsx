"use client";

import { SUP_LIGHT } from "./supportStyles";
import { INTENT_CARD_CONFIG } from "@/lib/support/constants";
import type { SupportIntent } from "@/lib/support/types";

const T = SUP_LIGHT;

interface SupportIntentSelectorProps {
    onSelectIntent: (intent: SupportIntent) => void;
}

export function SupportIntentSelector({ onSelectIntent }: SupportIntentSelectorProps) {
    const intents = Object.keys(INTENT_CARD_CONFIG) as SupportIntent[];

    return (
        <div
            style={{
                margin: "8px 0 12px",
                padding: "16px",
                borderRadius: T.radiusM,
                border: `1px solid ${T.line}`,
                background: T.paperRaised,
                boxShadow: "0 1px 3px rgba(31,43,31,0.04)",
                animation: "cpSupBubbleIn 0.3s ease both",
            }}
        >
            <p
                style={{
                    fontSize: 11,
                    color: T.ink3,
                    marginBottom: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                }}
            >
                Que puis-je faire pour vous ?
            </p>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                }}
            >
                {intents.map((id) => {
                    const cfg = INTENT_CARD_CONFIG[id];
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => onSelectIntent(id)}
                            style={{
                                padding: "10px 12px",
                                borderRadius: T.radiusS,
                                background: cfg.bg,
                                border: `1px solid ${cfg.border}`,
                                color: cfg.color,
                                cursor: "pointer",
                                textAlign: "left",
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                transition: "transform 150ms ease, box-shadow 150ms ease",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "translateY(-1px)";
                                e.currentTarget.style.boxShadow = "0 3px 8px rgba(0,0,0,0.06)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.boxShadow = "none";
                            }}
                        >
                            <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                            <span>{cfg.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
