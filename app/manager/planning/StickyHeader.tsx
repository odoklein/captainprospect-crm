'use client';

import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw } from 'lucide-react';
import { usePlanningMonth } from './PlanningMonthContext';
import { formatMonthLabel, prevMonth as prevMonthFn, nextMonth as nextMonthFn } from './planning-utils';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function StickyHeader() {
    const { month, setMonth, snapshot, loading, reload } = usePlanningMonth();
    const [refreshing, setRefreshing] = useState(false);

    const health = snapshot?.healthSummary;
    const missionsNoSdr = health?.missions.noSdr ?? 0;
    const sdrsOverloaded = health?.sdrs.overloaded ?? 0;

    async function handleRefresh() {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
    }

    const today = new Date();
    const isCurrentMonth = month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    return (
        <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
            <div className="px-6 py-3">
                <div className="flex items-center justify-between gap-4">
                    {/* Left — Month navigation */}
                    <div className="flex items-center gap-3">
                        <CalendarDays className="w-5 h-5 text-indigo-500" />
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                            <button
                                onClick={() => setMonth(prevMonthFn(month))}
                                className="p-2 hover:bg-slate-100 border-r border-slate-200 text-slate-500 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-5 py-1.5 text-sm font-bold text-slate-800 min-w-[150px] text-center capitalize select-none">
                                {formatMonthLabel(month)}
                            </span>
                            <button
                                onClick={() => setMonth(nextMonthFn(month))}
                                className="p-2 hover:bg-slate-100 border-l border-slate-200 text-slate-500 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        {!isCurrentMonth && (
                            <button
                                onClick={() => {
                                    const d = new Date();
                                    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                                }}
                                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                            >
                                Aujourd&apos;hui
                            </button>
                        )}
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing || loading}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors disabled:opacity-30"
                            title="Rafraîchir"
                        >
                            <RefreshCw className={cn('w-4 h-4', (refreshing || loading) && 'animate-spin')} />
                        </button>
                    </div>

                    {/* Right — actionable alerts only */}
                    {health && !loading && (missionsNoSdr > 0 || sdrsOverloaded > 0) && (
                        <div className="flex items-center gap-2 text-xs">
                            {missionsNoSdr > 0 && (
                                <Alert count={missionsNoSdr} label={`mission${missionsNoSdr > 1 ? 's' : ''} sans SDR`} />
                            )}
                            {sdrsOverloaded > 0 && (
                                <Alert count={sdrsOverloaded} label={`SDR surchargé${sdrsOverloaded > 1 ? 's' : ''}`} />
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="h-px w-full bg-slate-200" />
        </div>
    );
}

function Alert({ count, label }: { count: number; label: string }) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {count} {label}
        </span>
    );
}
