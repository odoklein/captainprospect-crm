// ============================================
// DESIGN SYSTEM RECIPES — shared class strings for components/ui.
//
// Every value is a token utility (app/globals.css), never a hex or a raw
// palette shade, so a clone rebrands by editing brand/brand.config.ts only.
// Literal strings on purpose: Tailwind's scanner must see each class.
//
// Geometry is concentric: card 24px (rounded-card) → inner tile 16px
// (rounded-panel) → control 12px (rounded-control) → chip (rounded-chip).
// ============================================

export type Tone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";
export type ControlSize = "xs" | "sm" | "md" | "lg";

/** Keyboard focus, identical on every control (accent ring, offset from the surface). */
export const FOCUS_RING =
    "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** Focus for controls sitting on the brand surface (sidebar, hero). */
export const FOCUS_RING_INVERSE =
    "outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-inverse";

/** Text fields: border + ring on focus, danger on error. */
export const FIELD_BASE =
    "w-full bg-surface border border-line text-ink placeholder:text-ink-4 rounded-control shadow-2xs transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12 disabled:bg-surface-2 disabled:text-ink-4 disabled:cursor-not-allowed";
export const FIELD_ERROR = "border-danger focus:border-danger focus:ring-danger/15 hover:border-danger";

export const CONTROL_HEIGHT: Record<ControlSize, string> = {
    xs: "h-7 text-xs",
    sm: "h-8 text-[13px]",
    md: "h-10 text-sm",
    lg: "h-11 text-sm",
};

/** Soft fill + matching hairline + readable ink: badges, pills, callouts. */
export const TONE_SOFT: Record<Tone, string> = {
    neutral: "bg-surface-3 text-ink-2 border-line",
    primary: "bg-primary-50 text-primary-700 border-primary-200",
    accent: "bg-accent-50 text-accent-700 border-accent-200",
    success: "bg-success-soft text-success-ink border-success-line",
    warning: "bg-warning-soft text-warning-ink border-warning-line",
    danger: "bg-danger-soft text-danger-ink border-danger-line",
    info: "bg-info-soft text-info-ink border-info-line",
};

/** Solid fill: icon tiles, strong badges, counters. */
export const TONE_SOLID: Record<Tone, string> = {
    neutral: "bg-ink text-surface",
    primary: "bg-primary text-primary-fg",
    accent: "bg-accent text-accent-fg",
    success: "bg-success text-white",
    warning: "bg-warning text-white",
    danger: "bg-danger text-white",
    info: "bg-info text-white",
};

/** Foreground only: icons, figures, deltas. */
export const TONE_TEXT: Record<Tone, string> = {
    neutral: "text-ink-3",
    primary: "text-primary-600",
    accent: "text-accent-600",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-info",
};

/** Dots, bars, progress fills. */
export const TONE_FILL: Record<Tone, string> = {
    neutral: "bg-ink-4",
    primary: "bg-primary-600",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
};

/** Surfaces. */
export const SURFACE = {
    card: "bg-surface border border-line rounded-card shadow-card",
    cardInteractive:
        "transition-[border-color,box-shadow] duration-200 ease-snappy hover:border-line-strong hover:shadow-raised",
    panel: "bg-surface-2 border border-line rounded-panel",
    popover: "bg-surface border border-line rounded-panel shadow-overlay",
    inverse: "bg-inverse text-inverse-ink border border-inverse-line rounded-card",
} as const;

/** Uppercase micro-label above a figure ("RDV DU MOIS"). */
export const EYEBROW = "text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3";
