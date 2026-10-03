// CRM utility functions
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know the design-system tokens (app/globals.css), or it
// can't tell that `rounded-card` and `rounded-xl` conflict.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card", "panel", "control", "chip"],
      shadow: ["card", "raised", "overlay", "primary"],
      text: ["2xs", "3xs"],
      font: ["display"],
      ease: ["snappy", "emphasized"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Completeness status helpers
export type CompletenessStatus = "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";

export function getStatusColor(status: CompletenessStatus): string {
  const colors = {
    INCOMPLETE: "text-red-500",
    PARTIAL: "text-orange-500",
    ACTIONABLE: "text-green-500",
  };
  return colors[status];
}

// Avatar helpers — stable color per id, used wherever we render initials avatars
// (commercial/interlocuteur lists, staffing dashboard, etc.)
const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-cyan-100 text-cyan-700",
];

export function avatarColorForId(id: string): string {
  const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
