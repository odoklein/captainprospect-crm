// Mockups for the three "moteurs" cards (Exécution, IA, Instance dédiée).
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { BriefCard } from "./MeetingBriefMockup";
import { Avatar, Kbd, MockButton, MockRoot, Tag, Waveform } from "./parts";

/* ─────────── a) Exécution — on navy ─────────── */
export function ExecutionMockup({ label }: { label: string }) {
  return (
    <MockRoot label={label} className="text-white">
      <div className="grid gap-3">
        <div className="rounded-[18px] border border-white/12 bg-white/[.06] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Avatar initials="JB" tone="light" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Julien Bernard · Batimex</p>
              <p className="text-[11px] text-white/65">Rappel programmé · ligne OnOff</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] text-ink">00:48</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["RDV pris", "Rappel", "Barrage"].map((o, i) => (
              <MockButton key={o} variant="ghost-dark" className={cx("text-[11.5px]", i === 0 && "border-rose/60 bg-rose/15")}>
                {o}
                <Kbd dark>{i + 1}</Kbd>
              </MockButton>
            ))}
          </div>
          <MockButton variant="outline" className="mt-2 w-full justify-center border-0 bg-white py-2.5 text-navy">
            Appel suivant <Icon name="arrowRight" className="size-4" />
          </MockButton>
        </div>

        <div className="rounded-[18px] border border-white/12 bg-[#16363D] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="lock" className="size-4 text-white/80" />
            <p className="font-semibold">Call Vault</p>
            <Tag tone="dark" className="ml-auto">S3 privé</Tag>
          </div>
          <ul className="space-y-2.5">
            {[
              { who: "Claire Martin · Nordfil", meta: "RDV pris · 6:31", played: 0.7 },
              { who: "Sophie Laurent · Optilog", meta: "Rappel · 2:05", played: 0 },
            ].map((r) => (
              <li key={r.who} className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-navy">
                  <Icon name="play" className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <p className="truncate font-medium">{r.who}</p>
                    <span className="shrink-0 font-mono text-[10.5px] text-white/60">{r.meta}</span>
                  </div>
                  <Waveform bars={46} played={r.played} dark className="mt-1 h-5" />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Tag tone="dark">
              <Icon name="phone" className="size-3" /> Allo
            </Tag>
            <Tag tone="dark">
              <Icon name="phone" className="size-3" /> OnOff
            </Tag>
          </div>
        </div>
      </div>
    </MockRoot>
  );
}

/* ─────────── b) IA — on near-black with rose glow ─────────── */
export function AiMockup({ label }: { label: string }) {
  return (
    <MockRoot label={label} className="text-white">
      <div className="relative grid gap-3 xl:grid-cols-[1.15fr_1fr] xl:items-start">
        <BriefCard tone="dark" />
        <div className="grid gap-3">
          <div className="rounded-[18px] border border-white/10 bg-[#0F2529] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="sun" className="size-4 text-white/80" />
              <p className="font-semibold">Digest du matin</p>
              <span className="ml-auto font-mono text-[10.5px] text-white/60">08:00</span>
            </div>
            <ul className="space-y-1.5 text-white/85">
              <li>3 rappels prioritaires avant 11h</li>
              <li>12 nouveaux contacts dans la mission Nordfil</li>
              <li>1 RDV à confirmer avec Optilog</li>
            </ul>
          </div>
          <div className="rounded-[18px] border border-rose/30 bg-[#1D2A22] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="alert" className="size-4 text-rose" />
              <p className="font-semibold">Agent de veille</p>
            </div>
            <ul className="space-y-2 text-white/85">
              <li>
                <span className="font-medium text-white">Client à risque</span> · Batimex, aucun RDV depuis 14 jours
              </li>
              <li>
                <span className="font-medium text-white">Rythme</span> · Lucas à 62 % de son objectif d&apos;appels
              </li>
            </ul>
          </div>
        </div>
      </div>
    </MockRoot>
  );
}

/* ─────────── c) Instance dédiée — light ─────────── */
const rolesMatrix = [
  { role: "SDR", perms: [true, false, false] },
  { role: "Manager", perms: [true, true, false] },
  { role: "Business Dev.", perms: [true, true, false] },
  { role: "Client", perms: [false, true, false] },
  { role: "Admin", perms: [true, true, true] },
];

export function InstanceMockup({ label }: { label: string }) {
  return (
    <MockRoot label={label}>
      <div className="grid gap-3">
        <div className="rounded-[18px] border border-line bg-white p-4 shadow-[0_24px_60px_-34px_rgba(15,18,34,.35)]">
          <div className="flex flex-wrap items-center gap-2">
            <Icon name="server" className="size-4 text-navy" />
            <p className="font-semibold">crm.votreagence.fr</p>
            <Tag tone="ok" className="ml-auto">
              <span className="size-1.5 rounded-full bg-[#1F7A4D]" /> Instance dédiée
            </Tag>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { icon: "database" as const, k: "Base de données", v: "PostgreSQL isolée" },
              { icon: "lock" as const, k: "Enregistrements", v: "S3 privé · Call Vault" },
            ].map((r) => (
              <div key={r.k} className="flex items-center gap-2.5 rounded-[12px] bg-[#FBFAF7] p-2.5">
                <Icon name={r.icon} className="size-4 shrink-0 text-navy" />
                <div>
                  <p className="text-[11px] text-muted">{r.k}</p>
                  <p className="font-medium">{r.v}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed border-line p-2.5">
            <span className="text-[11px] text-muted">Marque blanche</span>
            <span className="grid h-7 place-items-center rounded-[8px] bg-[#112F35] px-2.5 font-display-tight text-[12px] text-white">Votre Agence</span>
            <span className="flex gap-1">
              {["#2F5D50", "#E9B44C", "#0F1222"].map((c) => (
                <span key={c} className="size-5 rounded-full border border-black/10" style={{ background: c }} />
              ))}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-line bg-white">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <Icon name="users" className="size-4 text-navy" />
            <p className="font-semibold">Rôles et permissions</p>
          </div>
          <table className="w-full text-left">
            <thead className="text-[10.5px] text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Rôle</th>
                <th className="px-2 py-2 font-medium">Appels</th>
                <th className="px-2 py-2 font-medium">Rapports</th>
                <th className="px-2 py-2 font-medium">Réglages</th>
              </tr>
            </thead>
            <tbody>
              {rolesMatrix.map((r) => (
                <tr key={r.role} className="border-t border-line">
                  <td className="px-4 py-1.5 font-medium">{r.role}</td>
                  {r.perms.map((p, i) => (
                    <td key={i} className="px-2 py-1.5">
                      {p ? (
                        <span className="grid size-5 place-items-center rounded-full bg-navy text-white">
                          <Icon name="check" className="size-3" />
                        </span>
                      ) : (
                        <span className="block h-px w-3 bg-ink/25" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MockRoot>
  );
}
