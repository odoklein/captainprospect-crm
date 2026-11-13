"use client";

// Document-language primitives for the manager « Espace clients ».
// Thin wrappers over the cw-* classes in app/manager/clients/workspace.css so
// views, drawers and dialogs stop repeating class strings. Colours come only
// from --ds-* through those classes: never add Tailwind colour utilities here.

import { forwardRef, type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

function cx(...parts: (string | false | null | undefined)[]) {
    return parts.filter(Boolean).join(" ");
}

// ── Section ──────────────────────────────────────────────────────────────────

export function Section({ id, title, count, sub, actions, children, className, headingRef, focusKey }: {
    id?: string;
    title: ReactNode;
    count?: ReactNode;
    sub?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
    className?: string;
    headingRef?: React.Ref<HTMLHeadingElement>;
    focusKey?: string;
}) {
    const titleId = id ? `${id}-title` : undefined;
    return (
        <section id={id} className={cx("cw-section", className)} aria-labelledby={titleId}>
            <div className="cw-section-head">
                <h2 id={titleId} ref={headingRef} tabIndex={focusKey ? -1 : undefined} data-focus-key={focusKey}>
                    {title}{count !== undefined && count !== null && <> <small>{count}</small></>}
                </h2>
                {actions && <div className="cw-actions">{actions}</div>}
            </div>
            {sub && <p className="cw-section-sub">{sub}</p>}
            {children}
        </section>
    );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export function Rows({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
    return <ul className={cx("cw-rows", className)} aria-label={label}>{children}</ul>;
}

const ROW_ICON_TONE: Record<Tone, string | undefined> = { success: "done", warning: "todo", danger: "danger", info: "wait", neutral: undefined };

/** One line: icon, title + meta, side (figures, pill, actions). */
export function Row({ icon, iconTone = "neutral", title, meta, side, onOpen, href, className, focusKey, titleAttr }: {
    icon?: ReactNode;
    iconTone?: Tone;
    title: ReactNode;
    meta?: ReactNode;
    side?: ReactNode;
    /** Makes the title a button. */
    onOpen?: () => void;
    /** Makes the title a link (preferred for navigation: open in new tab works). */
    href?: string;
    className?: string;
    focusKey?: string;
    titleAttr?: string;
}) {
    const titleNode = href
        ? <a className="cw-row-title" href={href} data-focus-key={focusKey} title={titleAttr} onClick={onOpen ? (event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            onOpen();
        } : undefined}>{title}</a>
        : onOpen
            ? <button type="button" className="cw-row-title" onClick={onOpen} data-focus-key={focusKey} title={titleAttr}>{title}</button>
            : <strong title={titleAttr}>{title}</strong>;
    return (
        <li className={cx("cw-row", className)}>
            <span className="cw-row-icon" data-tone={ROW_ICON_TONE[iconTone]} aria-hidden>{icon}</span>
            <div className="cw-row-main">
                {titleNode}
                {meta && <small>{meta}</small>}
            </div>
            <div className="cw-row-side">{side}</div>
        </li>
    );
}

// ── Properties ───────────────────────────────────────────────────────────────

export function Props({ items, className }: { items: { label: ReactNode; value: ReactNode; figures?: boolean; key?: string }[]; className?: string }) {
    return (
        <dl className={cx("cw-props", className)}>
            {items.map((item, index) => (
                <div key={item.key ?? index}>
                    <dt>{item.label}</dt>
                    <dd className={item.figures ? "cw-figures" : undefined}>{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

export function RailSection({ title, count, children }: { title: ReactNode; count?: ReactNode; children: ReactNode }) {
    return (
        <section className="cw-rail-section">
            <h2 className="cw-rail-title">{title}{count !== undefined && count !== null && <> <small>{count}</small></>}</h2>
            {children}
        </section>
    );
}

// ── Pill (status: always text + tone, never colour alone) ────────────────────

export function Pill({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
    return <span className="cw-pill" data-tone={tone === "neutral" ? undefined : tone} title={title}><i />{children}</span>;
}

// ── Button ───────────────────────────────────────────────────────────────────

export type ButtonVariant = "default" | "primary" | "quiet" | "danger";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    icon?: boolean;
    loading?: boolean;
}>(function Button({ variant = "default", size = "md", icon, loading, className, children, disabled, type = "button", ...rest }, ref) {
    return (
        <button
            ref={ref}
            type={type}
            className={cx("cw-button", variant !== "default" && `cw-${variant}`, icon && "cw-icon-button", className)}
            data-size={size === "sm" ? "sm" : undefined}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...rest}
        >
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
        </button>
    );
});

export function TextButton({ className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button type={type} className={cx("cw-text-button", className)} {...rest} />;
}

// ── Save state ───────────────────────────────────────────────────────────────

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function SaveState({ status, onRetry, errorText = "Échec de l’enregistrement" }: { status: SaveStatus; onRetry?: () => void; errorText?: string }) {
    return (
        <span className="cw-save-state" role="status" aria-live="polite" data-state={status === "idle" || status === "saving" ? undefined : status}>
            {status === "dirty" && "Modifications non enregistrées"}
            {status === "saving" && <><Loader2 className="animate-spin" aria-hidden />Enregistrement…</>}
            {status === "saved" && <><Check aria-hidden />Enregistré</>}
            {status === "error" && <><AlertTriangle aria-hidden />{errorText}{onRetry && <> · <button type="button" onClick={onRetry}>Réessayer</button></>}</>}
        </span>
    );
}

// ── Loading / empty / error ──────────────────────────────────────────────────

/** Placeholder lines while a section loads; never fake figures. */
export function SkeletonRows({ rows = 3, label = "Chargement…" }: { rows?: number; label?: string }) {
    return (
        <div className="cw-skeleton" role="status" aria-label={label}>
            {Array.from({ length: rows }, (_, index) => <span key={index} className="cw-skeleton-line" />)}
        </div>
    );
}

export function SkeletonDoc({ label = "Chargement…" }: { label?: string }) {
    return (
        <div className="cw-skeleton cw-skeleton-doc" role="status" aria-label={label}>
            <span className="cw-skeleton-line" data-size="title" />
            <span className="cw-skeleton-line" data-size="lede" />
            <span className="cw-skeleton-block" />
            <span className="cw-skeleton-line" />
            <span className="cw-skeleton-line" />
            <span className="cw-skeleton-line" />
        </div>
    );
}

export function ErrorState({ title = "Impossible de charger", message, onRetry }: { title?: string; message?: ReactNode; onRetry?: () => void }) {
    return (
        <div className="cw-empty" role="alert">
            <AlertTriangle aria-hidden />
            <strong>{title}</strong>
            {message && <p>{message}</p>}
            {onRetry && <Button size="sm" onClick={onRetry}><RefreshCw aria-hidden /> Réessayer</Button>}
        </div>
    );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
    return (
        <div className="cw-empty">
            {icon}
            <strong>{title}</strong>
            {children && <p>{children}</p>}
            {action}
        </div>
    );
}

export function EmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
    return <p className="cw-empty-line"><span>{children}</span>{action}</p>;
}

export function Hint({ children, ...rest }: ComponentPropsWithoutRef<"p">) {
    return <p className="cw-hint" {...rest}>{children}</p>;
}
