import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/shadcn/input";

/**
 * Grows with its content (`field-sizing: content`, Chromium/Safari 26+); cap it
 * with `max-h-*` and it scrolls past that. Firefox keeps `rows` — pass `rows`
 * or a `min-h-*` if the resting height matters there.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(fieldClassName, "flex field-sizing-content min-h-16 resize-none px-3 py-2 text-sm leading-relaxed", className)}
            {...props}
        />
    );
}

export { Textarea };
