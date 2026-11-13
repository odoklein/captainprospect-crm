// Building blocks for the HTML/CSS product mockups. Purely visual: every mockup
// root has role="img" + aria-label, so assistive tech reads one description, not the fake data.
import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

export function MockRoot({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="img" aria-label={label} className={cx("select-none text-left font-sans text-[12px] leading-snug text-ink", className)}>
      {children}
    </div>
  );
}

export function MockWindow({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cx("overflow-hidden rounded-[18px] border border-line bg-white shadow-[0_1px_0_rgba(15,18,34,.04),0_24px_60px_-28px_rgba(15,18,34,.35)]", className)}>
      <div className="flex items-center gap-3 border-b border-line bg-[#FBFAF7] px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#E4E1DA]" />
          <span className="size-2.5 rounded-full bg-[#E4E1DA]" />
          <span className="size-2.5 rounded-full bg-[#E4E1DA]" />
        </div>
        <p className="min-w-0 truncate text-[11px] font-medium text-muted">{title}</p>
        {right ? <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function Avatar({ initials, tone = "navy", size = "md" }: { initials: string; tone?: "navy" | "rose" | "sand" | "light"; size?: "sm" | "md" | "lg" }) {
  const tones = {
    light: "bg-white text-navy",
    navy: "bg-navy/10 text-navy",
    rose: "bg-rose/12 text-[#6E5300]",
    sand: "bg-sand text-ink/70",
  };
  const sizes = { sm: "size-6 text-[9px]", md: "size-8 text-[10.5px]", lg: "size-11 text-[13px]" };
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full font-semibold", tones[tone], sizes[size])}>{initials}</span>
  );
}

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "rose" | "ok" | "navy" | "warn" | "dark";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink/[.05] text-ink/70",
    rose: "bg-rose/10 text-[#6E5300]",
    ok: "bg-[#1F7A4D]/10 text-[#1F6B44]",
    navy: "bg-navy/10 text-navy",
    warn: "bg-[#B7791F]/12 text-[#7A4F0E]",
    dark: "bg-white/10 text-white/85",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={cx(
        "inline-grid min-w-[18px] place-items-center rounded-[5px] border px-1 font-mono text-[9.5px] leading-[16px]",
        dark ? "border-white/25 text-white/80" : "border-ink/15 bg-white text-ink/60",
      )}
    >
      {children}
    </span>
  );
}

/** A fake button (not focusable: mockups are illustrations). */
export function MockButton({
  children,
  variant = "outline",
  className,
}: {
  children: ReactNode;
  variant?: "outline" | "navy" | "rose" | "ghost-dark";
  className?: string;
}) {
  const variants = {
    outline: "border border-line bg-white text-ink",
    navy: "bg-navy text-white",
    rose: "border border-rose/35 bg-rose/[.07] text-[#6E5300]",
    "ghost-dark": "border border-white/15 bg-white/5 text-white",
  };
  return (
    <span className={cx("inline-flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}

export function Waveform({ bars = 42, played = 0.4, dark = false, className }: { bars?: number; played?: number; dark?: boolean; className?: string }) {
  // Deterministic pseudo-random heights so server and client render the same thing.
  const heights = Array.from({ length: bars }, (_, i) => 22 + Math.round(Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.43) * 0.4) * 78));
  return (
    <div className={cx("flex h-7 items-center gap-[2px]", className)} aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={cx(
            "w-[3px] rounded-full",
            i / bars < played ? "bg-rose" : dark ? "bg-white/25" : "bg-ink/15",
          )}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
