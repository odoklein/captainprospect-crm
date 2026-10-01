import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canClientSideUserAccess, clientSideConversationWhere } from "./access";

const admin = { id: "admin", role: "CLIENT", clientId: "talis" };
const margot = { id: "margot", role: "COMMERCIAL", clientId: "talis" };
const paul = { id: "paul", role: "COMMERCIAL", clientId: "talis" };

const own = { clientId: "talis", createdById: "margot" };
const colleague = { clientId: "talis", createdById: "paul" };
const byAdmin = { clientId: "talis", createdById: "admin" };
const legacy = { clientId: "talis", createdById: null };
const otherCompany = { clientId: "era", createdById: "margot" };

describe("support conversation access", () => {
    it("lets a commercial read only the conversations they created", () => {
        assert.equal(canClientSideUserAccess(margot, own), true);
        assert.equal(canClientSideUserAccess(margot, colleague), false);
        assert.equal(canClientSideUserAccess(margot, byAdmin), false);
    });

    it("keeps creator-less (legacy, company-level) conversations away from commercials", () => {
        assert.equal(canClientSideUserAccess(margot, legacy), false);
        assert.equal(canClientSideUserAccess(paul, legacy), false);
    });

    it("lets the client admin read every conversation of their company, legacy included", () => {
        for (const conv of [own, colleague, byAdmin, legacy]) {
            assert.equal(canClientSideUserAccess(admin, conv), true);
        }
    });

    it("never crosses companies, whatever the role", () => {
        assert.equal(canClientSideUserAccess(admin, otherCompany), false);
        assert.equal(canClientSideUserAccess(margot, otherCompany), false);
    });

    it("denies users without a company and roles outside the client side", () => {
        assert.equal(canClientSideUserAccess({ ...margot, clientId: null }, own), false);
        assert.equal(canClientSideUserAccess({ id: "sdr", role: "SDR", clientId: "talis" }, own), false);
    });

    it("builds a list filter matching the access rule", () => {
        assert.deepEqual(clientSideConversationWhere({ ...margot, clientId: "talis" }), { clientId: "talis", createdById: "margot" });
        assert.deepEqual(clientSideConversationWhere({ ...admin, clientId: "talis" }), { clientId: "talis" });
    });
});
