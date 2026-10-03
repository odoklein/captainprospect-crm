"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, useId } from "react";
import { FIELD_BASE, FIELD_ERROR } from "./recipes";
import { FieldMessage } from "./Field";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
    label?: string;
    error?: string;
    /** Helper line under the field (hidden while an error shows). */
    hint?: string;
    icon?: React.ReactNode;
    endIcon?: React.ReactNode;
    size?: "sm" | "md" | "lg";
}

const SIZES = {
    sm: "h-9 px-3 text-[13px]",
    md: "h-10 px-3.5 text-sm",
    lg: "h-11 px-4 text-sm",
};

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, hint, icon, endIcon, id: idProp, size = "md", required, ...props }, ref) => {
        const autoId = useId();
        const id = idProp ?? autoId;
        const messageId = error || hint ? `${id}-msg` : undefined;
        return (
            <div className="w-full">
                {label && (
                    <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">
                        {label}
                        {required && (
                            <span className="ml-0.5 text-accent" aria-hidden>
                                *
                            </span>
                        )}
                    </label>
                )}
                <div className="relative">
                    {icon && (
                        <div className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-ink-4">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={id}
                        required={required}
                        aria-invalid={Boolean(error) || undefined}
                        aria-describedby={messageId}
                        className={cn(
                            FIELD_BASE,
                            SIZES[size],
                            "text-ink! placeholder:text-ink-4!",
                            error && FIELD_ERROR,
                            icon && "pl-10",
                            endIcon && "pr-11",
                            className
                        )}
                        {...props}
                    />
                    {endIcon && (
                        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-ink-3">
                            {endIcon}
                        </div>
                    )}
                </div>
                <FieldMessage id={messageId} error={error} hint={hint} />
            </div>
        );
    }
);

Input.displayName = "Input";

export { Input };
export default Input;
