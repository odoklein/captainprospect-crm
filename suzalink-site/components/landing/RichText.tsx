import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// Tiny inline formatter for content strings: [label](/url) and **bold**. Nothing else,
// so copy stays plain text that anyone (or ChatGPT) can edit safely.

const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function RichText({ text, linkClassName }: { text: string; linkClassName?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] && m[2]) {
      const href = m[2];
      const cls =
        linkClassName ??
        "font-medium text-navy underline decoration-mint decoration-2 underline-offset-[5px] transition-colors hover:decoration-navy";
      out.push(
        href.startsWith("/") || href.startsWith("#") ? (
          <Link key={at} href={href} className={cls}>
            {m[1]}
          </Link>
        ) : (
          <a key={at} href={href} className={cls} rel="noopener" target="_blank">
            {m[1]}
          </a>
        ),
      );
    } else if (m[3]) {
      out.push(
        <strong key={at} className="font-semibold text-ink">
          {m[3]}
        </strong>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}

/** Same text without the markup, for meta tags and JSON-LD. */
export const plainText = (text: string) => text.replace(TOKEN, (_, label, _href, bold) => label ?? bold ?? "");
