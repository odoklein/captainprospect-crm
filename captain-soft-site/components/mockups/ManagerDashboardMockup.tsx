import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { Avatar, MockRoot, MockWindow, Tag } from "./parts";

const kpis = [
  { label: "Appels", value: "1 284" },
  { label: "Conversations", value: "312" },
  { label: "RDV pris", value: "27" },
  { label: "Taux de RDV", value: "8,7 %" },
];

const pace = [
  { initials: "IB", name: "Inès", pct: 112 },
  { initials: "TM", name: "Thomas", pct: 96 },
  { initials: "SK", name: "Sarah", pct: 88 },
  { initials: "LD", name: "Lucas", pct: 62, late: true },
];

const hours = [18, 34, 52, 61, 44, 22, 38, 58, 66, 49];

export function ManagerDashboardMockup({ label }: { label: string }) {
  return (
    <MockRoot label={label}>
      <MockWindow title="Captain Soft · Pilotage de l'équipe" right={<Tag tone="neutral">Aujourd&apos;hui</Tag>} bodyClassName="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-[12px] border border-line p-3">
              <p className="text-[11px] text-muted">{k.label}</p>
              <p className="font-display-tight mt-1 text-[22px] leading-none font-normal">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1.25fr_1fr]">
          <div className="rounded-[12px] border border-line p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Rythme par SDR</p>
              <span className="text-[11px] text-muted">objectif d&apos;appels</span>
            </div>
            <ul className="space-y-2.5">
              {pace.map((p) => (
                <li key={p.name} className="flex items-center gap-2.5">
                  <Avatar initials={p.initials} tone={p.late ? "rose" : "sand"} size="sm" />
                  <span className="w-12 font-medium">{p.name}</span>
                  <div className="relative h-2 flex-1 rounded-full bg-ink/[.07]">
                    <span
                      className={cx("absolute inset-y-0 left-0 rounded-full", p.late ? "bg-rose" : "bg-navy")}
                      style={{ width: `${Math.min(p.pct, 100)}%` }}
                    />
                  </div>
                  <span className={cx("w-10 text-right font-mono text-[11px]", p.late ? "font-semibold text-[#8E2F61]" : "text-ink/70")}>
                    {p.pct} %
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-[12px] border border-line p-3">
              <p className="mb-2 font-semibold">Appels par heure</p>
              <div className="flex h-16 items-end gap-1" aria-hidden>
                {hours.map((h, i) => (
                  <span key={i} className={cx("flex-1 rounded-t-[3px]", i === 8 ? "bg-navy" : "bg-navy/20")} style={{ height: `${h * 1.4}%` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[9.5px] text-muted">
                <span>9h</span>
                <span>18h</span>
              </div>
            </div>
            <div className="flex gap-2.5 rounded-[12px] bg-rose/[.07] p-3">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-[#8E2F61]" />
              <div>
                <p className="font-semibold text-[#8E2F61]">Agent · 2 alertes</p>
                <p className="text-ink/75">Lucas à 62 % de son rythme. Batimex : aucun RDV depuis 14 jours.</p>
              </div>
            </div>
          </div>
        </div>
      </MockWindow>
    </MockRoot>
  );
}
