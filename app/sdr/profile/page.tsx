"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
    Camera,
    Save,
    Phone,
    Zap,
    Calendar,
    TrendingUp,
    Flame,
    Star,
    Trophy,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui";

interface Profile {
    name: string;
    email: string;
    phone: string;
    timezone: string;
    avatar: string | null;
    role: string;
}

interface GamStats {
    xp: number;
    level: number;
    xpToNext: { current: number; needed: number; progress: number };
    streak: { current: number; longest: number; isActive: boolean };
    dailyGoal: { target: number; actual: number; progress: number };
    recentAchievements: { code: string; name: string; icon: string; tier: string; unlockedAt: string }[];
    rank: { position: number; total: number };
}

interface Achievement {
    code: string;
    name: string;
    description: string;
    icon: string;
    tier: string;
    unlocked: boolean;
    progress: number;
}

const ROLE_LABELS: Record<string, string> = {
    SDR: "SDR",
    BUSINESS_DEVELOPER: "Business Dev",
    BOOKER: "Booker",
};

const TIMEZONES = [
    "Europe/Paris", "Europe/London", "Europe/Berlin", "Europe/Madrid",
    "Europe/Rome", "Europe/Brussels", "America/New_York", "America/Los_Angeles",
    "Africa/Casablanca", "Africa/Tunis", "Africa/Algiers",
];

export default function SDRProfilePage() {
    const { data: session } = useSession();
    const { success, error: showError } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [profile, setProfile] = useState<Profile | null>(null);
    const [gamStats, setGamStats] = useState<GamStats | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);

    const [form, setForm] = useState({
        name: "",
        phone: "",
        timezone: "Europe/Paris",
        dailyGoal: 80,
    });

    useEffect(() => {
        Promise.all([
            fetch("/api/users/me/profile").then((r) => r.json()),
            fetch("/api/sdr/gamification/stats").then((r) => r.json()),
            fetch("/api/sdr/gamification/achievements").then((r) => r.json()),
        ])
            .then(([profileJson, gamJson, achJson]) => {
                if (profileJson.success && profileJson.data) {
                    const p = profileJson.data;
                    setProfile({
                        name: p.name,
                        email: p.email,
                        phone: p.phone || "",
                        timezone: p.timezone || "Europe/Paris",
                        avatar: p.avatar || null,
                        role: p.role,
                    });
                    setForm({
                        name: p.name,
                        phone: p.phone || "",
                        timezone: p.timezone || "Europe/Paris",
                        dailyGoal: p.preferences?.dailyGoal || p.dailyGoal || 80,
                    });
                }
                if (gamJson.success) setGamStats(gamJson.data);
                if (achJson.success) setAchievements(achJson.data.achievements || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !session?.user?.id) return;

        try {
            setAvatarUploading(true);
            const fd = new FormData();
            fd.append("file", file);

            const uploadRes = await fetch("/api/files/upload", { method: "POST", body: fd });
            const uploadJson = await uploadRes.json();
            if (!uploadJson.success) throw new Error(uploadJson.error);

            const avatarUrl = uploadJson.data.url;
            const patchRes = await fetch(`/api/users/${session.user.id}/avatar`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatarUrl }),
            });
            const patchJson = await patchRes.json();
            if (!patchJson.success) throw new Error(patchJson.error);

            setProfile((prev) => prev ? { ...prev, avatar: avatarUrl } : prev);
            success("Avatar mis à jour", "Votre photo de profil a été changée.");
        } catch (err: any) {
            showError("Erreur", err?.message || "Impossible de mettre à jour l'avatar");
        } finally {
            setAvatarUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await fetch("/api/users/me/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    phone: form.phone || null,
                    timezone: form.timezone,
                    preferences: { dailyGoal: form.dailyGoal },
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            success("Profil sauvegardé", "Vos informations ont été mises à jour.");
        } catch (err: any) {
            showError("Erreur", err?.message || "Impossible de sauvegarder");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
        );
    }

    const initials = (profile?.name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    const unlockedAchievements = achievements.filter((a) => a.unlocked);

    return (
        <div className="min-h-full bg-[#F4F6F9] p-4 md:p-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <PageHeader title="Mon Profil" subtitle="Gérez vos informations personnelles et vos préférences" />

            {/* Profile Header */}
            <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-2xl border border-slate-200 p-6 mb-6">
                <div className="flex items-center gap-5 flex-wrap">
                    {/* Avatar */}
                    <div className="relative group">
                        <div className="w-20 h-20 rounded-2xl user-avatar-ring overflow-hidden">
                            {avatarUploading ? (
                                <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : profile?.avatar ? (
                                <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                                    {initials}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-indigo-50 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Camera className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900">{profile?.name}</h2>
                        <p className="text-sm text-slate-500">{profile?.email}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                {ROLE_LABELS[profile?.role || "SDR"] || profile?.role}
                            </span>
                            {gamStats && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                                    <Star className="w-3 h-3" />
                                    Niveau {gamStats.level}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Stats Cards */}
                <div className="space-y-4">
                    {gamStats && (
                        <>
                            <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Zap className="w-4 h-4 text-indigo-500" />
                                    <span className="text-sm font-semibold text-slate-700">XP Total</span>
                                </div>
                                <p className="text-3xl font-bold text-slate-900">{gamStats.xp.toLocaleString()}</p>
                                <div className="xp-bar mt-2">
                                    <div className="xp-bar-fill" style={{ width: `${gamStats.xpToNext.progress}%` }} />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    {gamStats.xpToNext.current}/{gamStats.xpToNext.needed} vers niveau {gamStats.level + 1}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white rounded-xl border border-slate-200 p-4">
                                    <Flame className="w-4 h-4 text-orange-500 mb-2" />
                                    <p className="text-2xl font-bold text-slate-900">{gamStats.streak.current}</p>
                                    <p className="text-xs text-slate-500">Jours de série</p>
                                    <p className="text-[10px] text-slate-400">Record: {gamStats.streak.longest}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-200 p-4">
                                    <Trophy className="w-4 h-4 text-amber-500 mb-2" />
                                    <p className="text-2xl font-bold text-slate-900">#{gamStats.rank.position}</p>
                                    <p className="text-xs text-slate-500">Classement</p>
                                    <p className="text-[10px] text-slate-400">sur {gamStats.rank.total}</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Center: Preferences Form */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Préférences</h3>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-700">Nom</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-700">Téléphone</label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                placeholder="+33 6 12 34 56 78"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-700">Fuseau horaire</label>
                            <select
                                value={form.timezone}
                                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            >
                                {TIMEZONES.map((tz) => (
                                    <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-700">
                                Objectif quotidien: <span className="text-indigo-600 font-bold">{form.dailyGoal}</span> actions
                            </label>
                            <input
                                type="range"
                                min={40}
                                max={150}
                                step={5}
                                value={form.dailyGoal}
                                onChange={(e) => setForm({ ...form, dailyGoal: parseInt(e.target.value) })}
                                className="w-full accent-indigo-600"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400">
                                <span>40</span>
                                <span>150</span>
                            </div>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50 w-full justify-center"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? "Enregistrement..." : "Enregistrer"}
                        </button>
                    </div>
                </div>

                {/* Right: Achievements */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
                        Réalisations ({unlockedAchievements.length}/{achievements.length})
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        {achievements.map((a) => (
                            <div
                                key={a.code}
                                className={cn(
                                    "achievement-badge p-2 rounded-xl border",
                                    a.unlocked
                                        ? "border-amber-200 bg-amber-50 achievement-unlocked"
                                        : "border-slate-100 bg-slate-50 achievement-locked"
                                )}
                                title={`${a.name}: ${a.description}`}
                            >
                                <div className="text-2xl mb-1">{a.icon}</div>
                                <p className="text-[10px] font-medium text-slate-700 leading-tight truncate">{a.name}</p>
                                {!a.unlocked && (
                                    <div className="w-full h-1 bg-slate-200 rounded-full mt-1">
                                        <div
                                            className="h-full bg-indigo-400 rounded-full"
                                            style={{ width: `${a.progress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
