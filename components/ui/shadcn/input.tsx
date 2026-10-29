import * as React from "react";

import { cn } from "@/lib/utils";

/** Shared field look (Input, Textarea): FIELD_BASE of components/ui/recipes, on focus-visible. */
const fieldClassName = cn(
    "w-full min-w-0 rounded-control border border-line bg-surface text-ink shadow-2xs outline-none",
    "placeholder:text-ink-4 selection:bg-accent-100 selection:text-ink",
    "transition-[border-color,box-shadow] duration-150 ease-snappy hover:border-line-strong",
    "focus-visible:border-primary-400 focus-visible:ring-4 focus-visible:ring-primary-500/12",
    "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-4",
    "aria-invalid:border-danger aria-invalid:hover:border-danger aria-invalid:focus-visible:ring-danger/15",
);

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
    return (
        <input
            type={type}
            data-slot="input"
            className={cn(
                fieldClassName,
                "flex h-9 px-3 py-1 text-sm",
                "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-ink",
                className,
            )}
            {...props}
        />
    );
}

export { Input, fieldClassName };
