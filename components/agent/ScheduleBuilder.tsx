"use client";

/**
 * Friendly schedule picker that writes a 5-field cron: presets (tous les
 * jours, jours ouvrés, chaque semaine le…, chaque mois, toutes les N heures)
 * with a time, plus an « avancé » raw cron field. The model and its tests
 * live in lib/agent/client/schedule.ts. Mount it with a `key` per job: it
 * reads `value` once, then owns its draft.
 */

import { useId, useState } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/Field";
import { FIELD_BASE, FIELD_ERROR, FOCUS_RING } from "@/components/ui/recipes";
import { SelectField } from "@/components/accueil/AccueilUI";
import {
    buildCron,
    DEFAULT_PRESET,
    describePreset,
    HOUR_STEPS,
    parseCronToPreset,
    validateCron,
    WEEK_ORDER,
    WEEKDAY_LABELS,
    WEEKDAY_SHORT_LABELS,
    type ScheduleKind,
    type SchedulePreset,
} from "@/lib/agent/client/schedule";

type Mode = ScheduleKind | "none";

const MODES: Array<{ value: Mode; label: string }> = [
    { value: "daily", label: "Tous les jours" },
    { value: "weekdays", label: "Jours ouvrés" },
    { value: "weekly", label: "Chaque semaine" },
    { value: "monthly", label: "Chaque mois" },
    { value: "hourly", label: "Toutes les N heures" },
    { value: "custom", label: "Avancé" },
];

export function ScheduleBuilder({
    value,
    onChange,
    allowNone,
    label = "Planification",
    timezone = "Europe/Paris",
}: {
    timezone?: string;
    value: string | null;
    /** Called with the cron, or null for « manuel » / an incomplete draft (see `valid`). */
    onChange: (cron: string | null, valid: boolean) => void;
    /** Offers « Manuel uniquement » (no schedule). */
    allowNone?: boolean;
    label?: string;
}) {
    const id = useId();
    const [mode, setMode] = useState<Mode>(() => (value ? parseCronToPreset(value).kind : allowNone ? "none" : DEFAULT_PRESET.kind));
    const [preset, setPreset] = useState<SchedulePreset>(() => (value ? parseCronToPreset(value) : DEFAULT_PRESET));

    const emit = (nextMode: Mode, next: SchedulePreset) => {
        if (nextMode === "none") {
            onChange(null, true);
            return;
        }
        const cron = buildCron({ ...next, kind: nextMode });
        onChange(cron, cron !== null);
    };

    const update = (patch: Partial<SchedulePreset>) => {
        const next = { ...preset, ...patch };
        setPreset(next);
        emit(mode, next);
    };

    const pickMode = (m: Mode) => {
        // Carry the current cron into the raw field when switching to « avancé ».
        const current = mode === "none" ? null : buildCron({ ...preset, kind: mode });
        const next = m === "custom" && current ? { ...preset, cron: current } : preset;
        setMode(m);
        setPreset(next);
        emit(m, next);
    };

    const cronError = mode === "custom" ? validateCron(preset.cron) : null;
    const cron = mode === "none" ? null : buildCron({ ...preset, kind: mode });
    const modes = allowNone ? [{ value: "none" as Mode, label: "Manuel" }, ...MODES] : MODES;

    return (
        <Field label={label}>
            <div className="space-y-3 rounded-panel border border-line bg-surface-2 p-3">
                <div role="radiogroup" aria-label="Fréquence" className="flex flex-wrap gap-1.5">
                    {modes.map((m) => {
                        const active = m.value === mode;
                        return (
                            <button
                                key={m.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => pickMode(m.value)}
                                className={cn(
                                    "h-8 rounded-chip border px-3 text-xs font-semibold whitespace-nowrap transition-[background-color,border-color,color] duration-150 ease-snappy",
                                    FOCUS_RING,
                                    active ? "border-primary-200 bg-primary-50 text-primary-700" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                                )}
                            >
                                {m.label}
                            </button>
                        );
                    })}
                </div>

                {mode === "weekly" && (
                    <div role="group" aria-label="Jours de la semaine" className="flex flex-wrap gap-1.5">
                        {WEEK_ORDER.map((d) => {
                            const on = preset.weekdays.includes(d);
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={on}
                                    aria-label={WEEKDAY_LABELS[d]}
                                    onClick={() => update({ weekdays: on ? preset.weekdays.filter((x) => x !== d) : [...preset.weekdays, d] })}
                                    className={cn(
                                        "size-9 rounded-control border text-xs font-bold transition-[background-color,border-color,color,transform] duration-150 ease-snappy active:scale-95",
                                        FOCUS_RING,
                                        on ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                                    )}
                                >
                                    {WEEKDAY_SHORT_LABELS[d]}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                    {mode === "monthly" && (
                        <div className="w-28">
                            <span className="mb-1 block text-[11px] font-semibold text-ink-3">Jour du mois</span>
                            <SelectField value={String(preset.dayOfMonth)} onChange={(v) => update({ dayOfMonth: Number(v) })} ariaLabel="Jour du mois">
                                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                                    <option key={d} value={d}>
                                        {d === 1 ? "1er" : d}
                                    </option>
                                ))}
                            </SelectField>
                        </div>
                    )}
                    {mode === "hourly" && (
                        <>
                            <div className="w-32">
                                <span className="mb-1 block text-[11px] font-semibold text-ink-3">Toutes les</span>
                                <SelectField value={String(preset.everyHours)} onChange={(v) => update({ everyHours: Number(v) })} ariaLabel="Intervalle en heures">
                                    {HOUR_STEPS.map((h) => (
                                        <option key={h} value={h}>
                                            {h === 1 ? "heure" : `${h} heures`}
                                        </option>
                                    ))}
                                </SelectField>
                            </div>
                            <label className="w-28">
                                <span className="mb-1 block text-[11px] font-semibold text-ink-3">À la minute</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={59}
                                    value={preset.minute}
                                    onChange={(e) => update({ minute: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })}
                                    className={cn(FIELD_BASE, "h-9 px-3 text-sm tabular-nums")}
                                />
                            </label>
                        </>
                    )}
                    {(mode === "daily" || mode === "weekdays" || mode === "weekly" || mode === "monthly") && (
                        <label className="w-32" htmlFor={`${id}-time`}>
                            <span className="mb-1 block text-[11px] font-semibold text-ink-3">Heure</span>
                            <input
                                id={`${id}-time`}
                                type="time"
                                step={300}
                                value={preset.time}
                                onChange={(e) => update({ time: e.target.value })}
                                className={cn(FIELD_BASE, "h-9 px-3 text-sm tabular-nums")}
                            />
                        </label>
                    )}
                    {mode === "custom" && (
                        <label className="min-w-0 flex-1" htmlFor={`${id}-cron`}>
                            <span className="mb-1 block text-[11px] font-semibold text-ink-3">Expression cron (minute heure jour mois jour-de-semaine)</span>
                            <input
                                id={`${id}-cron`}
                                type="text"
                                spellCheck={false}
                                autoComplete="off"
                                value={preset.cron}
                                placeholder="0 8 * * 1-5"
                                aria-invalid={Boolean(cronError) || undefined}
                                aria-describedby={`${id}-desc`}
                                onChange={(e) => update({ cron: e.target.value })}
                                className={cn(FIELD_BASE, "h-9 px-3 font-mono text-sm", cronError && FIELD_ERROR)}
                            />
                        </label>
                    )}
                </div>

                <p id={`${id}-desc`} className={cn("flex flex-wrap items-center gap-2 text-xs", cronError ? "text-danger-ink" : "text-ink-2")} aria-live="polite">
                    <CalendarClock className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                    {mode === "none" ? (
                        <span>Ne tourne que quand tu cliques sur « Lancer maintenant ».</span>
                    ) : cronError ? (
                        <span>{cronError}</span>
                    ) : cron ? (
                        <>
                            <span className="font-semibold">{describePreset(parseCronToPreset(cron))}</span>
                            <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">{cron}</code>
                            <span className="text-ink-4">{timezone === "Europe/Paris" ? "heure de Paris" : timezone}</span>
                        </>
                    ) : (
                        <span className="text-warning-ink">{describePreset({ ...preset, kind: mode })}</span>
                    )}
                </p>
            </div>
        </Field>
    );
}
