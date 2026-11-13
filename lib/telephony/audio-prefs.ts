// ============================================
// SOFTPHONE AUDIO — which microphone, which speakers, which ringtone. Pure:
// no DOM access here, safe to unit-test. Stored per browser (localStorage),
// since devices belong to the computer, not to the account.
//
// A saved device is found again by id, then by label: browsers may rotate
// device ids (site data cleared, permission reset) while the headset is the
// same. A device that is not plugged in falls back to the system default —
// never to an arbitrary other device.
// ============================================

export const AUDIO_PREFS_KEY = "cp_softphone_audio";

export interface DevicePick {
    id: string;
    label: string;
}

export interface AudioPrefs {
    input: DevicePick | null;
    output: DevicePick | null;
    ringtone: DevicePick | null;
}

export const EMPTY_AUDIO_PREFS: AudioPrefs = { input: null, output: null, ringtone: null };

export interface DeviceLike {
    deviceId: string;
    label: string;
    kind: string;
}

function pick(v: unknown): DevicePick | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || o.id.length > 300) return null;
    return { id: o.id, label: typeof o.label === "string" ? o.label.slice(0, 200) : "" };
}

export function parseAudioPrefs(raw: string | null | undefined): AudioPrefs {
    if (!raw) return { ...EMPTY_AUDIO_PREFS };
    try {
        const o = JSON.parse(raw) as Record<string, unknown>;
        return { input: pick(o.input), output: pick(o.output), ringtone: pick(o.ringtone) };
    } catch {
        return { ...EMPTY_AUDIO_PREFS };
    }
}

/** Chrome prefixes its virtual entries: « Par défaut - Casque Jabra », « Communications - … ». */
const VIRTUAL = /^(default|communications|par défaut|communication)\s*[-–]\s*/i;

export function cleanLabel(label: string): string {
    return label.replace(VIRTUAL, "").replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "").trim();
}

/**
 * The deviceId to use for a saved pick among the devices present now, or null for
 * the system default (nothing saved, or the saved device is not plugged in).
 */
export function resolveDevice(saved: DevicePick | null, devices: DeviceLike[], kind: "audioinput" | "audiooutput"): string | null {
    if (!saved) return null;
    const ofKind = devices.filter((d) => d.kind === kind);
    if (ofKind.some((d) => d.deviceId === saved.id)) return saved.id;
    const wanted = cleanLabel(saved.label).toLowerCase();
    if (!wanted) return null;
    const byLabel = ofKind.find((d) => d.deviceId !== "default" && d.deviceId !== "communications" && cleanLabel(d.label).toLowerCase() === wanted);
    return byLabel?.deviceId ?? null;
}

export interface DeviceOption {
    id: string;
    label: string;
}

/**
 * The list shown in a select: the system default first (« Par défaut du système · Casque Jabra »),
 * then real devices once, without Chrome's duplicate virtual entries. Labels are empty until
 * the microphone is allowed: devices are then numbered.
 */
export function deviceOptions(devices: DeviceLike[], kind: "audioinput" | "audiooutput"): DeviceOption[] {
    const ofKind = devices.filter((d) => d.kind === kind);
    const noun = kind === "audioinput" ? "Micro" : "Sortie";
    const def = ofKind.find((d) => d.deviceId === "default");
    const out: DeviceOption[] = [{ id: "", label: def?.label ? `Par défaut du système · ${cleanLabel(def.label)}` : "Par défaut du système" }];
    let n = 0;
    for (const d of ofKind) {
        if (d.deviceId === "default" || d.deviceId === "communications" || !d.deviceId) continue;
        n++;
        out.push({ id: d.deviceId, label: cleanLabel(d.label) || `${noun} ${n}` });
    }
    return out;
}

/** Microphone level 0..1 from an analyser's time-domain bytes (128 = silence), scaled so speech fills the meter. */
export function levelFromSamples(samples: ArrayLike<number>): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
    }
    const rms = Math.sqrt(sum / samples.length);
    return Math.max(0, Math.min(1, rms * 4));
}

/** Below this level for the whole check, the mic is considered silent (muted, wrong device, unplugged). */
export const SILENCE_LEVEL = 0.02;

/**
 * A short two-note chime as a 16-bit mono WAV, for « Tester le son »: played
 * through an <audio> element so it can be routed to the chosen output (setSinkId).
 */
export function chimeWav(sampleRate = 24_000): Uint8Array {
    const notes = [
        { freq: 660, dur: 0.22 },
        { freq: 880, dur: 0.34 },
    ];
    const total = Math.round(notes.reduce((s, n) => s + n.dur, 0) * sampleRate);
    const pcm = new Int16Array(total);
    let offset = 0;
    for (const n of notes) {
        const len = Math.round(n.dur * sampleRate);
        for (let i = 0; i < len; i++) {
            const t = i / sampleRate;
            // Quick attack, smooth decay: no click at either end.
            const env = Math.min(1, i / (0.01 * sampleRate)) * Math.exp(-4 * t / n.dur);
            pcm[offset + i] = Math.round(0.35 * env * Math.sin(2 * Math.PI * n.freq * t) * 32767);
        }
        offset += len;
    }
    const bytes = new Uint8Array(44 + pcm.length * 2);
    const v = new DataView(bytes.buffer);
    const str = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
    str(0, "RIFF");
    v.setUint32(4, 36 + pcm.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); // PCM
    v.setUint16(22, 1, true); // mono
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, "data");
    v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
    return bytes;
}
