'use client';

import { useState, useMemo } from 'react';
import { X, Plus, Clock, Loader2, Check, Trash2, UserCircle, CalendarDays, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui';
import { getMissionColor } from '../planning-utils';
import { CHANNEL_ICONS } from './utils';
import type { CalBlock, CalTeamMember } from './types';
import type { SnapshotMission } from '../PlanningMonthContext';

const fieldClass =
    'mt-0.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-shadow';
const labelClass = 'text-[10px] text-slate-500 font-semibold uppercase tracking-wider';

export function DayPanel({
    date,
    blocks,
    team,
    missions,
    onClose,
    showAddForm,
    setShowAddForm,
    onReload,
}: {
    date: string;
    blocks: CalBlock[];
    team: CalTeamMember[];
    missions: SnapshotMission[];
    onClose: () => void;
    showAddForm: boolean;
    setShowAddForm: (value: boolean) => void;
    onReload: () => Promise<void>;
}) {
    const { success, error: showError } = useToast();
    const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    const [cancelling, setCancelling] = useState<string | null>(null);
    const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
    const [updatingMissionId, setUpdatingMissionId] = useState<string | null>(null);

    async function handleCancel(blockId: string) {
        setCancelling(blockId);
        try {
            const res = await fetch(`/api/planning/${blockId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'CANCELLED' }),
            });
            const json = await res.json();
            if (json.success) {
                success('Créneau annulé', '');
                await onReload();
            } else {
                showError('Erreur', json.error || "Impossible d'annuler");
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setCancelling(null);
            setPendingCancelId(null);
        }
    }

    async function handleUpdateMission(blockId: string, missionId: string) {
        setUpdatingMissionId(blockId);
        try {
            const res = await fetch(`/api/planning/${blockId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ missionId }),
            });
            const json = await res.json();
            if (json.success) {
                success('Mission mise à jour', 'Le créneau a été réaffecté.');
                await onReload();
            } else {
                showError('Erreur', json.error || 'Impossible de modifier la mission');
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setUpdatingMissionId(null);
        }
    }

    const sdrGroups = useMemo(() => {
        const groups = new Map<string, { sdr: CalBlock['sdr']; blocks: CalBlock[] }>();
        for (const block of blocks) {
            if (!groups.has(block.sdr.id)) groups.set(block.sdr.id, { sdr: block.sdr, blocks: [] });
            groups.get(block.sdr.id)?.blocks.push(block);
        }
        return [...groups.values()];
    }, [blocks]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 capitalize">{dayLabel}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        {blocks.length} créneau{blocks.length !== 1 ? 'x' : ''}
                        {sdrGroups.length > 0 && <> · {sdrGroups.length} SDR{sdrGroups.length > 1 ? 's' : ''}</>}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className={cn(
                            'p-2 rounded-lg transition-colors',
                            showAddForm ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-400 hover:text-indigo-500',
                        )}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {showAddForm && (
                <AddBlockForm
                    date={date}
                    team={team}
                    missions={missions}
                    onCreated={async () => {
                        setShowAddForm(false);
                        await onReload();
                    }}
                    onCancel={() => setShowAddForm(false)}
                />
            )}

            <div className="flex-1 overflow-y-auto">
                {blocks.length === 0 && !showAddForm && (
                    <button
                        type="button"
                        onClick={() => setShowAddForm(true)}
                        className="flex flex-col items-center justify-center py-16 text-slate-400 w-full hover:bg-slate-50 transition-colors"
                    >
                        <CalendarDays className="w-10 h-10 mb-3 text-slate-200" />
                        <p className="text-sm font-medium text-slate-500">Aucun créneau</p>
                        <p className="text-xs mt-1 text-indigo-500 font-medium">
                            Cliquez ici pour planifier un créneau.
                        </p>
                    </button>
                )}

                {sdrGroups.map(({ sdr, blocks: sdrBlocks }) => (
                    <div key={sdr.id} className="border-b border-slate-100">
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/60">
                            <UserCircle className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-bold text-slate-700">{sdr.name}</span>
                            <span className="text-[10px] text-slate-400">{sdrBlocks.length} créneau{sdrBlocks.length > 1 ? 'x' : ''}</span>
                        </div>
                        <div className="px-3 py-2 space-y-2">
                            {sdrBlocks.map((block) => {
                                const color = getMissionColor(block.mission.id);
                                const Icon = CHANNEL_ICONS[block.mission.channel] || Phone;
                                const isUpdatingMission = updatingMissionId === block.id;

                                return (
                                    <div
                                        key={block.id}
                                        className="rounded-xl p-3 border bg-white transition-shadow hover:shadow-md hover:shadow-slate-900/[0.04]"
                                        style={{ borderColor: color.hex + '40', borderLeftWidth: '4px', borderLeftColor: color.hex }}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={cn('w-5 h-5 rounded-md flex items-center justify-center', color.bg)}>
                                                        <Icon className={cn('w-3 h-3', color.text)} />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-800 truncate">{block.mission.name}</span>
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-0.5 ml-6">{block.mission.client.name}</p>
                                                <div className="mt-2 ml-6">
                                                    <label className={`block ${labelClass} mb-1`}>
                                                        Mission
                                                    </label>
                                                    <select
                                                        value={block.mission.id}
                                                        disabled={isUpdatingMission || cancelling === block.id}
                                                        onChange={(event) => {
                                                            const nextMissionId = event.target.value;
                                                            if (!nextMissionId || nextMissionId === block.mission.id) return;
                                                            void handleUpdateMission(block.id, nextMissionId);
                                                        }}
                                                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none disabled:opacity-60 transition-shadow"
                                                    >
                                                        {missions.map((mission) => (
                                                            <option key={mission.id} value={mission.id}>
                                                                {mission.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (pendingCancelId === block.id) {
                                                        void handleCancel(block.id);
                                                    } else {
                                                        setPendingCancelId(block.id);
                                                    }
                                                }}
                                                disabled={cancelling === block.id}
                                                className={cn(
                                                    'p-1 rounded-lg flex-shrink-0 transition-colors',
                                                    pendingCancelId === block.id
                                                        ? 'bg-red-50 text-red-600'
                                                        : 'text-slate-300 hover:text-red-500 hover:bg-red-50',
                                                )}
                                                title={pendingCancelId === block.id ? 'Confirmer ?' : 'Annuler'}
                                            >
                                                {cancelling === block.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3 mt-2 ml-6 text-[11px]">
                                            <div className="flex items-center gap-1 text-slate-500">
                                                <Clock className="w-3 h-3 text-slate-400" />
                                                <span className="font-medium">{block.startTime} – {block.endTime}</span>
                                            </div>
                                            {isUpdatingMission && (
                                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600">
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                    Mise à jour...
                                                </span>
                                            )}
                                            {block.suggestionStatus && (
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                                                        block.suggestionStatus === 'CONFIRMED' && 'bg-emerald-50 text-emerald-700',
                                                        block.suggestionStatus === 'SUGGESTED' && 'bg-amber-50 text-amber-700',
                                                    )}
                                                >
                                                    {block.suggestionStatus === 'CONFIRMED' && (
                                                        <>
                                                            <Check className="w-2.5 h-2.5" /> Confirmé
                                                        </>
                                                    )}
                                                    {block.suggestionStatus === 'SUGGESTED' && 'Suggestion'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-3 pb-3">
                            <button
                                type="button"
                                onClick={() => setShowAddForm(true)}
                                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg py-2 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Ajouter mission
                            </button>
                        </div>
                    </div>
                ))}

                {blocks.length > 0 && !showAddForm && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-600">
                        Pour planifier automatiquement plusieurs jours sur une mission, utilisez l&apos;affectation dans la carte mission.
                    </div>
                )}
            </div>
        </div>
    );
}

function AddBlockForm({
    date,
    team,
    missions,
    onCreated,
    onCancel,
}: {
    date: string;
    team: CalTeamMember[];
    missions: SnapshotMission[];
    onCreated: () => Promise<void>;
    onCancel: () => void;
}) {
    const { success, error: showError } = useToast();
    const [sdrId, setSdrId] = useState('');
    const [missionId, setMissionId] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!sdrId || !missionId) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/planning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sdrId, missionId, date, startTime, endTime }),
            });
            const json = await res.json();
            if (json.success) {
                success('Créneau créé', `${startTime}–${endTime}`);
                await onCreated();
            } else {
                showError('Erreur', json.error || 'Impossible de créer le créneau');
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="border-b border-slate-200 px-4 py-3 space-y-3 bg-indigo-50/40 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-xs font-bold text-slate-700">Nouveau créneau</p>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={labelClass}>SDR</label>
                    <select value={sdrId} onChange={(event) => setSdrId(event.target.value)} className={fieldClass} required>
                        <option value="">Sélectionner...</option>
                        {team.map((member) => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Mission</label>
                    <select value={missionId} onChange={(event) => setMissionId(event.target.value)} className={fieldClass} required>
                        <option value="">Sélectionner...</option>
                        {missions.map((mission) => (
                            <option key={mission.id} value={mission.id}>{mission.name}</option>
                        ))}
                    </select>
                </div>
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

            <div className="flex items-center gap-2 pt-1">
                <button
                    type="submit"
                    disabled={submitting || !sdrId || !missionId}
                    className="flex-1 py-2 bg-gradient-to-b from-indigo-500 to-indigo-600 text-white text-xs font-semibold rounded-lg shadow-sm shadow-indigo-500/25 hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
                >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Créer le créneau
                </button>
                <button type="button" onClick={onCancel} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors">
                    Annuler
                </button>
            </div>
        </form>
    );
}
