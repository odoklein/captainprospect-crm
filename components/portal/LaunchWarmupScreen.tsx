"use client";

import { BarChart3, CalendarDays, Check, Clock3, ShieldCheck } from "lucide-react";

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
    { label: "Campagne lancée", detail: "Les premières actions sont en cours", done: true },
    { label: "Collecte des données", detail: "Volume nécessaire pour des statistiques fiables", done: false },
  ];

  return (
    <main className="min-h-full bg-canvas p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-3">
              Bonjour{userName ? `, ${userName}` : ""}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink md:text-3xl">
              Démarrage de votre mission
            </h1>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm sm:flex">
            <Clock3 className="h-4 w-4" />
            {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}
          </div>
        </div>

        <section className="relative overflow-hidden rounded-3xl bg-inverse text-white shadow-sm">
          <div className="relative grid gap-10 p-7 md:grid-cols-[1.25fr_0.75fr] md:p-10 lg:p-12">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-inverse-ink">
                Mission en phase de démarrage
              </div>
              <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                Vos statistiques s’afficheront à la fin du démarrage.
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-inverse-ink-2 md:text-base">
                La prospection a commencé. Les statistiques s’affichent une fois le volume
                suffisant pour être fiables.
              </p>

              <div className="mt-9">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-inverse-ink-2">Mission</p>
                    <p className="mt-1 font-semibold">{mission.name}</p>
                  </div>
                  <p className="text-right text-xs text-inverse-ink-2">
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
                    className="h-full rounded-full bg-primary-300 transition-[width] duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative flex aspect-square w-full max-w-[260px] items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                <div className="absolute inset-5 rounded-full border border-dashed border-white/20" />
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                  <BarChart3 className="h-11 w-11" strokeWidth={1.6} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.42fr]">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-ink">Étapes du démarrage</h3>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.label} className="relative">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    {step.done ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                  </div>
                  <p className="text-sm font-bold text-ink">{step.label}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-3">{step.detail}</p>
                  {index < steps.length - 1 && (
                    <div className="absolute left-11 top-4 hidden h-px w-[calc(100%-3rem)] bg-line md:block" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-2xl border border-primary-100 bg-primary-50 p-6">
            <ShieldCheck className="h-7 w-7 text-primary-700" />
            <h3 className="mt-4 text-base font-bold text-ink">Vos données sont bien enregistrées</h3>
            <p className="mt-2 text-sm leading-6 text-ink-2">
              Les résultats enregistrés depuis le premier jour apparaîtront
              automatiquement à la fin de cette phase.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary-700">
              <CalendarDays className="h-4 w-4" />
              Mise à jour automatique
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
