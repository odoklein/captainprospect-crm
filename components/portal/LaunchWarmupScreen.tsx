"use client";

import { CalendarDays, Check, Clock3, Rocket, ShieldCheck, Sparkles } from "lucide-react";

export interface PortalLaunchMission {
  id: string;
  name: string;
  portalLaunchStartedAt: string | null;
  portalVisibleAt: string;
}

interface LaunchWarmupScreenProps {
  missions: PortalLaunchMission[];
  userName?: string;
}

export function LaunchWarmupScreen({ missions, userName }: LaunchWarmupScreenProps) {
  const mission = missions[0];
  const visibleAt = new Date(mission.portalVisibleAt);
  const now = new Date();
  const daysLeft = Math.max(1, Math.ceil((visibleAt.getTime() - now.getTime()) / 86_400_000));
  const startedAt = mission.portalLaunchStartedAt
    ? new Date(mission.portalLaunchStartedAt)
    : now;
  const total = Math.max(1, visibleAt.getTime() - startedAt.getTime());
  const progress = Math.min(92, Math.max(8, ((now.getTime() - startedAt.getTime()) / total) * 100));

  const steps = [
    { label: "Configuration finalisée", detail: "Ciblage et séquences validés", done: true },
    { label: "Campagne en mouvement", detail: "Les premières actions sont en cours", done: true },
    { label: "Signaux en consolidation", detail: "Nous laissons les tendances devenir fiables", done: false },
  ];

  return (
    <main className="min-h-full bg-[#F7F8F4] p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#6B746D]">
              Bonjour{userName ? `, ${userName}` : ""}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#13251A] md:text-3xl">
              Votre mission prend son élan
            </h1>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#DDE7DF] bg-white px-4 py-2 text-sm font-semibold text-[#2B5F3E] shadow-sm sm:flex">
            <Clock3 className="h-4 w-4" />
            {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}
          </div>
        </div>

        <section className="relative overflow-hidden rounded-3xl bg-[#173C28] text-white shadow-[0_24px_70px_rgba(23,60,40,0.18)]">
          <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[#75A884]/20 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-[#B9D6C2]/10 blur-3xl" />
          <div className="relative grid gap-10 p-7 md:grid-cols-[1.25fr_0.75fr] md:p-10 lg:p-12">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#D9EADF]">
                <Rocket className="h-3.5 w-3.5" />
                Mission en phase de démarrage
              </div>
              <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                Nous construisons une base de résultats fiable.
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-[#C8D9CE] md:text-base">
                L’activité est bien lancée. Nous attendons suffisamment de volume avant
                d’afficher vos statistiques pour vous donner une lecture claire et utile.
              </p>

              <div className="mt-9">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-[#AFC7B7]">Mission</p>
                    <p className="mt-1 font-semibold">{mission.name}</p>
                  </div>
                  <p className="text-right text-xs text-[#AFC7B7]">
                    Données disponibles le
                    <span className="mt-1 block font-semibold text-white">
                      {visibleAt.toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#9BC7A8] transition-[width] duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative flex aspect-square w-full max-w-[260px] items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                <div className="absolute inset-5 rounded-full border border-dashed border-white/20 motion-safe:animate-[spin_24s_linear_infinite]" />
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#F0F6F2] text-[#245136] shadow-2xl">
                  <Sparkles className="h-11 w-11" strokeWidth={1.6} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.42fr]">
          <div className="rounded-2xl border border-[#E2E9E4] bg-white p-6 shadow-[0_12px_35px_rgba(29,65,42,0.06)]">
            <h3 className="text-base font-bold text-[#183220]">Ce qui se passe maintenant</h3>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.label} className="relative">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2EC] text-[#2B5F3E]">
                    {step.done ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                  </div>
                  <p className="text-sm font-bold text-[#1C3022]">{step.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#748077]">{step.detail}</p>
                  {index < steps.length - 1 && (
                    <div className="absolute left-11 top-4 hidden h-px w-[calc(100%-3rem)] bg-[#E2E9E4] md:block" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-2xl border border-[#DCE8DF] bg-[#EDF4EF] p-6">
            <ShieldCheck className="h-7 w-7 text-[#2B5F3E]" />
            <h3 className="mt-4 text-base font-bold text-[#183220]">Vos données sont bien enregistrées</h3>
            <p className="mt-2 text-sm leading-6 text-[#657269]">
              Rien n’est perdu. Les résultats accumulés depuis le premier jour apparaîtront
              automatiquement à la fin de cette phase.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#2B5F3E]">
              <CalendarDays className="h-4 w-4" />
              Mise à jour automatique
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
