"use client";

import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

interface LoadingStateProps {
    message?: string;
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function LoadingState({
    message = "Chargement…",
    className,
    size = "md",
}: LoadingStateProps) {
    const sizes = {
        sm: "size-5",
        md: "size-7",
        lg: "size-10",
    };

    return (
        <div role="status" className={cn(
            "flex items-center justify-center py-20",
            className
        )}>
            <div className="flex flex-col items-center gap-3">
                <Spinner className={cn("text-primary-600", sizes[size])} label={message} />
                <p className="text-sm text-ink-3">{message}</p>
            </div>
        </div>
    );
}

export default LoadingState;
