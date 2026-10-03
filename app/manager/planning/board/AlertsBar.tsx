'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Copy, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeProgress, formatShortDate, missionColor, type BoardAlerts, type MissionColor, type ViewMode } from './engine';

const PERIOD: Record<ViewMode, string> = {
    week: 'cette semaine',
    twoWeeks: 'sur ces 2 semaines',
    month: 'ce mois-ci',
};

const PERIOD_REST: Record<ViewMode, string> = {
    week: 'd’ici la fin de la semaine',
    twoWeeks: 'd’ici la fin des 2 semaines',
    month: 'd’ici la fin du mois',
};

function Pill({
    tone,
    icon,
    children,
    active,
    onClick,
}: {
    tone: 'red' | 'amber' | 'slate' | 'indigo' | 'green';
    icon: ReactNode;
    children: ReactNode;
    active?: boolean;
    onClick?: () => void;
}) {
    const tones = {
        red: 'bg-rose-50 text-rose-600 hover:bg-rose-100/70',
        amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100/70',
        slate: 'bg-slate-100 text-slate-600 hover:bg-slate-200/70',
        indigo: 'bg-primary-50 text-primary-600 hover:bg-primary-100/70',
        green: 'bg-emerald-50 text-emerald-700',
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                'inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:cursor-default',
                tones[tone],
                active && 'ring-2 ring-current/30',
            )}
        >
            {icon}
            {children}
        </button>
    );
}

function Popover({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
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
        };
    }, [onClose]);
    return (
        <div ref={ref} className="absolute left-0 top-11 z-40 w-[340px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.12)] animate-in fade-in zoom-in-95 duration-100">
            {children}
        </div>
    );
}

interface AlertsBarProps {
    alerts: BoardAlerts;
    view: ViewMode;
    today: string;
    colors: Map<string, MissionColor>;
    filterUnplanned: boolean;
    onToggleUnplanned: () => void;
    onPaintMission: (missionId: string) => void;
    onDedupe: () => void;
    onShowWeekend: () => void;
    /** Number of SDRs on the board, to tell "mostly empty" from "a few gaps". */
    teamSize: number;
    onPlanWeek: () => void;
    onHighlight: (missionId: string | null) => void;
}

export function AlertsBar({
    alerts,
    view,
    today,
    colors,
    filterUnplanned,
    onToggleUnplanned,
    onPaintMission,
    onDedupe,
    onShowWeekend,
    teamSize,
    onPlanWeek,
    onHighlight,
}: AlertsBarProps) {
    const [open, setOpen] = useState<'ending' | 'dupes' | null>(null);
    const unplanned = alerts.unplannedSdrIds.length;
    const ending = alerts.endingMissions.length;

    return (
        <div className="flex flex-wrap items-center gap-2.5" data-guide="alerts">
            {unplanned > 0 || filterUnplanned ? (
                <Pill tone="red" icon={filterUnplanned ? <X className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} active={filterUnplanned} onClick={onToggleUnplanned}>
                    {filterUnplanned
                        ? 'Afficher toute l’équipe'
                        : alerts.unplannedScope === 'rest'
                            ? `${unplanned} SDR sans mission ${PERIOD_REST[view]}`
                            : `${unplanned} SDR sans planning ${PERIOD[view]}`}
                </Pill>
            ) : (
                <Pill tone="green" icon={<CheckCircle2 className="h-4 w-4" />}>Toute l’équipe est planifiée</Pill>
            )}

            {!filterUnplanned && teamSize > 0 && unplanned >= Math.ceil(teamSize / 2) && (
                <Pill tone="indigo" icon={<Copy className="h-4 w-4" />} onClick={onPlanWeek}>
                    Reprendre la semaine précédente
                </Pill>
            )}

            {ending > 0 && (
                <div className="relative">
                    <Pill tone="amber" icon={<Clock className="h-4 w-4" />} active={open === 'ending'} onClick={() => setOpen(open === 'ending' ? null : 'ending')}>
                        {ending} mission{ending > 1 ? 's finissent' : ' finit'} {PERIOD[view]}
                    </Pill>
                    {open === 'ending' && (
                        <Popover onClose={() => setOpen(null)}>
                            <ul className="space-y-1">
                                {alerts.endingMissions.map((mission) => {
                                    const color = missionColor(colors, mission.id);
                                    return (
                                        <li key={mission.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50" onPointerEnter={() => onHighlight(mission.id)} onPointerLeave={() => onHighlight(null)}>
                                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.solid }} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-semibold text-slate-800">{mission.name}</span>
                                                <span className="block truncate text-[11px] text-slate-500">
                                                    Dernier jour {formatShortDate(mission.endDate)} · {describeProgress(mission, today, false)}
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onPaintMission(mission.id);
                                                    setOpen(null);
                                                }}
                                                className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-primary-600 hover:bg-primary-50"
                                            >
                                                Planifier
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Popover>
                    )}
                </div>
            )}

            {alerts.duplicateBlocks > 0 && (
                <div className="relative">
                    <Pill tone="slate" icon={<Info className="h-4 w-4" />} active={open === 'dupes'} onClick={() => setOpen(open === 'dupes' ? null : 'dupes')}>
                        {alerts.duplicateBlocks} doublon{alerts.duplicateBlocks > 1 ? 's' : ''}
                    </Pill>
                    {open === 'dupes' && (
                        <Popover onClose={() => setOpen(null)}>
                            <p className="px-1 text-[13px] text-slate-600">
                                Certains jours comptent plusieurs fois la même mission pour le même SDR (marqués ×2 sur le planning). Le contrat est alors décompté en double.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    onDedupe();
                                    setOpen(null);
                                }}
                                className="mt-3 w-full rounded-xl bg-slate-900 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"
                            >
                                Supprimer les doublons
                            </button>
                        </Popover>
                    )}
                </div>
            )}

            {alerts.weekendBlocks > 0 && (
                <Pill tone="indigo" icon={<Info className="h-4 w-4" />} onClick={onShowWeekend}>
                    {alerts.weekendBlocks} créneau{alerts.weekendBlocks > 1 ? 'x' : ''} le week-end · Afficher
                </Pill>
            )}
        </div>
    );
}
