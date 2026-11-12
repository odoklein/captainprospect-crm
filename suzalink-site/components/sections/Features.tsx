import type { ReactNode } from "react";
import { features } from "@/content/home";
import { Reveal } from "@/components/ui/motion";
import { Container, SectionHeader, cx } from "@/components/ui/primitives";

// 4. « Tout ce qu'il faut pour appeler plus » — bento of five small product UIs.
// The UIs are illustrations: one description for assistive tech (features.label),
// the visual details are aria-hidden. Motion is CSS only and stops with reduced motion.

const panel = "rounded-[16px] border border-line bg-white shadow-[0_18px_40px_-30px_rgba(12,31,35,.35)]";

function Card({ title, body, className, children, delay }: { title: string; body: string; className?: string; children: ReactNode; delay: number }) {
  return (
    <Reveal
      delay={delay}
      className={cx(
        "flex flex-col overflow-hidden rounded-[24px] border border-line bg-[linear-gradient(180deg,rgba(185,237,214,.28)_0%,rgba(255,255,255,.7)_42%,#fff_100%)] p-6 sm:p-7",
        className,
      )}
    >
      <h3 className="font-display-tight text-[26px] leading-tight font-normal text-ink">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
      <div aria-hidden className="mt-6 flex flex-1 flex-col justify-end">
        {children}
      </div>
    </Reveal>
  );
}

function Avatar({ initials, tone = "sand" }: { initials: string; tone?: "mint" | "sand" }) {
  return (
    <span className={cx("grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-navy", tone === "mint" ? "bg-mint" : "bg-sand")}>
      {initials}
    </span>
  );
}

function Equalizer() {
  return (
    <span className="flex h-4 items-end gap-[3px]">
      {[0, 0.25, 0.5, 0.15].map((d) => (
        <span key={d} className="animate-eq h-full w-[3px] origin-bottom rounded-full bg-navy/70" style={{ animationDelay: `-${d}s` }} />
      ))}
    </span>
  );
}

function Queue() {
  const rows = [
    { i: "PP", n: "Pierre Petit", c: "Bâtir & Co" },
    { i: "AB", n: "Alice Bernard", c: "Delta Digital" },
    { i: "LM", n: "Léa Moreau", c: "Nova Industrie" },
  ];
  return (
    <div className={cx(panel, "p-2")}>
      <div className="relative flex items-center gap-3 rounded-[12px] bg-mint/45 px-3 py-2.5">
        <span className="absolute top-2 bottom-2 left-0 w-1 rounded-full bg-navy" />
        <Avatar initials="CM" tone="mint" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">Claire Martin</span>
          <span className="block text-[12px] text-muted">Société Nordfil</span>
        </span>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-medium text-navy">En appel</span>
        <Equalizer />
      </div>
      <ul className="divide-y divide-line px-1">
        {rows.map((r) => (
          <li key={r.i} className="flex items-center gap-3 px-2 py-2.5">
            <Avatar initials={r.i} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-ink">{r.n}</span>
              <span className="block text-[12px] text-muted">{r.c}</span>
            </span>
            <span className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink/80">À appeler</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Keys() {
  const keys = ["Rappel", "Barrage secrétaire", "Non intéressé", "RDV pris", "Projet à suivre", "Géré par le siège"];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {keys.map((k, i) => {
        const on = i === 3;
        return (
          <span
            key={k}
            className={cx(
              "flex min-h-[58px] items-center justify-between gap-2 rounded-[14px] border px-3.5 py-2.5 text-[14px] leading-tight font-medium",
              on ? "border-transparent bg-mint text-navy shadow-[0_10px_24px_-14px_rgba(17,47,53,.5)]" : "border-line bg-white text-ink",
            )}
          >
            {k}
            <kbd className={cx("grid size-7 shrink-0 place-items-center rounded-[8px] border font-mono text-[12px]", on ? "border-navy/15 bg-white/70" : "border-line bg-paper")}>
              {i + 1}
            </kbd>
          </span>
        );
      })}
    </div>
  );
}

function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("size-4 text-rose", className)} fill="currentColor">
      <path d="M12 2c.5 4.8 2.7 7.4 8 8-5.3.6-7.5 3.2-8 10-.5-6.8-2.7-9.4-8-10 5.3-.6 7.5-3.2 8-8z" />
    </svg>
  );
}

function AiResult() {
  return (
    <div className={cx(panel, "overflow-hidden")}>
      <div className="bg-mint/40 px-4 pt-3.5 pb-3">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Spark /> Résultat proposé <span className="rounded-md bg-rose/25 px-1.5 py-0.5 text-[11px] font-semibold text-[#6E5300]">IA</span>
        </p>
        <p className="mt-2.5 rounded-[10px] bg-white px-3 py-2.5 text-[14px] font-medium text-ink">Rappel (interlocuteur indisponible)</p>
      </div>
      <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink/80">
        Contacté au standard. Claire Martin est en réunion jusqu&apos;en fin d&apos;après-midi. Un rappel est conseillé demain matin.
      </p>
    </div>
  );
}

function Journal() {
  const rows = [
    { t: "10:24", n: "Claire Martin", s: "RDV pris", c: "bg-navy", d: "4:21", i: "CM" },
    { t: "10:17", n: "Pierre Petit", s: "Rappel", c: "bg-mint", d: "2:14", i: "PP" },
    { t: "09:56", n: "Alice Bernard", s: "RDV pris", c: "bg-navy", d: "6:08", i: "AB" },
    { t: "09:41", n: "Léa Moreau", s: "Barrage secrétaire", c: "bg-ink/25", d: "1:37", i: "LM" },
  ];
  const bars = [5, 9, 6, 12, 8, 14, 10, 7, 13, 9, 6, 11, 8, 5, 10, 7, 12, 6, 9, 5, 8, 6, 4, 7];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex h-2.5 min-w-[180px] flex-1 overflow-hidden rounded-full bg-line">
          <span className="w-[38%] bg-navy" />
          <span className="w-[27%] bg-mint" />
          <span className="w-[15%] bg-rose" />
        </div>
        {[
          ["bg-navy", "RDV pris"],
          ["bg-mint", "Rappel"],
          ["bg-rose", "Non intéressé"],
          ["bg-line", "Autres"],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5 text-[12px] text-ink/80">
            <span className={cx("size-2.5 rounded-full", c)} /> {l}
          </span>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr]">
        <div className={cx(panel, "overflow-hidden")}>
          <div className="grid grid-cols-[48px_1fr_auto_44px] gap-3 border-b border-line bg-paper/70 px-3.5 py-2 text-[11px] font-medium tracking-wide text-muted uppercase">
            <span>Heure</span>
            <span>Prospect</span>
            <span>Durée</span>
            <span>SDR</span>
          </div>
          {rows.map((r) => (
            <div key={r.t} className="grid grid-cols-[48px_1fr_auto_44px] items-center gap-3 border-b border-line px-3.5 py-2.5 text-[13px] last:border-b-0">
              <span className="font-mono text-ink/70">{r.t}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{r.n}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <span className={cx("size-2 rounded-full", r.c)} /> {r.s}
                </span>
              </span>
              <span className="font-mono text-ink/70">{r.d}</span>
              <span className="grid size-7 place-items-center rounded-full bg-sand text-[11px] font-semibold text-navy">{r.i}</span>
            </div>
          ))}
        </div>
        <div className={cx(panel, "flex flex-col justify-center gap-3 p-4")}>
          <p className="text-[12px] font-medium text-muted">Claire Martin · 10:24</p>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-white">
              <svg viewBox="0 0 24 24" className="ml-0.5 size-4" fill="currentColor">
                <path d="M7 5v14l12-7z" />
              </svg>
            </span>
            <div className="relative flex h-10 flex-1 items-center gap-[3px]">
              {bars.map((h, i) => (
                <span key={i} className={cx("w-[3px] rounded-full", i < 9 ? "bg-navy" : "bg-navy/20")} style={{ height: `${h * 2.4}px` }} />
              ))}
              <span className="animate-scrub absolute top-0 bottom-0 w-px bg-rose" />
            </div>
          </div>
          <p className="font-mono text-[12px] text-muted">1:32 / 4:21</p>
        </div>
      </div>
    </div>
  );
}

function Portal() {
  const rdv = [
    ["Jeu. 10 oct. — 10:00", "Société Nordfil"],
    ["Jeu. 10 oct. — 14:30", "Bâtir & Co"],
    ["Ven. 11 oct. — 11:00", "Delta Digital"],
  ];
  return (
    <div className={cx(panel, "overflow-hidden")}>
      <p className="flex items-center gap-2.5 bg-mint/45 px-4 py-3 text-[15px] font-semibold text-ink">
        <svg viewBox="0 0 24 24" className="size-5 text-navy" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </svg>
        RDV de la semaine
      </p>
      <ul className="divide-y divide-line">
        {rdv.map(([d, c]) => (
          <li key={d} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-ink">{d}</span>
              <span className="block text-[12px] text-muted">{c}</span>
            </span>
            <span className="grid size-7 place-items-center rounded-full bg-mint text-navy">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Features() {
  return (
    <section id="fonctionnalites" aria-labelledby="features-title" className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeader id="features-title" eyebrow={features.eyebrow} title={features.title} align="center" />
        </Reveal>
        <p className="sr-only">{features.label}</p>
        <div className="mt-14 grid gap-4 sm:mt-16 md:grid-cols-2 xl:grid-cols-12 xl:gap-5">
          <Card {...features.queue} className="xl:col-span-4" delay={0}>
            <Queue />
          </Card>
          <Card {...features.keys} className="xl:col-span-4" delay={0.06}>
            <Keys />
          </Card>
          <Card {...features.ai} className="md:col-span-2 xl:col-span-4" delay={0.12}>
            <AiResult />
          </Card>
          <Card {...features.journal} className="md:col-span-2 xl:col-span-7" delay={0}>
            <Journal />
          </Card>
          <Card {...features.portal} className="md:col-span-2 xl:col-span-5" delay={0.06}>
            <Portal />
          </Card>
        </div>
      </Container>
    </section>
  );
}
