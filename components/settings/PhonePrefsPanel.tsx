"use client";

// ============================================
// Paramètres → Téléphone (my account): my Twilio number, whether calls to it
// ring in my browser, and the greeting callers hear when I can't answer.
// The number itself is chosen by a manager (Paramètres → Téléphonie).
// ============================================

import { useEffect, useState } from "react";
import { MessageSquareText, PhoneCall, PhoneIncoming, Voicemail, Volume2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/accueil/AccueilUI";
import { Notice, SaveBar, SECONDARY_BUTTON, SettingRow, SettingsCard, Toggle } from "@/components/settings/SettingsUI";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";

type Prefs = {
    configured: boolean;
    number: string | null;
    receiveCalls: boolean;
    voicemailGreeting: string | null;
    smsSignature: string | null;
    defaultGreeting: string;
};

async function api(init?: RequestInit): Promise<Prefs> {
    const res = await fetch("/api/telephony/prefs", init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur de connexion");
    return json.data as Prefs;
}

export function PhonePrefsPanel() {
    const { success, error: showError } = useToast();
    const [prefs, setPrefs] = useState<Prefs | null>(null);
    const [greeting, setGreeting] = useState("");
    const [signature, setSignature] = useState("");
    const [savingGreeting, setSavingGreeting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        api()
            .then((p) => {
                setPrefs(p);
                setGreeting(p.voicemailGreeting ?? "");
                setSignature(p.smsSignature ?? "");
            })
            .catch((e) => setLoadError(e instanceof Error ? e.message : "Erreur"));
    }, []);

    if (loadError) return <Notice tone="rose">{loadError}</Notice>;
    if (!prefs) return <Shimmer className="h-64 rounded-3xl" />;

    const save = async (patch: Partial<Pick<Prefs, "receiveCalls" | "voicemailGreeting" | "smsSignature">>) => {
        const next = await api({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        setPrefs(next);
        return next;
    };

    const toggleReceive = async (v: boolean) => {
        setPrefs({ ...prefs, receiveCalls: v }); // instant feedback
        try {
            await save({ receiveCalls: v });
            success(v ? "Appels entrants activés" : "Appels entrants en pause", v ? "Les appels vers votre numéro sonnent dans le CRM." : "Vos appelants tombent directement sur votre messagerie.");
        } catch (e) {
            setPrefs({ ...prefs, receiveCalls: !v });
            showError("Enregistrement impossible", e instanceof Error ? e.message : "Erreur");
        }
    };

    const dirty =
        greeting.trim() !== (prefs.voicemailGreeting ?? "").trim() || signature.trim() !== (prefs.smsSignature ?? "").trim();
    const spoken = greeting.trim() || prefs.defaultGreeting;

    const preview = () => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(spoken);
        u.lang = "fr-FR";
        window.speechSynthesis.speak(u);
    };

    if (!prefs.configured || !prefs.number) {
        return (
            <Notice tone="slate" icon={PhoneCall}>
                <p className="font-bold text-zinc-900">Pas encore de numéro Twilio.</p>
                <p>
                    Vos appels passent par Allo. Dès qu&apos;un manager vous attribue un numéro (Paramètres → Téléphonie), vous appellerez depuis le CRM
                    et vos prospects pourront vous rappeler ici.
                </p>
            </Notice>
        );
    }

    return (
        <div className="space-y-6">
            <SettingsCard icon={PhoneCall} tone="emerald" title="Mon numéro" subtitle="Le numéro que vos prospects voient, et sur lequel ils vous rappellent.">
                <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                    <span className="font-mono text-[22px] font-semibold tracking-tight tabular-nums text-zinc-900">{formatPhone(prefs.number)}</span>
                    <span className="text-xs font-medium text-zinc-500">Attribué par votre manager · appels via Twilio</span>
                </div>
                <div className="mt-3">
                    <SettingRow
                        icon={PhoneIncoming}
                        tone="emerald"
                        title="Recevoir les appels dans le CRM"
                        description={
                            prefs.receiveCalls
                                ? "Un prospect qui rappelle fait sonner votre navigateur 20 secondes, puis tombe sur votre messagerie."
                                : "En pause : vos appelants tombent directement sur votre messagerie (ex. pendant une réunion)."
                        }
                        control={<Toggle checked={prefs.receiveCalls} onChange={(v) => void toggleReceive(v)} label="Recevoir les appels dans le CRM" />}
                        active={prefs.receiveCalls}
                    />
                </div>
            </SettingsCard>

            <SettingsCard
                icon={Voicemail}
                tone="violet"
                title="Ma messagerie"
                subtitle="Ce que vos appelants entendent quand vous ne décrochez pas. Le message laissé est transcrit et vous est notifié."
                right={
                    <button type="button" onClick={preview} className={cn(SECONDARY_BUTTON, "gap-1.5")}>
                        <Volume2 className="h-3.5 w-3.5" /> Écouter
                    </button>
                }
            >
                <textarea
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    maxLength={600}
                    rows={4}
                    placeholder={prefs.defaultGreeting}
                    aria-label="Message d'accueil de la messagerie"
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
                />
                <p className="mt-1.5 flex justify-between text-[11px] font-medium text-zinc-400">
                    <span>{greeting.trim() ? "Votre message personnalisé" : "Vide : le message par défaut ci-dessus est utilisé"}</span>
                    <span className="tabular-nums">{greeting.length}/600</span>
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">« Écouter » utilise la voix de votre navigateur ; au téléphone, la voix de Twilio est légèrement différente.</p>
            </SettingsCard>

            <SettingsCard icon={MessageSquareText} tone="indigo" title="Mes SMS" subtitle="Ajoutée sur sa propre ligne à la fin de chaque SMS que vous envoyez.">
                <input
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    maxLength={80}
                    placeholder="Ex. Julie · Captain Soft"
                    aria-label="Signature des SMS"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-zinc-900 placeholder:font-medium placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
                />
                <div className="mt-3 max-w-sm rounded-[18px] rounded-br-md bg-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-fg shadow-sm">
                    Bonjour, suite à notre échange je vous envoie le lien pour réserver un créneau.
                    {signature.trim() && <span className="mt-1 block opacity-80">{signature.trim()}</span>}
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-400">Aperçu d&apos;un SMS envoyé.</p>
            </SettingsCard>

            <SaveBar
                dirty={dirty}
                saving={savingGreeting}
                onReset={() => {
                    setGreeting(prefs.voicemailGreeting ?? "");
                    setSignature(prefs.smsSignature ?? "");
                }}
                onSave={async () => {
                    setSavingGreeting(true);
                    try {
                        await save({ voicemailGreeting: greeting.trim() || null, smsSignature: signature.trim() || null });
                        success("Préférences enregistrées", "Messagerie et signature SMS à jour.");
                    } catch (e) {
                        showError("Enregistrement impossible", e instanceof Error ? e.message : "Erreur");
                    } finally {
                        setSavingGreeting(false);
                    }
                }}
            />
        </div>
    );
}
