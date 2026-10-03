import { cn } from "@/lib/utils";

// ============================================
// SKELETON LOADER COMPONENTS
// ============================================

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "bg-surface-3 rounded-md motion-safe:animate-pulse",
                className
            )}
        />
    );
}

// ============================================
// TEXT SKELETON
// ============================================

interface TextSkeletonProps {
    lines?: number;
    className?: string;
}

export function TextSkeleton({ lines = 3, className }: TextSkeletonProps) {
    return (
        <div className={cn("space-y-2", className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className={cn(
                        "h-4",
                        i === lines - 1 ? "w-3/4" : "w-full"
                    )}
                />
            ))}
        </div>
    );
}

// ============================================
// CARD SKELETON
// ============================================

interface CardSkeletonProps {
    hasHeader?: boolean;
    hasImage?: boolean;
    lines?: number;
    className?: string;
}

export function CardSkeleton({
    hasHeader = true,
    hasImage = false,
    lines = 2,
    className,
}: CardSkeletonProps) {
    return (
        <div
            className={cn(
                "p-6 bg-surface border border-line rounded-2xl shadow-sm",
                className
            )}
        >
            {hasImage && (
                <Skeleton className="w-full h-40 mb-4 rounded-xl" />
            )}
            {hasHeader && (
                <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
            )}
            <TextSkeleton lines={lines} />
        </div>
    );
}

// ============================================
// TABLE SKELETON
// ============================================

interface TableSkeletonProps {
    columns?: number;
    rows?: number;
    className?: string;
}

export function TableSkeleton({
    columns = 4,
    rows = 5,
    className,
}: TableSkeletonProps) {
    return (
        <div className={cn("overflow-hidden rounded-xl border border-line bg-surface", className)}>
            {/* Header */}
            <div className="flex gap-4 p-4 bg-surface-2 border-b border-line">
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div
                    key={rowIndex}
                    className="flex gap-4 p-4 border-t border-line-subtle"
                >
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <Skeleton key={colIndex} className="h-4 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ============================================
// STAT CARD SKELETON
// ============================================

export function StatCardSkeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "p-6 bg-surface border border-line rounded-2xl shadow-sm",
                className
            )}
        >
            <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="w-12 h-12 rounded-xl" />
            </div>
        </div>
    );
}

// ============================================
// LIST SKELETON
// ============================================

interface ListSkeletonProps {
    items?: number;
    hasAvatar?: boolean;
    className?: string;
}

export function ListSkeleton({
    items = 3,
    hasAvatar = true,
    className,
}: ListSkeletonProps) {
    return (
        <div className={cn("space-y-4", className)}>
            {Array.from({ length: items }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-surface-2 rounded-xl">
                    {hasAvatar && <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />}
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default Skeleton;
