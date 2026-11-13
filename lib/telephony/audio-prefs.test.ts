import { test } from "node:test";
import assert from "node:assert/strict";
import { chimeWav, cleanLabel, deviceOptions, levelFromSamples, parseAudioPrefs, resolveDevice, type DeviceLike } from "./audio-prefs";

const DEVICES: DeviceLike[] = [
    { kind: "audioinput", deviceId: "default", label: "Par défaut - Jabra Evolve2 65 (0b0e:030c)" },
    { kind: "audioinput", deviceId: "communications", label: "Communications - Jabra Evolve2 65 (0b0e:030c)" },
    { kind: "audioinput", deviceId: "mic-jabra", label: "Jabra Evolve2 65 (0b0e:030c)" },
    { kind: "audioinput", deviceId: "mic-built-in", label: "Microphone MacBook Pro (Built-in)" },
    { kind: "audiooutput", deviceId: "default", label: "Par défaut - Haut-parleurs MacBook Pro (Built-in)" },
    { kind: "audiooutput", deviceId: "out-jabra", label: "Jabra Evolve2 65 (0b0e:030c)" },
    { kind: "audiooutput", deviceId: "out-built-in", label: "Haut-parleurs MacBook Pro (Built-in)" },
];

test("prefs parse defensively", () => {
    assert.deepEqual(parseAudioPrefs(null), { input: null, output: null, ringtone: null });
    assert.deepEqual(parseAudioPrefs("{oops"), { input: null, output: null, ringtone: null });
    assert.deepEqual(parseAudioPrefs(JSON.stringify({ input: { id: "mic-jabra", label: "Jabra" }, output: { id: 4 }, ringtone: "x" })), {
        input: { id: "mic-jabra", label: "Jabra" },
        output: null,
        ringtone: null,
    });
});

test("a saved device is found by id, then by name when the browser rotated its id", () => {
    assert.equal(resolveDevice({ id: "mic-jabra", label: "Jabra Evolve2 65" }, DEVICES, "audioinput"), "mic-jabra");
    assert.equal(resolveDevice({ id: "old-rotated-id", label: "Jabra Evolve2 65 (0b0e:030c)" }, DEVICES, "audioinput"), "mic-jabra");
    assert.equal(resolveDevice({ id: "old-rotated-id", label: "Jabra Evolve2 65 (0b0e:030c)" }, DEVICES, "audiooutput"), "out-jabra", "kind is respected");
});

test("an unplugged device falls back to the system default, never to another device", () => {
    assert.equal(resolveDevice({ id: "gone", label: "Casque Logitech H390" }, DEVICES, "audioinput"), null);
    assert.equal(resolveDevice(null, DEVICES, "audioinput"), null);
    assert.equal(resolveDevice({ id: "gone", label: "" }, DEVICES, "audioinput"), null);
});

test("options: system default first with the device behind it, no duplicate virtual entries", () => {
    assert.deepEqual(deviceOptions(DEVICES, "audioinput"), [
        { id: "", label: "Par défaut du système · Jabra Evolve2 65" },
        { id: "mic-jabra", label: "Jabra Evolve2 65" },
        { id: "mic-built-in", label: "Microphone MacBook Pro (Built-in)" },
    ]);
});

test("options before the microphone is allowed: labels are empty, devices are numbered", () => {
    const hidden: DeviceLike[] = [
        { kind: "audioinput", deviceId: "a", label: "" },
        { kind: "audioinput", deviceId: "b", label: "" },
    ];
    assert.deepEqual(deviceOptions(hidden, "audioinput").map((o) => o.label), ["Par défaut du système", "Micro 1", "Micro 2"]);
});

test("labels lose Chrome's prefixes and USB ids", () => {
    assert.equal(cleanLabel("Communications - Jabra Evolve2 65 (0b0e:030c)"), "Jabra Evolve2 65");
    assert.equal(cleanLabel("Default - USB Audio"), "USB Audio");
});

test("level: silence is zero, speech fills the meter, never above 1", () => {
    assert.equal(levelFromSamples(new Uint8Array(256).fill(128)), 0);
    const speech = Uint8Array.from({ length: 256 }, (_, i) => 128 + Math.round(40 * Math.sin(i / 3)));
    const l = levelFromSamples(speech);
    assert.ok(l > 0.5 && l <= 1, String(l));
    assert.equal(levelFromSamples(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0))), 1);
    assert.equal(levelFromSamples([]), 0);
});

test("test chime is a valid, audible, click-free mono WAV", () => {
    const wav = chimeWav(8000);
    const v = new DataView(wav.buffer);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
    assert.equal(v.getUint32(24, true), 8000);
    assert.equal(v.getUint32(40, true), wav.length - 44);
    const first = v.getInt16(44, true);
    const last = v.getInt16(wav.length - 2, true);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(v.getInt16(i, true)));
    assert.equal(first, 0, "starts at silence");
    assert.ok(Math.abs(last) < 1000, "fades out");
    assert.ok(peak > 5000 && peak < 32767 * 0.4, String(peak));
});
