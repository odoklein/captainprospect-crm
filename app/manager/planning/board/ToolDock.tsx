'use client';

import { Brush as BrushIcon, CheckCircle2, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardMission } from '@/lib/planning/board-shared';
import { describeProgress, missionColor, missionProgress, type MissionColor } from './engine';
import { HATCH, type Brush } from './BoardGrid';

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

interface ToolDockProps {
    missions: BoardMission[];
    colors: Map<string, MissionColor>;
    today: string;
    brush: Brush;
    canEditAbsences: boolean;
    onBrushChange: (brush: Brush) => void;
    /** Mission the brush button resumes with. */
    lastMissionId: string | null;
}

export function ToolDock({ missions, colors, today, brush, canEditAbsences, onBrushChange, lastMissionId }: ToolDockProps) {
    const selectedMission = brush?.kind === 'mission' ? missions.find((m) => m.id === brush.missionId) ?? null : null;

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2 px-6">
            {brush && (
                <div className="pointer-events-auto max-w-[min(100%,760px)] rounded-2xl border border-slate-200 bg-white/95 px-4 py-2 text-center shadow-[0_6px_24px_rgba(15,23,42,0.08)] backdrop-blur animate-in fade-in slide-in-from-bottom-1 duration-150">
                    {selectedMission && (
                        <p className="truncate text-[12px] font-semibold" style={{ color: missionColor(colors, selectedMission.id).text }}>
                            {selectedMission.name}
                            <span className="ml-2 font-normal text-slate-500">{describeProgress(selectedMission, today)}</span>
                        </p>
                    )}
                    <p className="text-[11px] text-slate-500">
                        {brush.kind === 'mission' && <>Glissez sur les cases · <b className="font-semibold text-slate-600">Maj</b> : ½ journée · clic sur un nom : toute la ligne · <b className="font-semibold text-slate-600">Échap</b> : terminer</>}
                        {brush.kind === 'absence' && <>Glissez sur les jours d&apos;absence (congé, modifiable en cliquant la case) · les absences comptent aussi pour les RH · <b className="font-semibold text-slate-600">Échap</b> : terminer</>}
                        {brush.kind === 'eraser' && <>Glissez sur les cases à vider · <b className="font-semibold text-slate-600">Échap</b> : terminer</>}
                    </p>
                </div>
            )}

            <div
                data-guide="dock"
                className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white p-2 shadow-[0_10px_40px_rgba(15,23,42,0.10)]"
            >
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {missions.length === 0 && (
                        <span className="px-3 text-[12px] text-slate-400">Aucune mission en cours sur cette période</span>
                    )}
                    {missions.map((mission, i) => {
                        const color = missionColor(colors, mission.id);
                        const selected = brush?.kind === 'mission' && brush.missionId === mission.id;
                        return (
                            <button
                                key={mission.id}
                                type="button"
                                onClick={() => onBrushChange(selected ? null : { kind: 'mission', missionId: mission.id })}
                                title={`${mission.name} · ${mission.clientName}\n${describeProgress(mission, today)}${i < 9 ? `\nRaccourci : ${i + 1}` : ''}`}
                                className={cn(
                                    'flex h-10 shrink-0 items-center gap-2 rounded-full pl-2.5 pr-3.5 text-[13px] font-medium transition-all',
                                    selected ? 'bg-white ring-2 ring-indigo-500' : 'hover:brightness-[0.97]',
                                )}
                                style={selected ? { color: color.text } : { backgroundColor: color.bg, color: color.text }}
                            >
                                <ProgressRing mission={mission} color={color} today={today} />
                                <span className="max-w-[160px] truncate">{mission.name}</span>
                                {selected && <CheckCircle2 className="h-5 w-5 fill-indigo-600 text-white" />}
                            </button>
                        );
                    })}
                    {canEditAbsences && (
                        <button
                            type="button"
                            onClick={() => onBrushChange(brush?.kind === 'absence' ? null : { kind: 'absence' })}
                            title="Peindre des jours d'absence"
                            className={cn(
                                'flex h-10 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium text-slate-600 transition-all',
                                brush?.kind === 'absence' && 'ring-2 ring-indigo-500',
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
                        brush?.kind === 'mission' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-100',
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
            </div>
        </div>
    );
}
