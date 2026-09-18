"use client";

import { Sparkles, X } from "lucide-react";
import { SUP_LIGHT } from "./supportStyles";
import { DEFAULT_QUICK_REPLIES } from "@/lib/support/constants";

const T = SUP_LIGHT;

interface SupportQuickRepliesProps {
    replies?: string[];
    onSelect: (text: string) => void;
    onClose: () => void;
}

export function SupportQuickReplies({
    replies = DEFAULT_QUICK_REPLIES,
    onSelect,
    onClose,
}: SupportQuickRepliesProps) {
    return (
        <div
            style={{
                borderTop: `1px solid ${T.lineSoft}`,
                padding: "12px 16px",
                background: T.paperSunken,
                animation: "cpSupSlideUp 0.2s ease both",
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: T.ink3,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                        }}
                    >
                        Réponses rapides
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fermer les réponses rapides"
                    style={{
                        background: "none",
                        border: "none",
                        color: T.ink3,
                        cursor: "pointer",
                        padding: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {replies.map((reply) => (
                    <button
                        key={reply}
                        type="button"
                        onClick={() => onSelect(reply)}
                        style={{
                            padding: "8px 12px",
                            borderRadius: T.radiusS,
                            textAlign: "left",
                            background: T.paperRaised,
                            border: `1px solid ${T.line}`,
                            color: T.ink2,
                            fontSize: 12.5,
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 150ms ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = T.brandSofter;
                            e.currentTarget.style.borderColor = "rgba(99,102,241,0.24)";
                            e.currentTarget.style.color = T.ink;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = T.paperRaised;
                            e.currentTarget.style.borderColor = T.line;
                            e.currentTarget.style.color = T.ink2;
                        }}
                    >
                        {reply}
                    </button>
                ))}
            </div>
        </div>
    );
}
