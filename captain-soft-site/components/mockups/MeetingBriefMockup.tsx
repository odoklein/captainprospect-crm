import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { MockButton, MockRoot, Tag } from "./parts";

const bant = [
  { k: "Budget", v: "15 à 20 k€ par an, validé" },
  { k: "Autorité", v: "Décisionnaire, DAF en copie" },
  { k: "Besoin", v: "Remplacer 3 outils, centraliser les appels" },
  { k: "Timing", v: "Décision avant la fin du T1" },
];

/** AI "Fiche de RDV" card. `tone="dark"` for the near-black AI band. */
export function MeetingBriefMockup({ label, tone = "light", className }: { label?: string; tone?: "light" | "dark"; className?: string }) {
  const card = <BriefCard tone={tone} className={className} />;
  return label ? <MockRoot label={label}>{card}</MockRoot> : card;
}

export function BriefCard({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const dark = tone === "dark";
  return (
    <div
      className={cx(
        "rounded-[18px] border p-4 sm:p-5",
        dark
          ? "border-white/10 bg-[#141726] text-white shadow-[0_30px_80px_-40px_rgba(198,75,139,.55)]"
          : "border-line bg-white text-ink shadow-[0_24px_60px_-28px_rgba(15,18,34,.35)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("grid size-8 place-items-center rounded-full", dark ? "bg-rose/20 text-white" : "bg-rose/10 text-[#8E2F61]")}>
          <Icon name="sparkle" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Fiche de RDV</p>
          <p className={cx("text-[11px]", dark ? "text-white/65" : "text-muted")}>Nordfil · jeudi 10:00 · Claire Martin</p>
        </div>
        <Tag tone={dark ? "dark" : "rose"}>Générée par l&apos;IA</Tag>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {bant.map((b) => (
          <div key={b.k} className={cx("rounded-[12px] p-2.5", dark ? "bg-white/[.06]" : "bg-[#FBFAF7]")}>
            <p className={cx("font-mono text-[9.5px] tracking-[.12em] uppercase", dark ? "text-white/60" : "text-muted")}>{b.k}</p>
            <p className="mt-1 font-medium">{b.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <p className={cx("mb-1.5 text-[11px] font-medium", dark ? "text-white/65" : "text-muted")}>Objections</p>
        <ul className="space-y-1">
          {["Reprise des données existantes", "Formation de l'équipe"].map((o) => (
            <li key={o} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-rose" />
              {o}
            </li>
          ))}
        </ul>
      </div>

      <blockquote className={cx("mt-3 border-l-2 border-rose pl-3 italic", dark ? "text-white/80" : "text-ink/75")}>
        « On perd un temps fou à jongler entre les outils. »
      </blockquote>

      <div className="mt-4 flex gap-2">
        <MockButton variant={dark ? "ghost-dark" : "navy"} className="flex-1 justify-center">
          Envoyer au closer
        </MockButton>
        <MockButton variant={dark ? "ghost-dark" : "outline"}>Copier</MockButton>
      </div>
    </div>
  );
}
