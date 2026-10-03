"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
type Presence = "online" | "busy" | "away" | "offline";

interface AvatarProps {
    name: string;
    /** Picture URL; falls back to initials when missing or broken. */
    src?: string | null;
    size?: AvatarSize;
    /** Rounded square (people in lists) or circle (presence, comments). */
    shape?: "square" | "circle";
    presence?: Presence;
    className?: string;
}

const SIZE: Record<AvatarSize, { box: string; text: string; radius: string; dot: string }> = {
    xs: { box: "size-6", text: "text-3xs", radius: "rounded-md", dot: "size-2" },
    sm: { box: "size-8", text: "text-2xs", radius: "rounded-[10px]", dot: "size-2.5" },
    md: { box: "size-9", text: "text-xs", radius: "rounded-xl", dot: "size-2.5" },
    lg: { box: "size-11", text: "text-sm", radius: "rounded-[14px]", dot: "size-3" },
    xl: { box: "size-16", text: "text-lg", radius: "rounded-2xl", dot: "size-3.5" },
};

// Brand-derived tints only: a clone's avatars follow its palette.
const TINTS = [
    "bg-primary-100 text-primary-800",
    "bg-accent-100 text-accent-800",
    "bg-primary-200 text-primary-900",
    "bg-accent-50 text-accent-700",
    "bg-surface-3 text-ink-2",
    "bg-primary-50 text-primary-700",
];

const PRESENCE: Record<Presence, string> = {
    online: "bg-success",
    busy: "bg-danger",
    away: "bg-warning",
    offline: "bg-ink-4",
};

export function initialsOf(name: string): string {
    return (
        name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase() || "?"
    );
}

function tintFor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return TINTS[Math.abs(hash) % TINTS.length];
}

/** Person or company avatar: picture, or initials on a stable brand tint. */
export function Avatar({ name, src, size = "md", shape = "square", presence, className }: AvatarProps) {
    const [broken, setBroken] = useState(false);
    const s = SIZE[size];
    const radius = shape === "circle" ? "rounded-full" : s.radius;
    const showImage = Boolean(src) && !broken;

    return (
        <span className={cn("relative inline-flex shrink-0", s.box, className)} title={name}>
            {showImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatars come from our API with cache-busting versions
                <img
                    src={src as string}
                    alt={name}
                    onError={() => setBroken(true)}
                    className={cn("size-full object-cover ring-1 ring-line", radius)}
                />
            ) : (
                <span
                    aria-label={name}
                    role="img"
                    className={cn("flex size-full select-none items-center justify-center font-semibold tracking-tight", radius, s.text, tintFor(name))}
                >
                    {initialsOf(name)}
                </span>
            )}
            {presence && (
                <span
                    aria-label={presence}
                    className={cn("absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface", s.dot, PRESENCE[presence])}
                />
            )}
        </span>
    );
}

/** Overlapping row of avatars with a "+n" counter. */
export function AvatarGroup({ people, max = 4, size = "sm" }: { people: { name: string; src?: string | null }[]; max?: number; size?: AvatarSize }) {
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;
    return (
        <span className="inline-flex items-center -space-x-1.5">
            {shown.map((p, i) => (
                <Avatar key={`${p.name}-${i}`} name={p.name} src={p.src} size={size} shape="circle" className="ring-2 ring-surface rounded-full" />
            ))}
            {rest > 0 && (
                <span
                    className={cn(
                        "relative inline-flex items-center justify-center rounded-full bg-surface-3 font-semibold text-ink-2 ring-2 ring-surface",
                        SIZE[size].box,
                        SIZE[size].text,
                    )}
                >
                    +{rest}
                </span>
            )}
        </span>
    );
}

export default Avatar;
