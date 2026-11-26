"use client";

// ============================================
// Paramètres → Ma ligne (my account): my Twilio number and whether calls to it
// ring here, the greeting callers hear when I can't answer, my SMS signature,
// and the desktop alerts. The number itself is chosen by a manager
// (Paramètres → Téléphonie).
//
// The day-to-day part of the line — pause it, take calls again, switch to a
// headset — lives on the sidebar avatar (components/telephony/LineRing): this
// page is where it is explained and where the set-once parts are written.
// ============================================

import { useEffect, useState } from "react";
import { FileText, Headphones, MessageSquareText, PhoneIncoming, Voicemail, Volume2 } from "lucide-react";
import { useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { cleanLabel } from "@/lib/telephony/audio-prefs";
import { describeLine } from "@/lib/telephony/line-state";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/accueil/AccueilUI";
import {
    INPUT, Notice, SaveBar, SECONDARY_BUTTON, SettingRow, SettingsCard, SettingsLinkRow, SettingsList, Toggle,
} from "@/components/settings/SettingsUI";
import { DesktopNotificationsCard } from "@/components/settings/AccountPanels";
import { CALL_APP_GUIDE_URL } from "@/lib/guides";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { useBrand } from "@/lib/brand/client";

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
    const brand = useBrand();
    const { success, error: showError } = useToast();
    const softphone = useSoftphone();
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

    const save = async (patch: Partial<Pick<Prefs, "voicemailGreeting" | "smsSignature">>) => {
        const next = await api({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        setPrefs(next);
        return next;
    };

    // The same switch as the avatar's ring: the softphone owns the line state.
    const toggleReceive = async (v: boolean) => {
        try {
            await softphone.setReceiveCalls(v);
            success(v ? "Les appels sonnent ici" : "Messagerie activée", v ? "Les appels vers votre numéro sonnent dans le CRM." : "Vos appelants tombent directement sur votre messagerie.");
        } catch (e) {
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
            <div className="space-y-6">
                <Notice tone="slate" icon={PhoneIncoming}>
                    <p className="font-medium text-ink">Vos appels passent par Allo.</p>
                    <p>
                        Dès qu&apos;un manager vous attribue un numéro (Paramètres → Téléphonie), vous appellerez depuis le CRM et vos prospects
                        pourront vous rappeler ici.
                    </p>
                </Notice>
                <DesktopNotificationsCard />
                <CallAppGuideRow />
            </div>
        );
    }

    const receiving = softphone.lineSettings.receiveCalls;
    const audioName = (p: { label: string } | null) => (p?.label ? cleanLabel(p.label) : "Par défaut du système");

    return (
        <div className="space-y-6">
            <SettingsCard
                icon={PhoneIncoming}
                title="Mon numéro"
                subtitle="Le numéro que vos prospects voient, et sur lequel ils vous rappellent. Attribué par votre manager."
            >
                <p className="font-mono text-xl font-semibold tracking-tight tabular-nums text-ink">{formatPhone(prefs.number)}</p>
                <SettingsList className="mt-4 -mx-6 px-6 border-t border-line-subtle pt-4">
                    <SettingRow
                        title="Recevoir les appels dans le CRM"
                        description={
                            receiving ? (
                                <>
                                    {describeLine(softphone.line)}. Pour une pause, maintenez votre photo en bas de la barre latérale : chaque quart de tour
                                    ajoute 15 min, et la ligne reprend seule.
                                </>
                            ) : (
                                "Vos appelants tombent directement sur votre messagerie, jusqu'à ce que vous rouvriez la ligne."
                            )
                        }
                        control={<Toggle checked={receiving} onChange={(v) => void toggleReceive(v)} label="Recevoir les appels dans le CRM" />}
                    />
                    {softphone.enabled && (
                        <SettingRow
                            icon={Headphones}
                            title="Micro et écoute"
                            description={
                                <>
                                    {audioName(softphone.audioPrefs.input)} · {audioName(softphone.audioPrefs.output)}. Un casque branché est choisi tout seul.
                                </>
                            }
                            control={
                                <button type="button" onClick={softphone.openAudioSettings} className={SECONDARY_BUTTON}>
                                    Tester
                                </button>
                            }
                        />
                    )}
                </SettingsList>
            </SettingsCard>

            <SettingsCard
                icon={Voicemail}
                title="Ma messagerie"
                subtitle="Ce que vos appelants entendent quand vous ne décrochez pas. Le message qu'ils laissent est transcrit et vous est notifié."
                right={
                    <button type="button" onClick={preview} className={SECONDARY_BUTTON}>
                        <Volume2 className="h-4 w-4" aria-hidden /> Écouter
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
                    className={cn(INPUT, "h-auto resize-none py-3 leading-relaxed")}
                />
                <p className="mt-2 flex justify-between gap-4 text-xs text-ink-3">
                    <span>
                        {greeting.trim() ? "Votre message." : "Vide : le message par défaut, ci-dessus, est lu."} « Écouter » utilise la voix du navigateur, un peu
                        différente de celle du téléphone.
                    </span>
                    <span className="tabular-nums">{greeting.length}/600</span>
                </p>
            </SettingsCard>

            <SettingsCard icon={MessageSquareText} title="Signature de mes SMS" subtitle="Ajoutée sur sa propre ligne à la fin de chaque SMS que vous envoyez.">
                <input
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    maxLength={80}
                    placeholder={`Ex. Julie · ${brand.name}`}
                    aria-label="Signature des SMS"
                    className={INPUT}
                />
                <div className="mt-4 max-w-sm rounded-[18px] rounded-br-md bg-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-fg shadow-sm" aria-label="Aperçu d'un SMS envoyé">
                    Bonjour, suite à notre échange je vous envoie le lien pour réserver un créneau.
                    {signature.trim() && <span className="mt-1 block opacity-80">{signature.trim()}</span>}
                </div>
            </SettingsCard>

            <DesktopNotificationsCard />
            <CallAppGuideRow />

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

/** Phone numbers in the CRM are tel: links, opened by the computer's default calling
 *  app: the PDF guide to choose that app on Windows or Mac. */
function CallAppGuideRow() {
    return (
        <SettingsLinkRow
            href={CALL_APP_GUIDE_URL}
            external
            icon={FileText}
            title="Choisir votre application d'appel"
            description="« Appeler » ouvre la mauvaise application, ou rien du tout ? Le guide pour Windows et Mac, en 2 minutes."
            badge="PDF"
        />
    );
}
