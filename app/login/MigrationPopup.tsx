"use client";

import { useState, useEffect } from "react";
import { brand } from "@/lib/brand";

export default function MigrationPopup() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const dismissed = localStorage.getItem("migration_popup_dismissed");
        if (!dismissed) setVisible(true);
    }, []);

    const handleDismiss = () => {
        localStorage.setItem("migration_popup_dismissed", "true");
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "color-mix(in oklab, var(--ds-ink) 40%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "1rem",
            }}
        >
            <div
                style={{
                    background: "var(--ds-surface)",
                    borderRadius: 16,
                    border: "1px solid var(--ds-line)",
                    width: "100%",
                    maxWidth: 500,
                    overflow: "hidden",
                    fontFamily: "inherit",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: "1.5rem 1.75rem 0",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                    }}
                >
                    <div>
                        <h2
                            style={{
                                fontFamily: "var(--font-display-face), inherit",
                                fontSize: 20,
                                fontWeight: 600,
                                color: "var(--ds-ink)",
                                margin: "0 0 4px",
                            }}
                        >
                            Nouvelle adresse
                        </h2>
                        <p style={{ fontSize: 13, color: "var(--ds-ink-3)", margin: 0 }}>
                            {brand.name} a migré vers sa propre infrastructure
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 2,
                            color: "var(--ds-ink-4)",
                            marginTop: 2,
                        }}
                        aria-label="Fermer"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Divider */}
                <div style={{ margin: "1.25rem 1.75rem 0", borderTop: "1px solid var(--ds-line-subtle)" }} />

                {/* Body */}
                <div style={{ padding: "1.25rem 1.75rem" }}>
                    {/* Brand row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "var(--ds-inverse)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ds-inverse-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-ink)", margin: 0 }}>
                                {brand.productName}
                            </p>
                            <p style={{ fontSize: 12, color: "var(--ds-ink-3)", margin: 0 }}>
                                Migration vers infrastructure dédiée
                            </p>
                        </div>
                    </div>

                    {/* URL box */}
                    <div
                        style={{
                            background: "var(--ds-surface-2)",
                            border: "1px solid var(--ds-line-subtle)",
                            borderRadius: 8,
                            padding: "14px 16px",
                            marginBottom: "1rem",
                        }}
                    >
                        <p
                            style={{
                                fontSize: 11,
                                color: "var(--ds-ink-3)",
                                margin: "0 0 4px",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                fontWeight: 600,
                            }}
                        >
                            Nouvelle adresse
                        </p>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ds-ink)" }}>
                                {brand.appHost}
                            </span>
                            <span
                                style={{
                                    fontSize: 11,
                                    background: "var(--ds-success-soft)",
                                    color: "var(--ds-success-ink)",
                                    padding: "3px 8px",
                                    borderRadius: 20,
                                    fontWeight: 600,
                                }}
                            >
                                Actif
                            </span>
                        </div>
                    </div>

                    {/* Checklist */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.25rem" }}>
                        {[
                            "Base de données migrée",
                            "Tous les services opérationnels",
                            "Connexion sécurisée HTTPS",
                        ].map((item) => (
                            <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ds-ink-2)" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ds-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                {item}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        borderTop: "1px solid var(--ds-line-subtle)",
                        padding: "1rem 1.75rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                    }}
                >
                    <button
                        type="button"
                        onClick={handleDismiss}
                        style={{
                            fontSize: 13,
                            color: "var(--ds-ink-2)",
                            background: "none",
                            border: "1px solid var(--ds-line)",
                            borderRadius: 8,
                            padding: "8px 16px",
                            cursor: "pointer",
                        }}
                    >
                        Ignorer
                    </button>
                    <a
                        href={brand.appUrl}
                        style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--ds-primary-fg)",
                            background: "var(--ds-primary)",
                            border: "none",
                            borderRadius: 8,
                            padding: "8px 20px",
                            cursor: "pointer",
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        Accéder maintenant
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </a>
                </div>
            </div>
        </div>
    );
}
