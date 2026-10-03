import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keyboard key ("⌘K", "Échap"). Pass several children for a combo. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <kbd
            className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong border-b-2 bg-surface px-1.5 font-mono text-3xs font-medium leading-none text-ink-2",
                className,
            )}
        >
            {children}
        </kbd>
    );
}

export default Kbd;
