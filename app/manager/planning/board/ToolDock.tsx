'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Brush as BrushIcon, CheckCircle2, Eraser, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardMission } from '@/lib/planning/board-shared';
import { describeProgress, formatDays, missionColor, missionProgress, type MissionColor } from './engine';
import { HATCH, type Brush } from './BoardGrid';
import { textWidth } from './measure';

function ProgressRing({ mission, color, today }: { mission: BoardMission; color: MissionColor; today: string }) {
    const progress = missionProgress(mission, today);
    const r = 7;
    const circumference = 2 * Math.PI * r;
    const filled = progress.pace === 'nocontract' ? 0 : Math.min(1, progress.ratio);
    return (
        <span className="relative inline-flex h-5 w-5 shrink-0">
            <svg viewBox="0 0 20 20" className="h-5 w-5 -rotate-90">
                <circle
                    cx="10" cy="10" r={r} fill="none" strokeWidth="2.5"
                    stroke={color.solid} strokeOpacity={0.25}
                    strokeDasharray={progress.pace === 'nocontract' ? '2 2.4' : undefined}
                />
                {filled > 0 && (
                    <circle
                        cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round"
                        stroke={color.solid}
                        strokeDasharray={`${circumference * filled} ${circumference}`}
                    />
                )}
            </svg>
            {(progress.pace === 'over' || progress.pace === 'ending') && (
                <span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white', progress.pace === 'over' ? 'bg-amber-500' : 'bg-rose-500')} />
            )}
        </span>
    );
}

const CHIP_NAME_MAX = 150;
/** Fixed widths around the chips: dock padding, separator, brush, eraser, gaps. */
const TOOLS_WIDTH = 132;
const ABSENCE_WIDTH = 100;
const MORE_WIDTH = 76;

function chipWidth(mission: BoardMission, days: number, selected: boolean): number {
    const name = Math.min(CHIP_NAME_MAX, textWidth(mission.name, 13));
    const count = days > 0 ? 10 + textWidth(formatDays(days), 11) + 10 : 0;
    return 10 + 20 + 8 + name + count + 14 + (selected ? 28 : 0) + 8;
}

interface ToolDockProps {
    /** Ordered: the order stays put while the planner paints. */
    missions: BoardMission[];
    colors: Map<string, MissionColor>;
    today: string;
    brush: Brush;
    canEditAbsences: boolean;
    onBrushChange: (brush: Brush) => void;
    /** Mission the brush button resumes with. */
    lastMissionId: string | null;
    /** Days each mission has in the shown period. */
    periodDays: Map<string, number>;
    onHighlight: (missionId: string | null) => void;
}

export function ToolDock({ missions, colors, today, brush, canEditAbsences, onBrushChange, lastMissionId, periodDays, onHighlight }: ToolDockProps) {
    const selectedId = brush?.kind === 'mission' ? brush.missionId : null;

    // The dock fits as many chips as its width allows — it widens when the
    // sidebar closes — and keeps the rest one click away.
    const wrapRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const { visible, hidden } = useMemo(() => {
        if (width === 0) return { visible: missions.slice(0, 6), hidden: missions.slice(6) };
        const budget = width - TOOLS_WIDTH - (canEditAbsences ? ABSENCE_WIDTH : 0);
        const fitting: BoardMission[] = [];
        let used = 0;
        for (const mission of missions) {
            const w = chipWidth(mission, periodDays.get(mission.id) ?? 0, mission.id === selectedId);
            const reserve = fitting.length + 1 < missions.length ? MORE_WIDTH : 0;
            if (used + w + reserve > budget) break;
            fitting.push(mission);
            used += w;
        }
        // The mission being painted always stays in view.
        if (selectedId && !fitting.some((m) => m.id === selectedId)) {
            const selected = missions.find((m) => m.id === selectedId);
            if (selected) {
                if (fitting.length > 0) fitting.pop();
                fitting.push(selected);
            }
        }
        const shown = new Set(fitting.map((m) => m.id));
        return { visible: fitting, hidden: missions.filter((m) => !shown.has(m.id)) };
    }, [width, missions, periodDays, selectedId, canEditAbsences]);

    const [moreOpen, setMoreOpen] = useState(false);

    return (
        <div ref={wrapRef} className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center px-6">
            <div
                data-guide="dock"
                className="pointer-events-auto relative flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white p-2 shadow-[0_10px_40px_rgba(15,23,42,0.10)]"
            >
                <div className="flex min-w-0 items-center gap-2" onPointerLeave={() => onHighlight(null)}>
                    {missions.length === 0 && (
                        <span className="px-3 text-[12px] text-slate-400">Aucune mission en cours sur cette période</span>
                    )}
                    {visible.map((mission) => {
                        const color = missionColor(colors, mission.id);
                        const selected = selectedId === mission.id;
                        const days = periodDays.get(mission.id) ?? 0;
                        const shortcut = missions.indexOf(mission);
                        return (
                            <button
                                key={mission.id}
                                type="button"
                                onClick={() => onBrushChange(selected ? null : { kind: 'mission', missionId: mission.id })}
                                onPointerEnter={() => onHighlight(mission.id)}
                                title={`${mission.name} · ${mission.clientName}\n${describeProgress(mission, today)}${shortcut < 9 ? `\nRaccourci : ${shortcut + 1}` : ''}`}
                                className={cn(
                                    'flex h-10 shrink-0 items-center gap-2 rounded-full pl-2.5 pr-3.5 text-[13px] font-medium transition-all',
                                    selected ? 'bg-white ring-2 ring-primary-500' : 'hover:brightness-[0.97]',
                                )}
                                style={selected ? { color: color.text } : { backgroundColor: color.bg, color: color.text }}
                            >
                                <ProgressRing mission={mission} color={color} today={today} />
                                <span className="truncate" style={{ maxWidth: CHIP_NAME_MAX }}>{mission.name}</span>
                                {days > 0 && (
                                    <span className="shrink-0 rounded-full bg-white/80 px-1.5 text-[11px] font-semibold tabular-nums" style={{ color: color.text }}>
                                        {formatDays(days)}
                                    </span>
                                )}
                                {selected && <CheckCircle2 className="h-5 w-5 shrink-0 fill-primary-600 text-white" />}
                            </button>
                        );
                    })}
                    {hidden.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setMoreOpen((open) => !open)}
                            className={cn(
                                'flex h-10 shrink-0 items-center rounded-full border border-slate-200 px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50',
                                moreOpen && 'bg-slate-100',
                            )}
                            title="Toutes les missions"
                        >
                            +{hidden.length}
                        </button>
                    )}
                    {canEditAbsences && (
                        <button
                            type="button"
                            onClick={() => onBrushChange(brush?.kind === 'absence' ? null : { kind: 'absence' })}
                            title="Peindre des jours d'absence"
                            className={cn(
                                'flex h-10 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium text-slate-600 transition-all',
                                brush?.kind === 'absence' && 'ring-2 ring-primary-500',
                            )}
                            style={{ background: HATCH }}
                        >
                            Absence
                        </button>
                    )}
                </div>

                <span className="mx-1 h-7 w-px shrink-0 bg-slate-200" />

                <button
                    type="button"
                    onClick={() => {
                        if (brush?.kind === 'mission') onBrushChange(null);
                        else {
                            const id = lastMissionId && missions.some((m) => m.id === lastMissionId) ? lastMissionId : missions[0]?.id;
                            if (id) onBrushChange({ kind: 'mission', missionId: id });
                        }
                    }}
                    title="Pinceau : choisissez une mission puis glissez sur les cases"
                    aria-pressed={brush?.kind === 'mission'}
                    className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                        brush?.kind === 'mission' ? 'bg-primary-100 text-primary-600' : 'text-slate-500 hover:bg-slate-100',
                    )}
                >
                    <BrushIcon className="h-[18px] w-[18px]" />
                </button>
                <button
                    type="button"
                    onClick={() => onBrushChange(brush?.kind === 'eraser' ? null : { kind: 'eraser' })}
                    title="Gomme : glissez sur les cases à vider (E)"
                    aria-pressed={brush?.kind === 'eraser'}
                    className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                        brush?.kind === 'eraser' ? 'bg-rose-100 text-rose-600' : 'text-slate-500 hover:bg-slate-100',
                    )}
                >
                    <Eraser className="h-[18px] w-[18px]" />
                </button>

                {moreOpen && (
                    <MissionPicker
                        missions={missions}
                        colors={colors}
                        today={today}
                        periodDays={periodDays}
                        selectedId={selectedId}
                        onPick={(id) => {
                            onBrushChange({ kind: 'mission', missionId: id });
                            setMoreOpen(false);
                        }}
                        onHighlight={onHighlight}
                        onClose={() => setMoreOpen(false)}
                    />
                )}
            </div>
        </div>
    );
}

/**
 * What the active tool does, shown in the alerts row while painting — out of
 * the board, so it never sits on the rows being painted.
 */
export function BrushHint({ brush, mission, colors, today }: { brush: NonNullable<Brush>; mission: BoardMission | null; colors: Map<string, MissionColor>; today: string }) {
    const key = (k: string) => <b className="font-semibold text-slate-600">{k}</b>;
    return (
        <div className="min-w-0 text-right animate-in fade-in duration-150">
            {mission && (
                <p className="truncate text-[12px] font-semibold" style={{ color: missionColor(colors, mission.id).text }}>
                    {mission.name}
                    <span className="ml-2 font-normal text-slate-500">{describeProgress(mission, today)}</span>
                </p>
            )}
            <p className="truncate text-[11px] text-slate-500">
                {brush.kind === 'mission' && <>Glissez un rectangle · {key('Maj')} : ½ journée · clic sur un nom : toute la ligne · {key('Échap')} : terminer</>}
                {brush.kind === 'absence' && <>Glissez sur les jours d&apos;absence · comptent aussi pour les RH · {key('Échap')} : terminer</>}
                {brush.kind === 'eraser' && <>Glissez un rectangle sur les cases à vider · {key('Échap')} : terminer</>}
            </p>
        </div>
    );
}

function MissionPicker({
    missions,
    colors,
    today,
    periodDays,
    selectedId,
    onPick,
    onHighlight,
    onClose,
}: {
    missions: BoardMission[];
    colors: Map<string, MissionColor>;
    today: string;
    periodDays: Map<string, number>;
    selectedId: string | null;
    onPick: (missionId: string) => void;
    onHighlight: (missionId: string | null) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState('');
    useEffect(() => {
        const onDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) onClose();
        };
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            onHighlight(null);
        };
    }, [onClose, onHighlight]);

    const q = query.trim().toLowerCase();
    const list = missions.filter((m) => !q || `${m.name} ${m.clientName}`.toLowerCase().includes(q));

    return (
        <div
            ref={ref}
            className="absolute bottom-[calc(100%+10px)] left-1/2 w-[380px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_48px_rgba(15,23,42,0.16)] animate-in fade-in slide-in-from-bottom-1 duration-150"
            onPointerLeave={() => onHighlight(null)}
        >
            <label className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher une mission"
                    className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
            </label>
            <ul className="max-h-[320px] overflow-y-auto">
                {list.map((mission) => {
                    const color = missionColor(colors, mission.id);
                    const days = periodDays.get(mission.id) ?? 0;
                    return (
                        <li key={mission.id}>
                            <button
                                type="button"
                                onClick={() => onPick(mission.id)}
                                onPointerEnter={() => onHighlight(mission.id)}
                                className={cn('flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50', selectedId === mission.id && 'bg-primary-50')}
                            >
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.solid }} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium text-slate-800">{mission.name}</span>
                                    <span className="block truncate text-[11px] text-slate-400">{describeProgress(mission, today)}</span>
                                </span>
                                {days > 0 && <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">{formatDays(days)}</span>}
                            </button>
                        </li>
                    );
                })}
                {list.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-slate-400">Aucune mission</li>}
            </ul>
        </div>
    );
}
