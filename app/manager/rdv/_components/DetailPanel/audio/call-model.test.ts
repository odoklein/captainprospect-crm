import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatClock, originOfRecording, parseSummary, parseTranscript } from "./call-model";

describe("originOfRecording", () => {
  it("recognises every source of a stored recording URL", () => {
    assert.equal(originOfRecording("https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1.mp3"), "twilio");
    assert.equal(originOfRecording("https://api.withallo.com/v1/assets/recordings/abc"), "allo");
    assert.equal(originOfRecording("https://vault.internal:8443/api/calls/clx123/recording"), "vault");
    assert.equal(originOfRecording("https://s3.example.com/bucket/call-recordings/u1/1700000000/uuid.mp3"), "upload");
    assert.equal(originOfRecording(null), null);
    assert.equal(originOfRecording("https://example.com/other.mp3"), null);
  });
});

describe("parseTranscript", () => {
  it("reads the Twilio format as SDR / prospect turns and merges consecutive lines", () => {
    const turns = parseTranscript("SDR : Bonjour Madame\nSDR : je vous appelle de la part de X\nProspect : Oui, bonjour");
    assert.deepEqual(turns, [
      { speaker: "sdr", label: "SDR", text: "Bonjour Madame je vous appelle de la part de X" },
      { speaker: "prospect", label: "Prospect", text: "Oui, bonjour" },
    ]);
  });

  it("reads the Allo format (AGENT / EXTERNAL)", () => {
    const turns = parseTranscript("AGENT: Allô ?\nEXTERNAL: Oui c'est moi");
    assert.equal(turns?.[0]?.speaker, "sdr");
    assert.equal(turns?.[1]?.speaker, "prospect");
    assert.equal(turns?.[1]?.label, "Prospect");
  });

  it("returns null for a plain transcript without speakers", () => {
    assert.equal(parseTranscript("Bonjour, je vous appelle au sujet de votre projet. Très bien merci."), null);
  });
});

describe("parseSummary", () => {
  it("splits the AI summary into paragraphs and titled bullet lists", () => {
    const blocks = parseSummary("Le prospect est intéressé.\n\nPoints clés :\n• Budget validé\n• Décision en janvier");
    assert.deepEqual(blocks, [
      { kind: "p", text: "Le prospect est intéressé." },
      { kind: "list", title: "Points clés", items: ["Budget validé", "Décision en janvier"] },
    ]);
  });
});

describe("formatClock", () => {
  it("formats seconds as m:ss / h:mm:ss", () => {
    assert.equal(formatClock(65), "1:05");
    assert.equal(formatClock(3725), "1:02:05");
    assert.equal(formatClock(Number.NaN), "0:00");
  });
});
