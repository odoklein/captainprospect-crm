"use client";

/**
 * Friendly schedule picker that writes a 5-field cron: presets (manuel, tous
 * les jours, jours ouvrés, chaque semaine le…, chaque mois, toutes les N
 * heures) with a time, plus « Avancé », a raw cron field with its live French
 * reading. The model and its tests live in lib/agent/client/schedule.ts.
 * Mount it with a `key` per job: it reads `value` once, then owns its draft.
 */

import { useId, useState } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import { timeOptions } from "@/lib/agent/client/format";
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

const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

/** Chip-style items for a wrapping ToggleGroup (overrides the joined-segment look). */
const CHIP_ITEM = "h-8 flex-none rounded-chip border-l px-3 text-xs first:rounded-l-chip last:rounded-r-chip data-[variant=outline]:border-l data-[state=on]:border-primary-200 data-[state=on]:bg-primary-50 data-[state=on]:text-primary-700";

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
    /** Offers « Manuel » (no schedule). */
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
    const withTime = mode === "daily" || mode === "weekdays" || mode === "weekly" || mode === "monthly";

    return (
        <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-xs font-semibold text-ink-2">{label}</legend>
            <div className="space-y-3 rounded-panel border border-line bg-surface-2 p-3">
                <ToggleGroup
                    type="single"
                    variant="outline"
                    value={mode}
                    onValueChange={(v) => v && pickMode(v as Mode)}
                    aria-label="Fréquence"
                    className="flex-wrap gap-1.5 shadow-none"
                >
                    {modes.map((m) => (
                        <ToggleGroupItem key={m.value} value={m.value} className={CHIP_ITEM}>
                            {m.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>

                {mode === "weekly" && (
                    <ToggleGroup
                        type="multiple"
                        variant="outline"
                        value={preset.weekdays.map(String)}
                        onValueChange={(v) => update({ weekdays: v.map(Number) })}
                        aria-label="Jours de la semaine"
                        className="flex-wrap gap-1.5 shadow-none motion-safe:animate-ds-enter"
                    >
                        {WEEK_ORDER.map((d) => (
                            <ToggleGroupItem
                                key={d}
                                value={String(d)}
                                aria-label={WEEKDAY_LABELS[d]}
                                className="size-9 flex-none rounded-control border-l px-0 text-xs font-bold first:rounded-l-control last:rounded-r-control data-[variant=outline]:border-l data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-fg"
                            >
                                {WEEKDAY_SHORT_LABELS[d]}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                )}

                {mode !== "none" && (
                    <div className="flex flex-wrap items-end gap-3">
                        {mode === "monthly" && (
                            <div className="grid gap-1">
                                <Label className="text-2xs font-semibold text-ink-3">Jour du mois</Label>
                                <Select value={String(preset.dayOfMonth)} onValueChange={(v) => update({ dayOfMonth: Number(v) })}>
                                    <SelectTrigger size="sm" className="w-24" aria-label="Jour du mois">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                                            <SelectItem key={d} value={String(d)}>
                                                {d === 1 ? "1er" : d}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {mode === "hourly" && (
                            <>
                                <div className="grid gap-1">
                                    <Label className="text-2xs font-semibold text-ink-3">Toutes les</Label>
                                    <Select value={String(preset.everyHours)} onValueChange={(v) => update({ everyHours: Number(v) })}>
                                        <SelectTrigger size="sm" className="w-32" aria-label="Intervalle en heures">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {HOUR_STEPS.map((h) => (
                                                <SelectItem key={h} value={String(h)}>
                                                    {h === 1 ? "heure" : `${h} heures`}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-2xs font-semibold text-ink-3">À la minute</Label>
                                    <Select value={String(preset.minute)} onValueChange={(v) => update({ minute: Number(v) })}>
                                        <SelectTrigger size="sm" className="w-24 tabular-nums" aria-label="Minute">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-64">
                                            {(MINUTES.includes(preset.minute) ? MINUTES : [...MINUTES, preset.minute].sort((a, b) => a - b)).map((m) => (
                                                <SelectItem key={m} value={String(m)} className="tabular-nums">
                                                    {String(m).padStart(2, "0")}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                        {withTime && (
                            <div className="grid gap-1">
                                <Label className="text-2xs font-semibold text-ink-3">Heure</Label>
                                <Select value={preset.time} onValueChange={(v) => update({ time: v })}>
                                    <SelectTrigger size="sm" className="w-28 tabular-nums" aria-label="Heure">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                        {timeOptions(15, preset.time).map((t) => (
                                            <SelectItem key={t} value={t} className="tabular-nums">
                                                {t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {mode === "custom" && (
                            <div className="grid min-w-0 flex-1 gap-1">
                                <Label htmlFor={`${id}-cron`} className="text-2xs font-semibold text-ink-3">
                                    Expression cron (minute heure jour mois jour-de-semaine)
                                </Label>
                                <Input
                                    id={`${id}-cron`}
                                    type="text"
                                    spellCheck={false}
                                    autoComplete="off"
                                    value={preset.cron}
                                    placeholder="0 8 * * 1-5"
                                    aria-invalid={Boolean(cronError) || undefined}
                                    aria-describedby={`${id}-desc`}
                                    onChange={(e) => update({ cron: e.target.value })}
                                    className="h-8 rounded-[10px] font-mono text-sm"
                                />
                            </div>
                        )}
                    </div>
                )}

                <p
                    id={`${id}-desc`}
                    className={cn(
                        "flex flex-wrap items-center gap-2 border-t border-line-subtle pt-2.5 text-xs",
                        cronError ? "text-danger-ink" : "text-ink-2",
                    )}
                    aria-live="polite"
                >
                    <CalendarClock className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                    {mode === "none" ? (
                        <span>Ne tourne que quand tu cliques sur « Lancer maintenant ».</span>
                    ) : cronError ? (
                        <span>{cronError}</span>
                    ) : cron ? (
                        <>
                            <span className="font-semibold">{describePreset(parseCronToPreset(cron))}</span>
                            <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-ink-3">{cron}</code>
                            <span className="text-ink-4">{timezone === "Europe/Paris" ? "heure de Paris" : timezone}</span>
                        </>
                    ) : (
                        <span className="text-warning-ink">{describePreset({ ...preset, kind: mode })}</span>
                    )}
                </p>
            </div>
        </fieldset>
    );
}
