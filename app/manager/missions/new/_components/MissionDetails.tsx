"use client";

import { Card, Input, Select } from "@/components/ui";
import { CreateMissionInput } from "@/app/actions/mission-wizard";
import { PitchBlockEditor } from "@/components/strategy";

interface Client {
    id: string;
    name: string;
}

interface MissionDetailsProps {
    data: CreateMissionInput;
    onChange: (data: CreateMissionInput) => void;
    clients: Client[];
    errors: Record<string, string>;
}

export function MissionDetails({ data, onChange, clients, errors }: MissionDetailsProps) {
    const handleChange = (field: keyof CreateMissionInput, value: any) => {
        onChange({ ...data, [field]: value });
    };

    return (
        <div className="space-y-6">
            {/* Mission Info */}
            <Card className="p-6">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">Détails de la mission</h3>
                        <p className="text-sm text-slate-500 mb-6">Informations générales et objectifs</p>
                    </div>

                    {/* Client */}
                    <Select
                        label="Client *"
                        placeholder="Sélectionner un client..."
                        options={clients.map(c => ({ value: c.id, label: c.name }))}
                        value={data.clientId}
                        onChange={(val) => handleChange("clientId", val)}
                        error={errors.clientId}
                        searchable
                    />

                    {/* Name */}
                    <Input
                        label="Nom de la mission *"
                        value={data.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        placeholder="Ex: Prospection SaaS Q1 2026"
                        error={errors.name}
                    />

                    {/* Objective */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Objectif
                        </label>
                        <textarea
                            value={data.objective}
                            onChange={(e) => handleChange("objective", e.target.value)}
                            placeholder="Ex: Générer 50 meetings qualifiés"
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                        />
                    </div>

                    {/* Channels (multi-select) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Canaux *
                        </label>
                        <p className="text-xs text-slate-500 mb-2">Sélectionnez un ou plusieurs canaux (appels, email, LinkedIn peuvent être utilisés ensemble).</p>
                        <div className="flex flex-wrap gap-3">
                            {[
                                { value: "CALL" as const, label: "📞 Appel téléphonique" },
                                { value: "EMAIL" as const, label: "📧 Email" },
                                { value: "LINKEDIN" as const, label: "💼 LinkedIn" },
                            ].map((opt) => {
                                const channels = (data as CreateMissionInput & { channels?: string[] }).channels ?? [data.channel];
                                const isSelected = channels.includes(opt.value);
                                return (
                                    <label
                                        key={opt.value}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                                            isSelected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {
                                                const current = (data as CreateMissionInput & { channels?: string[] }).channels ?? [data.channel];
                                                const next = isSelected
                                                    ? current.filter((c: string) => c !== opt.value)
                                                    : [...current, opt.value];
                                                if (next.length === 0) return;
                                                onChange({
                                                    ...data,
                                                    channels: next,
                                                    channel: next[0] as CreateMissionInput["channel"],
                                                });
                                            }}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        {errors.channel && <p className="text-xs text-red-500 mt-1 font-medium">{errors.channel}</p>}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Date de début"
                            type="date"
                            value={data.startDate}
                            onChange={(e) => handleChange("startDate", e.target.value)}
                        />
                        <Input
                            label="Date de fin"
                            type="date"
                            value={data.endDate}
                            onChange={(e) => handleChange("endDate", e.target.value)}
                            error={errors.endDate}
                        />
                    </div>
                </div>
            </Card>

            {/* Campaign / Strategy Info */}
            <Card className="p-6">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">Stratégie de prospection</h3>
                        <p className="text-sm text-slate-500 mb-6">Cible et argumentaire commercial</p>
                    </div>

                    {/* ICP */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            ICP (Profil Client Idéal) *
                        </label>
                        <textarea
                            value={data.icp}
                            onChange={(e) => handleChange("icp", e.target.value)}
                            placeholder="Ex: CEOs de startups B2B SaaS entre 10 et 50 employés en France."
                            rows={3}
                            className={`w-full px-4 py-2.5 bg-white border rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all resize-none ${errors.icp ? "border-red-500" : "border-slate-200"}`}
                        />
                        {errors.icp && (
                            <p className="text-xs text-red-500 mt-1 font-medium">{errors.icp}</p>
                        )}
                    </div>

                    {/* Pitch */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Pitch Commercial *
                        </label>
                        <PitchBlockEditor
                            value={data.pitch}
                            onChange={(val) => handleChange("pitch", val)}
                            icp={data.icp}
                            channel={data.channel}
                            placeholder="Ex: Nous aidons les CEOs à automatiser leur prospection pour gagner 10h par semaine."
                            error={errors.pitch}
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
}
