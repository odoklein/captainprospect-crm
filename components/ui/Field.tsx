import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps {
    label?: ReactNode;
    /** id of the control, so the label focuses it. */
    htmlFor?: string;
    hint?: ReactNode;
    error?: ReactNode;
    required?: boolean;
    /** Right side of the label row (character count, "Optionnel", a link). */
    aside?: ReactNode;
    className?: string;
    children: ReactNode;
}

/**
 * Label + control + hint/error, with one spacing rhythm for every form.
 * Input, Textarea and Select already render their own label; wrap anything
 * else (date pickers, chip groups, custom selects) in Field.
 */
export function Field({ label, htmlFor, hint, error, required, aside, className, children }: FieldProps) {
    return (
        <div className={cn("w-full", className)}>
            {(label || aside) && (
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    {label && (
                        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
                            {label}
                            {required && (
                                <span className="ml-0.5 text-accent" aria-hidden>
                                    *
                                </span>
                            )}
                        </label>
                    )}
                    {aside && <span className="text-xs text-ink-3">{aside}</span>}
                </div>
            )}
            {children}
            <FieldMessage hint={hint} error={error} />
        </div>
    );
}

/** The line under a control: the error when there is one, else the hint. */
export function FieldMessage({ hint, error, id }: { hint?: ReactNode; error?: ReactNode; id?: string }) {
    if (error) {
        return (
            <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-ink">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
                {error}
            </p>
        );
    }
    if (hint) {
        return (
            <p id={id} className="mt-1.5 text-xs leading-relaxed text-ink-3">
                {hint}
            </p>
        );
    }
    return null;
}

export default Field;
