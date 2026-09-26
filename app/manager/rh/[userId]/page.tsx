"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  History,
  Shield,
  User,
  Wallet,
  Clock,
  RefreshCw,
} from "lucide-react";
import { ContractType, RemunerationMode } from "@/lib/hr/hr-types";
import { HrProfileModal } from "@/components/hr/HrProfileModal";

export default function UserHrPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/hr/profiles/${userId}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de charger le dossier RH");
      }
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) fetchProfile();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
        <p className="text-xs text-slate-500">Chargement du dossier RH...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700">
        {error || "Utilisateur introuvable"}
      </div>
    );
  }

  const { user, profile } = data;

  return (
    <div className="space-y-6">
      {/* Back button & Title */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/manager/rh")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour au tableau RH</span>
        </button>

        <button
          onClick={() => setIsEditOpen(true)}
          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs"
        >
          Modifier la configuration RH
        </button>
      </div>

      {/* User Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{user.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <span>{user.email}</span>
              <span>•</span>
              <span className="font-semibold text-indigo-600 capitalize">
                {user.role === "SDR" || user.role === "BOOKER" ? "Booker" : user.role}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-slate-400 block">Manager</span>
          <span className="text-xs font-semibold text-slate-800">
            {user.manager?.name || "Non assigné"}
          </span>
        </div>
      </div>

      {/* Profile Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Briefcase className="w-4 h-4 text-indigo-500" />
            <span>Contrat & Mode</span>
          </div>
          <p className="text-sm font-bold text-slate-900">
            {profile.contractType === ContractType.SALARIE ? "Salarié (CDI/CDD)" : "Indépendant"}
          </p>
          <span className="text-xs text-slate-500 block">
            Mode : {profile.remunerationMode}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Wallet className="w-4 h-4 text-emerald-500" />
            <span>Rémunération de base</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">
            {(profile.fixedSalaryCents / 100).toFixed(2)} € / mois
          </p>
          <span className="text-xs text-slate-500 block">
            + {(profile.variablePerRdvCents / 100).toFixed(2)} € par RDV validé
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Calendar className="w-4 h-4 text-purple-500" />
            <span>Objectifs & Effet</span>
          </div>
          <p className="text-sm font-bold text-slate-900">
            {profile.dailyQuota} appels / jour
          </p>
          <span className="text-xs text-slate-500 block">
            En vigueur depuis le{" "}
            {new Date(profile.effectiveFrom).toLocaleDateString("fr-FR")}
          </span>
        </div>
      </div>

      {/* Snapshots / History of Changes */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <History className="w-4 h-4 text-indigo-600" />
          <span>Historique des modifications de règles (Snapshots)</span>
        </div>

        {profile.snapshots && profile.snapshots.length > 0 ? (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden text-xs">
            {profile.snapshots.map((s: any) => (
              <div key={s.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-800">
                    Fixe: {(s.fixedSalaryCents / 100).toFixed(2)} € • Variable: {(s.variablePerRdvCents / 100).toFixed(2)} € • Quota: {s.dailyQuota}/j
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {s.reason || "Modification effectuée"}
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  {new Date(s.changedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            Aucun historique de modification pour ce collaborateur (règles initiales).
          </p>
        )}
      </div>

      {/* Edit Modal */}
      {isEditOpen && (
        <HrProfileModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          userId={user.id}
          userName={user.name}
          onProfileSaved={fetchProfile}
        />
      )}
    </div>
  );
}
