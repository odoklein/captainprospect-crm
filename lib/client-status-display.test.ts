import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLIENT_NEUTRAL_COLOR, clientResultColor } from "./client-status-display";

describe("client result colours", () => {
    it("forces Doublon to neutral grey even when the config makes it green", () => {
        assert.equal(clientResultColor("DOUBLON", "#50a55e"), CLIENT_NEUTRAL_COLOR);
        assert.equal(clientResultColor("doublon", "#50a55e"), CLIENT_NEUTRAL_COLOR);
    });

    it("leaves every other status on its configured colour", () => {
        assert.equal(clientResultColor("MEETING_BOOKED", "#90EE90"), "#90EE90");
        assert.equal(clientResultColor("REFUS", "#FFA07A"), "#FFA07A");
    });
});
