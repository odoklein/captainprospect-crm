"use client";

/**
 * A `HugeiconsIcon`-shaped shim over lucide-react, the icon set the CRM already
 * ships. tool-calls-section.tsx keeps its upstream imports; no extra package.
 */

import { ChevronDown, Wrench, type LucideIcon } from "lucide-react";

export const ArrowDown01Icon: LucideIcon = ChevronDown;
export const ToolsIcon: LucideIcon = Wrench;

export interface HugeiconsIconProps {
    icon: LucideIcon;
    size?: number;
    strokeWidth?: number;
    className?: string;
}

export function HugeiconsIcon({ icon: Icon, size = 18, strokeWidth = 1.9, className }: HugeiconsIconProps) {
    return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
