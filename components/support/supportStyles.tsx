"use client";

/**
 * Support surface visual tokens + keyframes.
 *
 * Aligned to `designsystemfinalfolder` (Captain Prospect DS): DM Sans /
 * DM Mono typography, ivory paper `#FAF9F6`, indigo brand `#7C5CFC`,
 * stone neutrals, generous corner radii (24 / 20 / 16 / 12), soft shadows.
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
                font-family: 'DM Sans', 'Inter', system-ui, -apple-system, sans-serif;
                font-feature-settings: 'ss01' on, 'cv11' on;
            }
            .cp-support-root *, .cp-support-root *::before, .cp-support-root *::after { box-sizing: border-box; }
            .cp-support-root-mono { font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }

            @keyframes cpSupBubbleIn { from { opacity:0; transform:scale(0.92) translateY(4px); } to { opacity:1; transform:scale(1) translateY(0); } }
            @keyframes cpSupPanelIn { from { opacity:0; transform:translateY(22px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
            @keyframes cpSupSlideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
            @keyframes cpSupSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
            @keyframes cpSupFabPulse {
                0%, 100% { box-shadow: 0 12px 32px rgba(124,92,252,0.32), 0 0 0 0 rgba(124,92,252,0.35); }
                50%      { box-shadow: 0 12px 32px rgba(124,92,252,0.32), 0 0 0 14px rgba(124,92,252,0); }
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
                from { background-color: rgba(124,92,252,0); }
                to   { background-color: rgba(124,92,252,0.06); }
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
                    rgba(43,58,43,0.06) 0%,
                    rgba(43,58,43,0.12) 50%,
                    rgba(43,58,43,0.06) 100%
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
                scrollbar-color: rgba(124,92,252,0.25) transparent;
            }
            .cp-support-scroll::-webkit-scrollbar {
                width: 5px;
            }
            .cp-support-scroll::-webkit-scrollbar-track {
                background: transparent;
            }
            .cp-support-scroll::-webkit-scrollbar-thumb {
                background: rgba(124,92,252,0.22);
                border-radius: 999px;
            }
            .cp-support-scroll::-webkit-scrollbar-thumb:hover {
                background: rgba(124,92,252,0.45);
            }

            .cp-support-root .cp-sup-composer-input { outline: none; }
            .cp-support-root .cp-sup-composer-input::placeholder { color: rgba(43,58,43,0.45); }
            .cp-support-root-dark .cp-sup-composer-input::placeholder { color: rgba(216,222,207,0.45); }

            .cp-support-card-hover {
                transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 160ms ease, border-color 160ms ease;
            }
            .cp-support-card-hover:hover {
                transform: translateY(-1.5px);
                box-shadow: 0 8px 24px -4px rgba(31,43,31,0.08), 0 2px 6px -1px rgba(31,43,31,0.04);
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

/** Client portal panel tokens — warm ivory paper, forest accent. */
export const SUP_LIGHT = {
    paper: "#FAF9F6",
    paperRaised: "#FFFFFF",
    paperSunken: "#F4F3EE",
    line: "rgba(43,58,43,0.10)",
    lineSoft: "rgba(43,58,43,0.06)",
    ink: "#1F2A1F",
    ink2: "#2B3A2B",
    ink3: "#615F55",
    ink4: "#A8A69A",
    brand: "#7C5CFC",
    brandStrong: "#6366F1",
    brandSoft: "#ECE8FF",
    brandSofter: "#F4F2FF",
    brandGradient: "linear-gradient(135deg, #7C5CFC 0%, #6366F1 100%)",
    brandGradientHover: "linear-gradient(135deg, #6D4BF5 0%, #4F46E5 100%)",
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
    shadowFab: "0 12px 28px rgba(124,92,252,0.32)",
};

/** Manager workspace tokens — sits above the dark sidebar, keeps the forest accent. */
export const SUP_DARK = {
    surface: "#0F1812",
    surfaceRaised: "#152118",
    surfaceSunken: "#0B130E",
    line: "rgba(255,255,255,0.08)",
    lineSoft: "rgba(255,255,255,0.05)",
    ink: "#F5F3EC",
    ink2: "#D8DECF",
    ink3: "#9AA694",
    ink4: "#6B7566",
    brand: "#A996FF",
    brandStrong: "#8E7DFF",
    brandSoft: "rgba(124,92,252,0.2)",
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
