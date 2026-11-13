import { test } from "node:test";
import assert from "node:assert/strict";
import { dayDelta, displayPhone, nextStep, relativeDay, rowInitials } from "./display";

test("displayPhone: every French spelling reads the same", () => {
    for (const raw of ["+33612345678", "0033 6 12 34 56 78", "+33 (0)6 12 34 56 78", "06.12.34.56.78", "33612345678", "+330612345678"]) {
        assert.deepEqual(displayPhone(raw), { text: "06 12 34 56 78", mobile: true }, raw);
    }
    assert.deepEqual(displayPhone("+330232741000"), { text: "02 32 74 10 00", mobile: false });
    assert.deepEqual(displayPhone("07 11 22 33 44"), { text: "07 11 22 33 44", mobile: true });
});

test("displayPhone: foreign, short or empty numbers", () => {
    assert.equal(displayPhone(""), null);
    assert.equal(displayPhone(null), null);
    assert.deepEqual(displayPhone("+32 2 123 45 67"), { text: "+32 2 123 45 67", mobile: false });
    assert.deepEqual(displayPhone("3615"), { text: "3615", mobile: false });
    assert.deepEqual(displayPhone("0012"), { text: "0012", mobile: false });
});

const NOW = new Date(2026, 10, 12, 10, 0); // Thu 12 Nov 2026, 10:00

test("relativeDay", () => {
    assert.equal(relativeDay(new Date(2026, 10, 12, 8).toISOString(), NOW), "aujourd'hui");
    assert.equal(relativeDay(new Date(2026, 10, 11, 23).toISOString(), NOW), "hier");
    assert.equal(relativeDay(new Date(2026, 10, 8).toISOString(), NOW), "il y a 4 j");
    assert.equal(relativeDay(new Date(2026, 9, 2).toISOString(), NOW), "2 oct.");
    assert.equal(relativeDay("not a date", NOW), null);
    assert.equal(dayDelta(new Date(2026, 10, 13, 1), NOW), 1);
});

test("nextStep: tone and label", () => {
    assert.deepEqual(
        [nextStep(new Date(2026, 10, 12, 9).toISOString(), NOW)?.label, nextStep(new Date(2026, 10, 12, 9).toISOString(), NOW)?.tone],
        ["En retard · 09:00", "overdue"],
    );
    assert.equal(nextStep(new Date(2026, 10, 10, 9).toISOString(), NOW)?.label, "En retard · 2 j");
    assert.equal(nextStep(new Date(2026, 10, 12, 14, 30).toISOString(), NOW)?.label, "Aujourd'hui 14:30");
    assert.equal(nextStep(new Date(2026, 10, 12, 14, 30).toISOString(), NOW)?.tone, "today");
    assert.equal(nextStep(new Date(2026, 10, 13, 9).toISOString(), NOW)?.label, "Demain 09:00");
    assert.equal(nextStep(new Date(2026, 10, 16, 9).toISOString(), NOW)?.label, "Lun. 09:00");
    assert.equal(nextStep(new Date(2026, 10, 16, 9).toISOString(), NOW)?.tone, "later");
    assert.equal(nextStep(new Date(2026, 10, 30, 9).toISOString(), NOW)?.label, "30 nov.");
    assert.equal(nextStep(null, NOW), null);
});

test("rowInitials", () => {
    assert.equal(rowInitials("Julie", "Martin"), "JM");
    assert.equal(rowInitials(null, null, "Captain Soft"), "CS");
    assert.equal(rowInitials("", "", "Acme"), "AC");
    assert.equal(rowInitials(null, null, null), "?");
});
