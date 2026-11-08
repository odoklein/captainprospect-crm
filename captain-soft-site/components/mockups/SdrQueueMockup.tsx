import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { Avatar, Kbd, MockButton, MockRoot, MockWindow, Tag } from "./parts";

const queue = [
  { initials: "CM", name: "Claire Martin", company: "Nordfil", tag: { label: "En appel", tone: "rose" as const }, active: true },
  { initials: "JB", name: "Julien Bernard", company: "Batimex", tag: { label: "Rappel 14:30", tone: "warn" as const } },
  { initials: "SL", name: "Sophie Laurent", company: "Optilog", tag: { label: "Nouveau", tone: "navy" as const } },
  { initials: "AR", name: "Antoine Roux", company: "Veldis", tag: { label: "Barrage", tone: "neutral" as const } },
  { initials: "LF", name: "Léa Fontaine", company: "Kerlan", tag: { label: "Nouveau", tone: "navy" as const } },
  { initials: "MG", name: "Marc Girard", company: "Axone", tag: { label: "Séquence J+3", tone: "neutral" as const } },
];

const outcomes = [
  { label: "RDV pris", key: "1", variant: "rose" as const },
  { label: "Rappel", key: "2" },
  { label: "Pas intéressé", key: "3" },
  { label: "Barrage", key: "4" },
  { label: "Messagerie", key: "5" },
  { label: "Mauvais numéro", key: "6" },
];

const history = [
  { icon: "mail" as const, title: "Email « Suite à notre échange »", meta: "Ouvert · il y a 3 j" },
  { icon: "phone" as const, title: "Appel · Messagerie", meta: "Il y a 7 j · 0:42" },
  { icon: "sparkle" as const, title: "Séquence Relance · étape 2", meta: "Programmée demain" },
];

export function SdrQueueMockup({ label, variant = "full" }: { label: string; variant?: "full" | "compact" }) {
  const full = variant === "full";
  return (
    <MockRoot label={label}>
      <MockWindow
        title="Captain Soft · File d'appels"
        right={
          <>
            <Tag tone="ok">
              <span className="size-1.5 rounded-full bg-[#1F7A4D]" /> Ligne Allo connectée
            </Tag>
          </>
        }
        bodyClassName={cx("grid", full ? "md:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_220px]" : "sm:grid-cols-[200px_1fr]")}
      >
        {/* Queue */}
        <div className={cx("border-line bg-[#FBFAF7] p-3", full ? "hidden md:block md:border-r" : "hidden sm:block sm:border-r")}>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="font-semibold">File du jour</p>
            <span className="text-[11px] text-muted">42 restants</span>
          </div>
          <ul className="space-y-1">
            {queue.slice(0, full ? 6 : 5).map((c) => (
              <li
                key={c.name}
                className={cx(
                  "relative flex items-center gap-2.5 rounded-[10px] px-2 py-2",
                  c.active ? "bg-white shadow-[0_0_0_1px_var(--color-line)]" : "",
                )}
              >
                {c.active ? <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-rose" /> : null}
                <Avatar initials={c.initials} tone={c.active ? "rose" : "sand"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-[11px] text-muted">{c.company}</p>
                </div>
                <Tag tone={c.tag.tone} className={full ? "hidden lg:inline-flex" : "hidden"}>
                  {c.tag.label}
                </Tag>
              </li>
            ))}
          </ul>
        </div>

        {/* Current contact */}
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-3">
            <Avatar initials="CM" tone="rose" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Claire Martin</p>
              <p className="text-muted">Directrice commerciale · Nordfil</p>
              <p className="mt-1 font-mono text-[11px] text-ink/70">+33 6 •• •• 48 12</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-white">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-rose" />
              </span>
              <span className="font-mono text-[11px]">En appel · 02:14</span>
            </div>
          </div>

          <div className="rounded-[12px] border border-line p-3">
            <p className="mb-2 text-[11px] font-medium text-muted">Notes</p>
            <p className="text-ink/80">
              Utilise 3 outils aujourd&apos;hui. Veut centraliser les appels de l&apos;équipe avant le T1.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium text-muted">Résultat en 1 clic</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {outcomes.map((o) => (
                <MockButton key={o.label} variant={o.variant ?? "outline"} className="text-[11.5px]">
                  {o.label}
                  <Kbd>{o.key}</Kbd>
                </MockButton>
              ))}
            </div>
          </div>

          <MockButton variant="navy" className="mt-auto justify-center gap-3 py-2.5 text-[13px]">
            Appel suivant
            <Icon name="arrowRight" className="size-4" />
            <Kbd dark>Espace</Kbd>
          </MockButton>
        </div>

        {/* History */}
        {full ? (
          <div className="hidden border-l border-line p-4 xl:block">
            <p className="mb-3 font-semibold">Historique</p>
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.title} className="flex gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy/[.07] text-navy">
                    <Icon name={h.icon} className="size-3.5" />
                  </span>
                  <div>
                    <p className="font-medium">{h.title}</p>
                    <p className="text-[11px] text-muted">{h.meta}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-[12px] bg-[#FBFAF7] p-3">
              <p className="text-[11px] font-medium text-muted">Mission</p>
              <p className="font-medium">Nordfil · Décideurs logistique</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <span className="block h-full w-[64%] rounded-full bg-navy" />
              </div>
              <p className="mt-1 text-[11px] text-muted">64 % de la liste traitée</p>
            </div>
          </div>
        ) : null}
      </MockWindow>
    </MockRoot>
  );
}
