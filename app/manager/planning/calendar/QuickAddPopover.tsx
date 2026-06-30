'use client';

import { useState, useEffect, useMemo, forwardRef } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui';
import type { CalTeamMember, CellPosition, MissionOption, QuickAddCell } from './types';
import type { SnapshotMission } from '../PlanningMonthContext';
import { findAllocationIdForMission, formatFullDate } from './utils';

interface QuickAddPopoverProps {
    cell: QuickAddCell;
    position: CellPosition;
    team: CalTeamMember[];
    missions: SnapshotMission[];
    month: string;
    selectedDates: string[];
    onClose: () => void;
    onCreated: () => Promise<void>;
    assignSdrToMission: (missionId: string, sdrId: string) => Promise<boolean>;
}

const fieldClass =
    'mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-shadow';
const labelClass = 'text-[10px] text-slate-500 font-semibold uppercase tracking-wider';

export const QuickAddPopover = forwardRef<HTMLDivElement, QuickAddPopoverProps>(function QuickAddPopover(
    {
        cell,
        position,
        team,
        missions,
        month,
        selectedDates,
        onClose,
        onCreated,
        assignSdrToMission,
    },
    ref,
) {
    const { success, error: showError } = useToast();
    const [sdrId, setSdrId] = useState(cell.sdrId);
    const [missionId, setMissionId] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [submitting, setSubmitting] = useState(false);
    const [applyToSelectedDates, setApplyToSelectedDates] = useState(true);

    useEffect(() => {
        setSdrId(cell.sdrId);
        setMissionId('');
        setApplyToSelectedDates(true);
        setStartTime('09:00');
        setEndTime('17:00');
    }, [cell]);

    const missionOptions = useMemo(() => {
        if (!sdrId) {
            return {
                allocated: [] as MissionOption[],
                others: missions.map((mission) => ({ mission, allocationId: null })),
            };
        }

        const allocated: MissionOption[] = [];
        const others: MissionOption[] = [];

        for (const mission of missions) {
            const allocationId = findAllocationIdForMission([mission], month, mission.id, sdrId);
            if (allocationId) {
                allocated.push({ mission, allocationId });
            } else {
                others.push({ mission, allocationId: null });
            }
        }

        return { allocated, others };
    }, [missions, month, sdrId]);

    useEffect(() => {
        if (!missionId) return;
        const exists = [...missionOptions.allocated, ...missionOptions.others].some((entry) => entry.mission.id === missionId);
        if (!exists) setMissionId('');
    }, [missionId, missionOptions]);

    const selectedSdr = team.find((member) => member.id === sdrId);
    const selectedMission = [...missionOptions.allocated, ...missionOptions.others].find((entry) => entry.mission.id === missionId);
    const effectiveSelectedDates = useMemo(() => {
        if (!cell.sdrId) return [cell.date];
        const dates = selectedDates.includes(cell.date) ? selectedDates : [cell.date, ...selectedDates];
        const unique = Array.from(new Set(dates));
        return unique.sort((a, b) => a.localeCompare(b));
    }, [cell.date, cell.sdrId, selectedDates]);
    const canBulkCreate = !!cell.sdrId && effectiveSelectedDates.length > 1;
    const targetDates = canBulkCreate && applyToSelectedDates ? effectiveSelectedDates : [cell.date];

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!sdrId || !missionId) return;

        setSubmitting(true);
        try {
            const isAssigned = selectedMission?.mission.sdrAssignments.some((assignment) => assignment.sdr.id === sdrId) ?? false;
            if (!isAssigned) {
                const ok = await assignSdrToMission(missionId, sdrId);
                if (!ok) {
                    setSubmitting(false);
                    return;
                }
            }

            let createdCount = 0;
            let firstError: string | null = null;
            for (const date of targetDates) {
                const res = await fetch('/api/planning', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sdrId,
                        missionId,
                        date,
                        startTime,
                        endTime,
                        ...(selectedMission?.allocationId ? { allocationId: selectedMission.allocationId } : {}),
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    createdCount += 1;
                } else if (!firstError) {
                    firstError = json.error || 'Impossible de créer le créneau';
                }
            }
            if (createdCount > 0) {
                const label = createdCount > 1 ? `${createdCount} créneaux créés` : 'Créneau créé';
                success(label, `${startTime}–${endTime}`);
                await onCreated();
            } else {
                showError('Erreur', firstError || 'Impossible de créer le créneau');
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            ref={ref}
            className="fixed z-40 w-[320px] rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-2xl shadow-slate-900/15 animate-in fade-in zoom-in-95 duration-150"
            style={{ top: position.top, left: position.left }}
        >
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Nouveau créneau</p>
                        <p className="text-xs text-slate-500 mt-1 capitalize">
                            {formatFullDate(cell.date)}
                            {selectedSdr && <> · {selectedSdr.name}</>}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {!cell.sdrId && (
                    <div>
                        <label className={labelClass}>SDR</label>
                        <select
                            value={sdrId}
                            onChange={(event) => setSdrId(event.target.value)}
                            className={fieldClass}
                            required
                        >
                            <option value="">Sélectionner...</option>
                            {team.map((member) => (
                                <option key={member.id} value={member.id}>{member.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label className={labelClass}>Mission</label>
                    <select
                        value={missionId}
                        onChange={(event) => setMissionId(event.target.value)}
                        className={`${fieldClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                        required
                        disabled={!sdrId}
                    >
                        <option value="">Sélectionner...</option>
                        {missionOptions.allocated.length > 0 && (
                            <optgroup label="Missions allouées">
                                {missionOptions.allocated.map((entry) => (
                                    <option key={entry.mission.id} value={entry.mission.id}>
                                        {entry.mission.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {missionOptions.others.length > 0 && (
                            <optgroup label="Autres missions">
                                {missionOptions.others.map((entry) => (
                                    <option key={entry.mission.id} value={entry.mission.id}>
                                        {entry.mission.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className={labelClass}>Début</label>
                        <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={fieldClass} required />
                    </div>
                    <div>
                        <label className={labelClass}>Fin</label>
                        <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={fieldClass} required />
                    </div>
                </div>

                {canBulkCreate && (
                    <label className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-2.5 py-2">
                        <input
                            type="checkbox"
                            checked={applyToSelectedDates}
                            onChange={(event) => setApplyToSelectedDates(event.target.checked)}
                            className="mt-0.5 accent-indigo-600"
                        />
                        <span className="text-[11px] text-slate-600">
                            Appliquer aux {effectiveSelectedDates.length} jours sélectionnés
                        </span>
                    </label>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                    <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors">
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={submitting || !sdrId || !missionId}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-600 text-white text-xs font-semibold shadow-sm shadow-indigo-500/25 hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Créer
                    </button>
                </div>
            </form>
        </div>
    );
});
