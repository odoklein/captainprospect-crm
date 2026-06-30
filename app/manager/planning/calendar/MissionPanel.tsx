'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatMonthLabel } from '../planning-utils';
import { formatDayValue, formatShortDate } from './utils';
import type { ClientTargets } from './types';

export function MissionPanel({
    month,
    clients,
}: {
    month: string;
    clients: ClientTargets[];
}) {
    const [showCompleted, setShowCompleted] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const visibleClients = clients
        .map((client) => ({
            ...client,
            missions: showCompleted
                ? client.missions
                : client.missions.filter((m) => m.monthRemainingDays > 0 || m.monthTargetDays === 0),
        }))
        .filter((client) => client.missions.length > 0);

    const hiddenCount = clients.reduce((sum, c) => sum + c.missions.length, 0)
        - visibleClients.reduce((sum, c) => sum + c.missions.length, 0);

    return (
        <aside className="w-[300px] flex-shrink-0 border-r border-slate-200 bg-slate-50/40 overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Missions du mois</h3>
                    {(hiddenCount > 0 || showCompleted) && (
                        <button
                            onClick={() => setShowCompleted((v) => !v)}
                            className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap transition-colors"
                        >
                            {showCompleted ? 'Masquer terminées' : `+${hiddenCount} terminée${hiddenCount > 1 ? 's' : ''}`}
                        </button>
                    )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 capitalize">{formatMonthLabel(month)}</p>
            </div>

            <div className="px-3 py-3 space-y-3">
                {visibleClients.length === 0 ? (
                    <div className="text-xs text-slate-500 rounded-xl border border-slate-200 bg-white px-3 py-4 text-center">
                        {clients.length === 0 ? 'Aucune mission active ce mois.' : 'Toutes les missions sont à jour 🎉'}
                    </div>
                ) : (
                    visibleClients.map((client) => (
                        <div key={client.clientName} className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03] overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60">
                                <p className="text-xs font-semibold text-slate-800 truncate">{client.clientName}</p>
                            </div>
                            <div className="px-2 py-2 space-y-1.5">
                                {client.missions.map((mission) => {
                                    const target = mission.monthTargetDays > 0 ? mission.monthTargetDays : mission.suggestedMonthTargetDays;
                                    const pct = target > 0 ? Math.min(100, Math.round((mission.monthAllocatedDays / target) * 100)) : 0;
                                    const noDaysPlaced = mission.monthScheduledDays === 0 && target > 0;
                                    const barClass = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-indigo-500' : 'bg-amber-500';
                                    const isOpen = expandedId === mission.id;
                                    return (
                                        <div
                                            key={mission.id}
                                            className={cn(
                                                'rounded-xl px-2.5 py-2 border transition-colors',
                                                isOpen ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/60',
                                            )}
                                        >
                                            <button
                                                onClick={() => setExpandedId(isOpen ? null : mission.id)}
                                                className="w-full flex items-center justify-between gap-2 text-left"
                                            >
                                                <span className="flex items-center gap-1.5 min-w-0">
                                                    {noDaysPlaced && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 animate-pulse" title="Aucun jour placé ce mois" />
                                                    )}
                                                    <span className="text-[11px] font-semibold text-slate-700 truncate">{mission.name}</span>
                                                </span>
                                                <span className={cn(
                                                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap',
                                                    mission.shouldAddThisWeek ? 'text-amber-700 bg-amber-100/70' : 'text-emerald-700 bg-emerald-100/70',
                                                )}>
                                                    {mission.shouldAddThisWeek ? `+${formatDayValue(mission.weekRecommendedAddDays)}` : 'OK'}
                                                </span>
                                            </button>

                                            <div className="mt-1.5 flex items-center gap-2">
                                                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <div className={cn('h-full rounded-full transition-all duration-500', barClass)} style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[10px] text-slate-500 whitespace-nowrap tabular-nums">
                                                    {formatDayValue(mission.monthAllocatedDays)}/{target}j
                                                </span>
                                            </div>

                                            {isOpen && (
                                                <div className="mt-2 pt-2 border-t border-slate-200/70 space-y-1 text-[10px] text-slate-600 animate-in fade-in slide-in-from-top-1 duration-150">
                                                    <div className="flex justify-between">
                                                        <span>Reste ce mois</span>
                                                        <span className="font-medium">{mission.monthRemainingDays}j</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Placés cette semaine</span>
                                                        <span className="font-medium">{formatDayValue(mission.weekPlacedDays)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Contrat / planifiés</span>
                                                        <span className="font-medium">
                                                            {mission.totalContractDays != null ? `${mission.totalContractDays}j` : 'n/a'} / {mission.totalPlannedDays}j
                                                        </span>
                                                    </div>
                                                    {mission.contractDeltaDays != null && mission.contractDeltaDays !== 0 && (
                                                        <div className="flex justify-between">
                                                            <span>{mission.contractDeltaDays > 0 ? 'Sous-planifié' : 'Sur-planifié'}</span>
                                                            <span className={cn('font-medium', mission.contractDeltaDays > 0 ? 'text-amber-700' : 'text-red-700')}>
                                                                {Math.abs(mission.contractDeltaDays)}j
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between text-slate-400">
                                                        <span>Période</span>
                                                        <span>{formatShortDate(mission.startDate)} → {formatShortDate(mission.endDate)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}
