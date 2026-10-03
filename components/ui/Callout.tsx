import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, type LucideIcon } from "lucide-react";
import { AiMark } from "./AiMark";
import { cn } from "@/lib/utils";
import { TONE_SOFT, TONE_TEXT, type Tone } from "./recipes";

type CalloutTone = Extract<Tone, "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info">;

const DEFAULT_ICON: Record<CalloutTone, LucideIcon> = {
    neutral: Info,
    primary: Info,
    accent: AiMark,
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: OctagonAlert,
    info: Info,
};

interface CalloutProps {
    tone?: CalloutTone;
    title?: ReactNode;
    children?: ReactNode;
    icon?: LucideIcon | null;
    /** Buttons or links on the right (or below on narrow screens). */
    action?: ReactNode;
    className?: string;
}

/** Inline message inside a page or form: context, warning, result of an action. */
export function Callout({ tone = "info", title, children, icon, action, className }: CalloutProps) {
    const Icon = icon === null ? null : (icon ?? DEFAULT_ICON[tone]);
    return (
        <div
            role={tone === "danger" || tone === "warning" ? "alert" : "status"}
            className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-panel border px-4 py-3", TONE_SOFT[tone], className)}
        >
            {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[tone])} aria-hidden />}
            <div className="min-w-0 flex-1 text-sm leading-relaxed">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
            </div>
            {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
    );
}

export default Callout;
