// TwiML of the parallel dialer. Built with Twilio's own builder: no string templates.
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";

export const RECORDING_NOTICE = "Bonjour. Cet appel est susceptible d'être enregistré et transcrit.";

/** The SDR's browser leg: waits in silence in the session's conference; the conference ends when they leave. */
export function agentConferenceTwiml(conferenceName: string, statusCallback: string): string {
    const vr = new VoiceResponse();
    const dial = vr.dial();
    dial.conference(
        {
            startConferenceOnEnter: true,
            endConferenceOnExit: true,
            beep: "false",
            waitUrl: "",
            statusCallback,
            statusCallbackEvent: ["join", "leave"],
            statusCallbackMethod: "POST",
        },
        conferenceName,
    );
    return vr.toString();
}

/** Answered prospect while detection runs: silence, then hang up by itself if nobody decides in time. */
export function holdTwiml(maxSeconds: number): string {
    const vr = new VoiceResponse();
    vr.pause({ length: Math.max(1, Math.min(30, Math.round(maxSeconds))) });
    vr.hangup();
    return vr.toString();
}

/** Bridges the prospect into the SDR's conference, after the recording notice when recording/transcribing. */
export function bridgeTwiml(conferenceName: string, notice: boolean): string {
    const vr = new VoiceResponse();
    if (notice) vr.say({ language: "fr-FR" }, RECORDING_NOTICE);
    vr.dial().conference({ startConferenceOnEnter: true, endConferenceOnExit: false, beep: "false" }, conferenceName);
    return vr.toString();
}

/**
 * A person answered and no SDR could take the call. They are told who called and
 * that they will be called back, then the line closes: never silence then hang-up.
 */
export function abandonTwiml(brand: string): string {
    const vr = new VoiceResponse();
    vr.say({ language: "fr-FR" }, `Bonjour, ${brand} a cherché à vous joindre. Un conseiller vous rappellera. Excusez-nous pour la gêne. Au revoir.`);
    vr.hangup();
    return vr.toString();
}
