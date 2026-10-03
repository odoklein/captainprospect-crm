"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { FIELD_BASE, FIELD_ERROR } from "./recipes";
import { Field } from "./Field";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    hint?: string;
    error?: string;
    /** Shows "n / maxLength" next to the label when maxLength is set. */
    showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ label, hint, error, showCount, className, id: idProp, required, maxLength, value, rows = 4, ...props }, ref) => {
        const autoId = useId();
        const id = idProp ?? autoId;
        const length = typeof value === "string" ? value.length : undefined;
        return (
            <Field
                label={label}
                htmlFor={id}
                hint={hint}
                error={error}
                required={required}
                aside={showCount && maxLength && length !== undefined ? `${length} / ${maxLength}` : undefined}
            >
                <textarea
                    ref={ref}
                    id={id}
                    rows={rows}
                    required={required}
                    maxLength={maxLength}
                    value={value}
                    aria-invalid={Boolean(error) || undefined}
                    className={cn(FIELD_BASE, "min-h-20 resize-y px-3.5 py-2.5 text-sm leading-relaxed", error && FIELD_ERROR, className)}
                    {...props}
                />
            </Field>
        );
    },
);

Textarea.displayName = "Textarea";

export default Textarea;
