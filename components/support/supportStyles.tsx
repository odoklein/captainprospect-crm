"use client";

/**
 * Support surface visual tokens + keyframes.
 *
 * Built on the design-system tokens (app/globals.css → brand/brand.config.ts):
 * brand primary for actions, brand neutrals for paper and ink, generous
 * corner radii (24 / 20 / 16 / 12), soft shadows.
 *
 * We expose two token sets:
 *  - `SUP_LIGHT`  → client portal panel (lives on an ivory/warm background)
 *  - `SUP_DARK`   → manager workspace panel (sits over the dark sidebar)
 *
 * Keyframes live under the `cpSup…` prefix so they never collide with the
 * existing CRM animations declared in `app/globals.css`.
 */
export function SupportStyles() {
    return (
        <style>{`
            .cp-support-root {
                font-family: var(--font-body-face), system-ui, -apple-system, sans-serif;
                font-feature-settings: 'ss01' on, 'cv11' on;
            }
            .cp-support-root *, .cp-support-root *::before, .cp-support-root *::after { box-sizing: border-box; }
            .cp-support-root-mono { font-family: var(--font-code-face), ui-monospace, SFMono-Regular, Menlo, monospace; }

            @keyframes cpSupBubbleIn { from { opacity:0; transform:scale(0.92) translateY(4px); } to { opacity:1; transform:scale(1) translateY(0); } }
            @keyframes cpSupPanelIn { from { opacity:0; transform:translateY(22px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
            @keyframes cpSupSlideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
            @keyframes cpSupSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
            @keyframes cpSupFabPulse {
                0%, 100% { box-shadow: 0 8px 20px color-mix(in oklab, var(--brand-neutral-950) 18%, transparent), 0 0 0 0 color-mix(in oklab, var(--brand-accent) 30%, transparent); }
                50%      { box-shadow: 0 8px 20px color-mix(in oklab, var(--brand-neutral-950) 18%, transparent), 0 0 0 10px color-mix(in oklab, var(--brand-accent) 0%, transparent); }
            }
            @keyframes cpSupStatusPing {
                0%, 100% { transform: scale(1); opacity: 0.55; }
                50%      { transform: scale(1.22); opacity: 0.15; }
            }
            @keyframes cpSupTypingDot {
                0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
                40%           { transform: translateY(-4px); opacity: 1; }
            }
            @keyframes cpSupSpin { to { transform: rotate(360deg); } }
            @keyframes cpSupBadgePop { from { transform: scale(0); } to { transform: scale(1); } }
            @keyframes cpSupPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
            @keyframes cpSupResolvedWash {
                from { background-color: color-mix(in oklab, var(--brand-primary) 0%, transparent); }
                to   { background-color: color-mix(in oklab, var(--brand-primary) 6%, transparent); }
            }

            @keyframes cpSupFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes cpSupScaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            @keyframes cpSupSlideLeft { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }

            @keyframes cpSupShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

            /* Skeleton placeholder used by the list + message-stream loaders.
               The shimmer is purely decorative, so it is dropped entirely when
               the visitor asked for reduced motion. */
            .cp-sup-skel {
                border-radius: 8px;
                background: linear-gradient(
                    90deg,
                    var(--ds-surface-3) 0%,
                    var(--ds-line) 50%,
                    var(--ds-surface-3) 100%
                );
                background-size: 200% 100%;
                animation: cpSupShimmer 1.4s ease-in-out infinite;
            }
            @media (prefers-reduced-motion: reduce) {
                .cp-sup-skel { animation: none; }
            }

            .cp-support-root .cp-sup-scroll-hidden::-webkit-scrollbar { display: none; }
            .cp-support-root .cp-sup-scroll-hidden { scrollbar-width: none; -ms-overflow-style: none; }

            .cp-support-scroll {
                scrollbar-width: thin;
                scrollbar-color: var(--ds-line-strong) transparent;
            }
            .cp-support-scroll::-webkit-scrollbar {
                width: 5px;
            }
            .cp-support-scroll::-webkit-scrollbar-track {
                background: transparent;
            }
            .cp-support-scroll::-webkit-scrollbar-thumb {
                background: var(--ds-line-strong);
                border-radius: 999px;
            }
            .cp-support-scroll::-webkit-scrollbar-thumb:hover {
                background: var(--ds-ink-4);
            }

            .cp-support-root .cp-sup-composer-input { outline: none; }
            .cp-support-root .cp-sup-composer-input::placeholder { color: var(--ds-ink-4); }
            .cp-support-root-dark .cp-sup-composer-input::placeholder { color: rgba(216,222,207,0.45); }

            .cp-support-card-hover {
                transition: box-shadow 160ms ease, border-color 160ms ease;
            }
            .cp-support-card-hover:hover {
                border-color: var(--ds-line-strong);
                box-shadow: 0 8px 24px -6px color-mix(in oklab, var(--brand-neutral-950) 10%, transparent);
            }

            @media (max-width: 640px) {
                .cp-support-panel-responsive {
                    bottom: 0 !important;
                    right: 0 !important;
                    width: 100vw !important;
                    max-width: 100vw !important;
                    height: 100vh !important;
                    max-height: 100vh !important;
                    border-radius: 0 !important;
                    border: none !important;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .cp-support-root * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
            }
        `}</style>
    );
}

/** Client portal panel tokens — brand neutrals, brand primary actions. */
export const SUP_LIGHT = {
    paper: "var(--ds-surface-2)",
    paperRaised: "var(--ds-surface)",
    paperSunken: "var(--ds-surface-3)",
    line: "var(--ds-line)",
    lineSoft: "var(--ds-line-subtle)",
    ink: "var(--ds-ink)",
    ink2: "var(--ds-ink-2)",
    ink3: "var(--ds-ink-3)",
    ink4: "var(--ds-ink-4)",
    brand: "var(--ds-primary)",
    brandStrong: "var(--ds-primary-hover)",
    brandSoft: "var(--brand-primary-100)",
    brandSofter: "var(--brand-primary-50)",
    // Flat on purpose (no gradients); names kept for existing consumers.
    brandGradient: "var(--ds-primary)",
    brandGradientHover: "var(--ds-primary-hover)",
    accentAmber: "#C97B2A",
    accentAmberSoft: "#FBEAD1",
    success: "#10B981",
    successSoft: "#ECFDF5",
    successBorder: "rgba(16,185,129,0.25)",
    danger: "#B23B3B",
    dangerSoft: "#F5DFDF",
    radiusXL: 24,
    radiusL: 20,
    radiusM: 16,
    radiusS: 12,
    radiusXS: 10,
    shadowPanel:
        "0 32px 80px rgba(31,43,31,0.18), 0 2px 8px rgba(31,43,31,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
    shadowFab: "0 8px 20px color-mix(in oklab, var(--brand-neutral-950) 18%, transparent)",
};

/** Manager workspace tokens — the brand surface (same as the sidebar). */
export const SUP_DARK = {
    surface: "var(--ds-inverse)",
    surfaceRaised: "var(--ds-inverse-raised)",
    surfaceSunken: "var(--brand-primary-950)",
    line: "rgba(255,255,255,0.08)",
    lineSoft: "rgba(255,255,255,0.05)",
    ink: "var(--ds-inverse-ink)",
    ink2: "var(--ds-inverse-ink-2)",
    ink3: "var(--ds-inverse-ink-3)",
    ink4: "color-mix(in oklab, var(--ds-inverse-ink-3) 70%, transparent)",
    brand: "var(--brand-accent-300)",
    brandStrong: "var(--brand-accent-200)",
    brandSoft: "color-mix(in oklab, var(--brand-accent) 20%, transparent)",
    accentAmber: "#F4B560",
    accentAmberSoft: "rgba(244,181,96,0.15)",
    success: "#34D399",
    successSoft: "rgba(52,211,153,0.15)",
    danger: "#F3766C",
    dangerSoft: "rgba(243,118,108,0.12)",
    radiusXL: 24,
    radiusL: 20,
    radiusM: 16,
    radiusS: 12,
};

// Back-compat alias for earlier consumers. Points at SUP_LIGHT because the
// client panel is the primary visual target of the design system pass.
export const SUP_TOKENS = SUP_LIGHT;
