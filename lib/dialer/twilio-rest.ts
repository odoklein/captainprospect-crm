// ============================================
// DIALER — the four Twilio REST operations the parallel dialer needs, over fetch
// (the codebase never loads the Twilio REST client; see lib/telephony/twilio.ts).
//
//   createCall     POST /Calls.json                   one prospect leg, with async AMD
//   redirectCall   POST /Calls/{sid}.json  Twiml=…    bridge into the conference, or play + hang up
//   endCall        POST /Calls/{sid}.json  Status=…   canceled (not answered yet) / completed (answered)
//   startRecording POST /Calls/{sid}/Recordings.json  dual-channel recording of the bridged leg
//
// PROVIDER-DEPENDENT — validated against Twilio's public API reference, not yet
// against a live account: parameter names, AMD verdict latency (typically a few
// seconds, longer with DetectMessageEnd), outbound CPS limits of the account
// (1 call/s by default on new accounts), and per-country caller-id rules. Run
// the checklist in docs/SALES_EXECUTION_ENGINE.md before enabling parallel mode.
// ============================================

import type { TwilioConfig } from "@/lib/telephony/config";

export interface CreateCallInput {
    to: string;
    from: string;
    /** TwiML fetched when the prospect answers. */
    answerUrl: string;
    statusCallback: string;
    amdCallback: string | null;
    ringTimeoutSec: number;
    amdTimeoutSec: number;
}

export interface TwilioCalls {
    createCall(input: CreateCallInput): Promise<{ sid: string }>;
    redirectCall(sid: string, twiml: string): Promise<void>;
    endCall(sid: string, answered: boolean): Promise<void>;
    startRecording(sid: string, statusCallback: string): Promise<void>;
}

export class TwilioRestError extends Error {
    constructor(message: string, public status: number, public code: number | null) {
        super(message);
    }
}

const API = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 8_000;

export function twilioCalls(config: TwilioConfig, fetchImpl: typeof fetch = fetch): TwilioCalls {
    // API key credentials work for REST as well as for access tokens.
    const auth = `Basic ${Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString("base64")}`;
    const base = `${API}/Accounts/${config.accountSid}`;

    async function post(path: string, form: [string, string][]): Promise<Record<string, unknown>> {
        const body = new URLSearchParams();
        for (const [k, v] of form) body.append(k, v);
        const res = await fetchImpl(`${base}${path}`, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
            throw new TwilioRestError(String(json.message ?? `Twilio HTTP ${res.status}`), res.status, typeof json.code === "number" ? json.code : null);
        }
        return json;
    }

    return {
        async createCall(i) {
            const form: [string, string][] = [
                ["To", i.to],
                ["From", i.from],
                ["Url", i.answerUrl],
                ["Method", "POST"],
                ["StatusCallback", i.statusCallback],
                ["StatusCallbackMethod", "POST"],
                ["Timeout", String(i.ringTimeoutSec)],
            ];
            for (const ev of ["initiated", "ringing", "answered", "completed"]) form.push(["StatusCallbackEvent", ev]);
            if (i.amdCallback) {
                form.push(
                    ["MachineDetection", "Enable"],
                    ["AsyncAmd", "true"],
                    ["AsyncAmdStatusCallback", i.amdCallback],
                    ["AsyncAmdStatusCallbackMethod", "POST"],
                    ["MachineDetectionTimeout", String(i.amdTimeoutSec)],
                );
            }
            const json = await post("/Calls.json", form);
            const sid = typeof json.sid === "string" ? json.sid : "";
            if (!/^CA[0-9a-f]{32}$/i.test(sid)) throw new TwilioRestError("Réponse Twilio sans identifiant d'appel", 502, null);
            return { sid };
        },
        async redirectCall(sid, twiml) {
            await post(`/Calls/${encodeURIComponent(sid)}.json`, [["Twiml", twiml]]);
        },
        async endCall(sid, answered) {
            try {
                await post(`/Calls/${encodeURIComponent(sid)}.json`, [["Status", answered ? "completed" : "canceled"]]);
            } catch (err) {
                // 21220: the call is not in a state to be modified — it has already ended. That is the goal.
                if (err instanceof TwilioRestError && (err.code === 21220 || err.status === 404)) return;
                throw err;
            }
        },
        async startRecording(sid, statusCallback) {
            await post(`/Calls/${encodeURIComponent(sid)}/Recordings.json`, [
                ["RecordingChannels", "dual"],
                ["RecordingStatusCallback", statusCallback],
                ["RecordingStatusCallbackMethod", "POST"],
                ["RecordingStatusCallbackEvent", "completed"],
            ]);
        },
    };
}
