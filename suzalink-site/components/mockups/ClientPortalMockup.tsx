import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { MockRoot, MockWindow, Tag, Waveform } from "./parts";

const meetings = [
  { date: "jeu. 14", company: "Optilog", contact: "Directeur des achats", status: "Confirmé", played: 0.55 },
  { date: "mar. 12", company: "Veldis", contact: "Responsable RH", status: "Confirmé", played: 0 },
  { date: "lun. 11", company: "Kerlan", contact: "CEO", status: "À recaler", played: 0 },
];

export function ClientPortalMockup({ label }: { label: string }) {
  return (
    <MockRoot label={label}>
      <MockWindow title="portail.votreagence.fr" right={<Tag tone="navy">Marque blanche</Tag>} bodyClassName="p-0">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <span className="grid size-8 place-items-center rounded-[9px] bg-[#112F35] font-display-tight text-[13px] text-white">VA</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Votre Agence</p>
            <p className="text-[11px] text-muted">Espace client · Nordfil</p>
          </div>
          <div className="hidden gap-1 sm:flex">
            {["RDV", "Enregistrements", "Rapports"].map((t, i) => (
              <span key={t} className={cx("rounded-full px-2.5 py-1 text-[11px] font-medium", i === 0 ? "bg-ink text-white" : "text-muted")}>
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-[1.4fr_1fr]">
          <ul className="space-y-2">
            {meetings.map((m) => (
              <li key={m.company} className="rounded-[12px] border border-line p-3">
                <div className="flex items-center gap-3">
                  <span className="w-12 font-mono text-[11px] text-muted">{m.date}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.company}</p>
                    <p className="truncate text-[11px] text-muted">{m.contact}</p>
                  </div>
                  <Tag tone={m.status === "Confirmé" ? "ok" : "warn"}>{m.status}</Tag>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-white">
                    <Icon name="play" className="size-3" />
                  </span>
                  <Waveform bars={36} played={m.played} className="h-5 flex-1" />
                  <span className="font-mono text-[10px] text-muted">4:12</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-[12px] bg-[#FBFAF7] p-3">
            <p className="font-semibold">Rapport de la semaine</p>
            <p className="text-[11px] text-muted">Envoyé chaque lundi</p>
            <div className="mt-3 space-y-2">
              {[
                ["Appels passés", "486"],
                ["Conversations", "121"],
                ["RDV pris", "9"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-line pb-2 last:border-0">
                  <span className="text-ink/70">{k}</span>
                  <span className="font-display-tight text-[18px]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </MockWindow>
    </MockRoot>
  );
}
