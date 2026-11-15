import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "./Icon";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/**
 * Section label, set like a line of the call log: mono capitals, optionally preceded by an
 * entry number. No bullet: the yellow is kept for live states (ringing, booked).
 */
export function Eyebrow({
  children,
  tone = "light",
  index,
  className,
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  /** Entry number shown before the label ("02"). */
  index?: number;
  className?: string;
}) {
  return (
    <p className={cx("eyebrow flex items-baseline gap-3", tone === "dark" ? "text-white/75" : "text-muted", className)}>
      {index ? (
        <span aria-hidden className={cx("tabular-nums", tone === "dark" ? "text-white/45" : "text-ink/40")}>
          {String(index).padStart(2, "0")}
        </span>
      ) : null}
      {children}
    </p>
  );
}

type ButtonVariant = "primary" | "ghost" | "light" | "ghost-light";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white hover:bg-navy-deep",
  ghost: "border border-ink/15 text-ink hover:border-ink/40 hover:bg-white",
  light: "bg-paper text-navy hover:bg-white",
  "ghost-light": "border border-white/30 text-white hover:border-white/70 hover:bg-white/5",
};

/** Pill button rendered as a link (every action on the site navigates). */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  arrow = false,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  arrow?: boolean;
  className?: string;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const sizes = { sm: "h-10 px-4 text-sm", md: "h-12 px-6 text-[15px]", lg: "h-14 px-7 text-base" };
  return (
    <Link
      href={href}
      className={cx(
        "group inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[color,background-color,border-color,transform,translate,scale,rotate,box-shadow] duration-150 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.96] hover:shadow-sm",
        sizes[size],
        buttonStyles[variant],
        arrow && "pr-2.5",
        className,
      )}
      {...rest}
    >
      {children}
      {arrow ? (
        <span
          aria-hidden
          className={cx(
            "ml-1 grid size-8 place-items-center rounded-full transition-transform duration-200 group-hover:translate-x-0.5",
            variant === "primary" ? "bg-rose text-navy" : variant === "light" ? "bg-navy text-white" : "bg-ink/5",
          )}
        >
          <Icon name="arrowRight" className="size-4" />
        </span>
      ) : null}
    </Link>
  );
}

/** Text link with a trailing arrow ("Lire →"). */
export function ArrowLink({
  href,
  children,
  tone = "light",
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "group inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline",
        tone === "dark" ? "text-white" : "text-navy",
        className,
      )}
    >
      {children}
      <Icon name="arrowRight" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/**
 * Section heading. Three layouts, so that sections do not all open the same way:
 * - "stack" (default): label, title, text, action, one under the other (narrow columns);
 * - "split": title on the left, text and action on the right, bottom-aligned (uses the full width);
 * - "rail": a hairline, the numbered label in a left rail and the title beside it, like an
 *   entry of the call log (inside pages).
 * The label is optional: leave it out when it only repeats the title.
 * The section action is a plain button: the arrow pill is kept for the page's main action.
 */
export function SectionHeader({
  id,
  eyebrow,
  index,
  title,
  subtitle,
  action,
  align = "left",
  layout = "stack",
  tone = "light",
  as: Heading = "h2",
  actionVariant,
  className,
}: {
  id?: string;
  eyebrow?: string;
  index?: number;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: { label: string; href: string };
  align?: "left" | "center";
  layout?: "stack" | "split" | "rail";
  tone?: "light" | "dark";
  as?: "h1" | "h2";
  actionVariant?: ButtonVariant;
  className?: string;
}) {
  const centered = align === "center" && layout === "stack";
  const dark = tone === "dark";
  const label = eyebrow ? (
    <Eyebrow tone={tone} index={index}>
      {eyebrow}
    </Eyebrow>
  ) : null;
  const heading = (
    <Heading
      id={id}
      className={cx(
        "font-display-tight text-[clamp(2.125rem,4.4vw,3.5rem)] leading-[1.04] font-light",
        dark ? "text-white" : "text-ink",
        layout === "stack" ? (centered ? "max-w-[20ch]" : "max-w-[18ch]") : "max-w-[22ch]",
      )}
    >
      {title}
    </Heading>
  );
  const text = subtitle ? (
    <p className={cx("max-w-[54ch] text-[17px] leading-relaxed sm:text-lg", dark ? "text-white/75" : "text-muted")}>{subtitle}</p>
  ) : null;
  const button = action ? (
    <div>
      <ButtonLink href={action.href} variant={actionVariant ?? (dark ? "ghost-light" : "ghost")}>
        {action.label}
      </ButtonLink>
    </div>
  ) : null;

  if (layout === "rail") {
    return (
      <div className={cx("grid gap-x-10 gap-y-5 border-t pt-6 lg:grid-cols-[200px_minmax(0,1fr)]", dark ? "border-white/20" : "border-ink/15", className)}>
        <div className="lg:pt-2">{label}</div>
        <div className="flex flex-col gap-5">
          {heading}
          {text}
          {button}
        </div>
      </div>
    );
  }

  if (layout === "split") {
    return (
      <div className={cx("grid gap-x-16 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-end", className)}>
        <div className="flex flex-col gap-5">
          {label}
          {heading}
        </div>
        {text || button ? (
          <div className="flex flex-col gap-5 lg:pb-1.5">
            {text}
            {button}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col gap-5", centered && "mx-auto items-center text-center", className)}>
      {label}
      {heading}
      {text}
      {button}
    </div>
  );
}

export function PlaceholderBadge({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <span
      className={cx(
        "eyebrow inline-flex items-center rounded-full border border-dashed px-2.5 py-1",
        tone === "dark" ? "border-white/40 text-white/80" : "border-muted/50 text-muted",
      )}
    >
      {children}
    </span>
  );
}
