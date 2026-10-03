"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
    label?: ReactNode;
    description?: ReactNode;
    /** Mixed state for "select all" when only some rows are selected. */
    indeterminate?: boolean;
}

/**
 * Native checkbox (keyboard, forms and screen readers for free) drawn in the
 * brand: 18px box, 6px radius, primary fill when checked.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ label, description, indeterminate, className, id: idProp, disabled, ...props }, ref) => {
        const autoId = useId();
        const id = idProp ?? autoId;
        const inner = useRef<HTMLInputElement>(null);
        useImperativeHandle(ref, () => inner.current as HTMLInputElement);
        useEffect(() => {
            if (inner.current) inner.current.indeterminate = Boolean(indeterminate);
        }, [indeterminate]);

        const box = (
            <span className="relative inline-flex size-[18px] shrink-0">
                <input
                    ref={inner}
                    id={id}
                    type="checkbox"
                    disabled={disabled}
                    aria-describedby={description ? `${id}-desc` : undefined}
                    className={cn(
                        "peer size-[18px] cursor-pointer appearance-none rounded-[6px] border border-line-strong bg-surface shadow-2xs transition-[background-color,border-color] duration-150",
                        "hover:border-primary-400 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary",
                        "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-45",
                    )}
                    {...props}
                />
                <Check
                    aria-hidden
                    strokeWidth={3}
                    className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-fg opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
                />
                <Minus
                    aria-hidden
                    strokeWidth={3}
                    className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-fg opacity-0 peer-indeterminate:opacity-100"
                />
            </span>
        );

        if (!label) return <span className={cn("inline-flex", className)}>{box}</span>;

        return (
            <div className={cn("flex items-start gap-2.5", className)}>
                <span className="pt-px">{box}</span>
                <div className="min-w-0">
                    <label htmlFor={id} className={cn("text-sm font-medium text-ink", !disabled && "cursor-pointer")}>
                        {label}
                    </label>
                    {description && (
                        <p id={`${id}-desc`} className="mt-0.5 text-xs leading-relaxed text-ink-3">
                            {description}
                        </p>
                    )}
                </div>
            </div>
        );
    },
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
