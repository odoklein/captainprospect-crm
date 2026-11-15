import type { ReactNode } from "react";
import { features } from "@/content/home";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/motion";
import { Container, SectionHeader, cx } from "@/components/ui/primitives";
import { FeatureMarker, FeatureTrack } from "./FeatureTrack";

// « Ce que fait Suzalink pendant un appel » : the five features of the CRM as the five
// moments of one call, on a timeline. Each moment pairs a short text with its screen.
// The screens are illustrations (sample data): one description for assistive tech
// (features.label), the screens themselves are aria-hidden.

const panel = "rounded-[18px] border border-line bg-white shadow-[0_1px_0_rgba(12,31,35,.04),0_24px_48px_-36px_rgba(12,31,35,.5)]";
const label = "font-mono text-[10.5px] tracking-[0.08em] text-muted uppercase";

function Initials({ children, tone = "sand" }: { children: string; tone?: "sand" | "navy" }) {
  return (
    <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", tone === "navy" ? "bg-navy text-white" : "bg-sand text-navy")}>
      {children}
    </span>
  );
}

function Key({ n, dark }: { n: number | string; dark?: boolean }) {
  return (
    <kbd className={cx("grid h-6 min-w-6 shrink-0 place-items-center rounded-[6px] border px-1 font-mono text-[11px]", dark ? "border-white/25 text-white/80" : "border-line bg-paper text-ink/65")}>
      {n}
    </kbd>
  );
}

/* ───────── 1. Avant l'appel : la file ───────── */
function Queue() {
  const rows = [
    { i: "CM", n: "Claire Martin", c: "Nordfil", s: "À appeler", active: true },
    { i: "JB", n: "Julien Bernard", c: "Batimex", s: "Rappel 14:30" },
    { i: "SL", n: "Sophie Laurent", c: "Optilog", s: "2e tentative" },
    { i: "AR", n: "Antoine Roux", c: "Veldis", s: "À appeler" },
  ];
  return (
    <div className={cx(panel, "overflow-hidden")}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[14px] font-semibold text-ink">File du jour</p>
        <p className="font-mono text-[11px] text-muted tabular-nums">42 restants</p>
      </div>
      <ul className="p-2">
        {rows.map((r) => (
          <li key={r.i} className={cx("relative flex items-center gap-3 rounded-[12px] px-3 py-2.5", r.active && "bg-paper")}>
            {r.active ? <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-rose" /> : null}
            <Initials tone={r.active ? "navy" : "sand"}>{r.i}</Initials>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink">{r.n}</span>
              <span className="block truncate text-[12px] text-muted">{r.c}</span>
            </span>
            <span className={cx("text-[12px] whitespace-nowrap", r.active ? "font-medium text-navy" : "text-muted")}>{r.s}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-navy px-4 py-3 text-[14px] font-medium text-white">
        Appel suivant
        <Key n="Espace" dark />
      </div>
    </div>
  );
}

/* ───────── 2. Pendant : le résultat en une touche ───────── */
function Keys() {
  const keys = ["RDV pris", "Rappel", "Barrage secrétaire", "Pas intéressé", "Messagerie", "Mauvais numéro"];
  return (
    <div className={cx(panel, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-semibold text-ink">Claire Martin · Nordfil</p>
        <span className="flex shrink-0 items-center gap-2 rounded-full bg-navy py-1.5 pr-3 pl-2.5 font-mono text-[11px] text-white tabular-nums">
          <span className="size-2 rounded-full bg-rose" />
          04:21
        </span>
      </div>
      <p className={cx(label, "mt-4 mb-2")}>Résultat</p>
      <div className="grid grid-cols-2 gap-2">
        {keys.map((k, i) => {
          const on = i === 0;
          return (
            <span
              key={k}
              className={cx(
                "flex min-h-[48px] items-center justify-between gap-2 rounded-[12px] border px-3 py-2 text-[13.5px] leading-tight font-medium",
                on ? "border-navy bg-navy text-white" : "border-line bg-white text-ink",
              )}
            >
              {k}
              <Key n={i + 1} dark={on} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── 3. Juste après : le résumé de l'IA ───────── */
function Summary() {
  return (
    <div className={cx(panel, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Icon name="sparkle" className="size-4 text-navy" />
          Résumé de l&apos;appel
        </p>
        <span className="rounded-full border border-navy/20 px-2 py-0.5 font-mono text-[10.5px] text-navy">Proposé par l&apos;IA</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13.5px] leading-relaxed text-ink/85">
          Contactée en direct. Claire Martin veut centraliser les appels de l&apos;équipe avant le T1 et demande une présentation au directeur commercial.
        </p>
        <div className="rounded-[12px] bg-mint/45 px-3.5 py-3">
          <p className={label}>Résultat proposé</p>
          <p className="mt-1 text-[14px] font-semibold text-ink">RDV pris · jeudi 10:00</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px] font-medium">
          <span className="rounded-[10px] bg-navy py-2.5 text-center text-white">Confirmer</span>
          <span className="rounded-[10px] border border-line py-2.5 text-center text-ink">Corriger</span>
        </div>
      </div>
    </div>
  );
}

/* ───────── 4. Le soir : le journal ───────── */
function Journal() {
  const rows = [
    { t: "17:42", n: "Claire Martin", s: "RDV pris", c: "bg-navy", d: "4:21", i: "CM" },
    { t: "17:31", n: "Julien Bernard", s: "Rappel", c: "bg-mint-strong", d: "2:14", i: "JB" },
    { t: "17:18", n: "Sophie Laurent", s: "Messagerie", c: "bg-ink/25", d: "0:38", i: "SL" },
    { t: "16:57", n: "Antoine Roux", s: "Barrage secrétaire", c: "bg-ink/25", d: "1:37", i: "AR" },
  ];
  const bars = [5, 9, 6, 12, 8, 14, 10, 7, 13, 9, 6, 11, 8, 5, 10, 7, 12, 6, 9, 5, 8, 6, 4, 7, 9, 11, 6, 8];
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className={cx(panel, "overflow-hidden")}>
        <div className="grid grid-cols-[52px_minmax(0,1fr)_44px_32px] gap-3 border-b border-line bg-paper px-4 py-2.5">
          <span className={label}>Heure</span>
          <span className={label}>Prospect</span>
          <span className={label}>Durée</span>
          <span className={cx(label, "sr-only")}>SDR</span>
        </div>
        {rows.map((r, n) => (
          <div key={r.t} className={cx("grid grid-cols-[52px_minmax(0,1fr)_44px_32px] items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-b-0", n === 0 && "bg-mint/25")}>
            <span className="font-mono text-ink/65 tabular-nums">{r.t}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{r.n}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                <span className={cx("size-1.5 rounded-full", r.c)} /> {r.s}
              </span>
            </span>
            <span className="font-mono text-ink/65 tabular-nums">{r.d}</span>
            <Initials>{r.i}</Initials>
          </div>
        ))}
      </div>
      <div className={cx(panel, "flex flex-col justify-center gap-5 p-5")}>
        <div>
          <p className={label}>Écoute</p>
          <p className="mt-1 text-[14px] font-semibold text-ink">Claire Martin · 17:42</p>
          <p className="mt-0.5 text-[12px] text-muted">RDV pris · jeudi 10:00</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-white">
            <Icon name="play" className="ml-0.5 size-4" />
          </span>
          <div className="relative flex h-10 flex-1 items-center gap-[3px] overflow-hidden">
            {bars.map((h, i) => (
              <span key={i} className={cx("w-[3px] shrink-0 rounded-full", i < 11 ? "bg-navy" : "bg-navy/20")} style={{ height: `${h * 2.4}px` }} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] text-muted tabular-nums">
          <span>1:32 / 4:21</span>
          <span>Enregistré</span>
        </div>
      </div>
    </div>
  );
}

/* ───────── 5. Le lendemain : le portail client ───────── */
function Portal() {
  const rdv = [
    { d: "Jeu.", n: "10", h: "10:00", c: "Nordfil", w: "Claire Martin, directrice commerciale" },
    { d: "Jeu.", n: "10", h: "14:30", c: "Batimex", w: "Julien Bernard, gérant" },
    { d: "Ven.", n: "11", h: "11:00", c: "Optilog", w: "Sophie Laurent, DAF" },
  ];
  return (
    <div className={cx(panel, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-[14px] font-semibold text-ink">Vos rendez-vous</p>
        <span className="hidden rounded-full bg-paper px-2.5 py-1 font-mono text-[10.5px] text-ink/70 sm:inline">portail.votre-agence.fr</span>
      </div>
      <ul>
        {rdv.map((r) => (
          <li key={r.h + r.c} className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
            <span className="flex w-11 shrink-0 flex-col items-center rounded-[10px] border border-line py-1">
              <span className="font-mono text-[10px] text-muted uppercase">{r.d}</span>
              <span className="font-display-tight text-[18px] leading-none text-ink">{r.n}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink">
                {r.c} <span className="font-mono text-[12px] font-normal text-muted">{r.h}</span>
              </span>
              <span className="block truncate text-[12px] text-muted">{r.w}</span>
            </span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-navy">
              <Icon name="play" className="ml-0.5 size-3.5" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const screens: Record<(typeof features.steps)[number]["id"], () => ReactNode> = {
  file: Queue,
  touche: Keys,
  resume: Summary,
  journal: Journal,
  portail: Portal,
};

export function Features() {
  return (
    <section id="fonctionnalites" aria-labelledby="features-title" className="border-t border-line py-20 sm:py-28">
      <Container>
        <SectionHeader id="features-title" title={features.title} subtitle={features.subtitle} layout="split" />
        <p className="sr-only">{features.label}</p>

        <FeatureTrack>
          {features.steps.map((step, n) => {
            const Screen = screens[step.id];
            // The call log needs the width: its text sits above its screen.
            const wide = step.id === "journal";
            return (
              <li
                key={step.id}
                className={cx(
                  "group/row relative grid gap-x-16 gap-y-7 pb-14 pl-9 last:pb-0 sm:pl-12 lg:pb-16",
                  !wide && "lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]",
                )}
              >
                <FeatureMarker />
                <div className={cx("flex flex-col", wide && "lg:max-w-[620px]")}>
                  <p className="flex items-baseline gap-3">
                    <span className="font-mono text-[12px] text-ink/40 tabular-nums">{String(n + 1).padStart(2, "0")}</span>
                    <span className="eyebrow text-ink/80">{step.moment}</span>
                  </p>
                  <h3 className="font-display-tight mt-4 text-[clamp(1.75rem,2.6vw,2.25rem)] leading-[1.05] font-light text-ink">{step.title}</h3>
                  <p className="mt-3 max-w-[40ch] text-[17px] leading-relaxed text-muted">{step.body}</p>
                </div>
                <Reveal className="min-w-0">
                  <div aria-hidden className="transition-transform duration-200 ease-out fine:group-hover/row:-translate-y-1">
                    <Screen />
                  </div>
                </Reveal>
              </li>
            );
          })}
        </FeatureTrack>
      </Container>
    </section>
  );
}
