import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import apiUtils from "@/lib/api-utils";
import agencyInvite from "./agency-invite.ts";
import clientMissions from "./client-missions.ts";
import schemas from "./self-service-schema.ts";
const { AuthError } = apiUtils;
const { AGENCY_INVITE_KEY, ensureAgencyInvite: ensureInvite, registerInvitedClient: registerClient, sameOriginRequest, validInviteToken } = agencyInvite;
const { clientMissionView, requireClientSpace: clientSpace, saveClientMission: saveMission } = clientMissions;
const { missionBriefData, missionBriefSchema, registrationSchema } = schemas;

const TOKEN = "a".repeat(64);
// Plain delegates let node:test mock each call without Prisma's dynamic Proxy.
// Any unexpected DB call fails, and no configured database can be touched.
const unused = async () => { throw new Error("Unexpected DB call"); };
const prisma = {
    systemConfig: { upsert: unused, findUnique: unused },
    user: { findUnique: unused, findFirst: unused },
    client: { create: unused },
    mission: { create: unused, findFirst: unused, updateMany: unused, findUniqueOrThrow: unused },
    $transaction: unused,
};
const ensureAgencyInvite = () => ensureInvite(prisma);
const registerInvitedClient = (token, input) => registerClient(token, input, prisma);
const requireClientSpace = (userId) => clientSpace(userId, prisma);
const saveClientMission = (userId, input, id) => saveMission(userId, input, id, prisma);
const registration = { companyName: "Acme", name: "Alice", email: " Alice@Acme.fr ", password: "a long password" };
const brief = { name: "Prospection", objective: "Rencontrer des DRH", channels: ["CALL", "EMAIL"], startDate: "2026-12-01", endDate: "2026-12-31", targetMeetings: 10, targetAudience: "DRH de PME", geography: "France", offer: "Formation RH", differentiators: "10 ans d’expérience", exclusions: "Clients existants" };
const clientUser = { role: "CLIENT", isActive: true, client: { id: "own-client", name: "Acme", status: "ACTIVE", archivedAt: null } };

test("invitation rejects missing, revoked, malformed and wrong tokens", () => {
    assert.equal(validInviteToken(TOKEN, TOKEN), true);
    for (const stored of [null, "", "b".repeat(64), "é".repeat(64)]) assert.equal(validInviteToken(TOKEN, stored), false);
    for (const candidate of ["", "a", "x".repeat(64), "é".repeat(64)]) assert.equal(validInviteToken(candidate, TOKEN), false);
});

test("signup origin check accepts the public host behind the proxy and rejects other sites", () => {
    // Production: Next sees the container address (0.0.0.0:5000), the browser the public domain.
    const proxied = (origin) => new Headers({ origin, host: "0.0.0.0:5000", "x-forwarded-host": "crm.agence.fr", "x-forwarded-proto": "https" });
    assert.equal(sameOriginRequest(proxied("https://crm.agence.fr")), true);
    assert.equal(sameOriginRequest(new Headers({ origin: "https://CRM.agence.fr", host: "crm.agence.fr" })), true);
    assert.equal(sameOriginRequest(new Headers({ origin: "https://crm.agence.fr", host: "10.0.0.4:5000" }), "https://crm.agence.fr/"), true);
    assert.equal(sameOriginRequest(new Headers({ origin: "http://localhost:3000", host: "localhost:3000" })), true);
    assert.equal(sameOriginRequest(new Headers({ host: "crm.agence.fr" })), true);
    assert.equal(sameOriginRequest(proxied("https://evil.example")), false);
    assert.equal(sameOriginRequest(proxied("https://crm.agence.fr.evil.example")), false);
    assert.equal(sameOriginRequest(proxied("null")), false);
});

test("registration normalizes email, bounds bcrypt input and strips privileged fields", () => {
    const parsed = registrationSchema.parse({ ...registration, role: "MANAGER", clientId: "victim", isActive: false });
    assert.equal(parsed.email, "alice@acme.fr");
    assert.equal("role" in parsed, false);
    assert.equal("clientId" in parsed, false);
    assert.equal(registrationSchema.safeParse({ ...registration, password: "short" }).success, false);
    assert.equal(registrationSchema.safeParse({ ...registration, password: "é".repeat(40) }).success, false);
});

test("mission validation rejects invalid calendar dates and reversed periods", () => {
    for (const dates of [{ startDate: "2026-02-30" }, { endDate: "2026-11-30" }, { endDate: "invalid" }]) {
        assert.equal(missionBriefSchema.safeParse({ ...brief, ...dates }).success, false);
    }
    assert.equal(missionBriefSchema.safeParse({ ...brief, channels: [] }).success, false);
    assert.equal(missionBriefSchema.safeParse({ ...brief, targetMeetings: -1 }).success, false);
    const input = missionBriefSchema.parse({ ...brief, status: "ACTIVE", isActive: true, clientId: "victim", channels: ["CALL", "CALL"] });
    assert.deepEqual(input.channels, ["CALL"]);
    const data = missionBriefData(input);
    assert.equal("clientId" in data, false);
    assert.equal("status" in data, false);
    assert.equal(data.startDate.toISOString(), "2026-12-01T00:00:00.000Z");
});

test("creating an invite reuses the existing row atomically", async (t) => {
    t.mock.method(prisma.systemConfig, "upsert", async (args) => {
        assert.deepEqual(args.where, { key: AGENCY_INVITE_KEY });
        assert.deepEqual(args.update, {});
        assert.match(args.create.value, /^[a-f0-9]{64}$/);
        return { key: AGENCY_INVITE_KEY, value: TOKEN, updatedAt: new Date() };
    });
    assert.equal(await ensureAgencyInvite(), TOKEN);
});

test("signup creates one isolated space with a hashed CLIENT user in a nested transaction", async (t) => {
    t.mock.method(prisma.systemConfig, "findUnique", async () => ({ value: TOKEN }));
    t.mock.method(prisma.user, "findFirst", async () => null);
    t.mock.method(prisma, "$transaction", async (fn) => fn(prisma));
    const create = t.mock.method(prisma.client, "create", async (args) => {
        const user = args.data.users.create;
        assert.equal(user.role, "CLIENT"); assert.equal(user.isActive, true);
        assert.equal(user.email, "alice@acme.fr");
        assert.ok(await bcrypt.compare(registration.password, user.password));
        assert.equal("connect" in args.data.users, false);
        return { id: "new-space" };
    });
    assert.deepEqual(await registerInvitedClient(TOKEN, { ...registration, clientId: "victim", role: "MANAGER" }), { clientId: "new-space" });
    assert.equal(create.mock.callCount(), 1);
});

test("revoked link and duplicate email cannot create a space", async (t) => {
    const lookup = t.mock.method(prisma.systemConfig, "findUnique", async () => ({ value: TOKEN }));
    t.mock.method(prisma, "$transaction", async (fn) => fn(prisma));
    t.mock.method(prisma.user, "findFirst", async () => ({ id: "existing-user" }));
    const create = t.mock.method(prisma.client, "create", async () => { throw new Error("must not create"); });
    await assert.rejects(registerInvitedClient("b".repeat(64), registration), (error) => error instanceof AuthError && error.status === 404);
    await assert.rejects(registerInvitedClient(TOKEN, registration), (error) => error instanceof AuthError && error.status === 409 && /existe déjà/.test(error.message));
    lookup.mock.mockImplementationOnce(async () => ({ value: TOKEN }));
    lookup.mock.mockImplementationOnce(async () => null);
    await assert.rejects(registerInvitedClient(TOKEN, registration), (error) => error instanceof AuthError && error.status === 404);
    assert.equal(create.mock.callCount(), 0);
});

test("client-space resolution rejects disabled, unlinked, archived and staff accounts", async (t) => {
    const lookup = t.mock.method(prisma.user, "findUnique", async () => clientUser);
    for (const user of [null, { ...clientUser, isActive: false }, { ...clientUser, role: "MANAGER" }, { ...clientUser, client: null }, { ...clientUser, client: { ...clientUser.client, archivedAt: new Date() } }]) {
        lookup.mock.mockImplementationOnce(async () => user);
        await assert.rejects(requireClientSpace("user"), (error) => error instanceof AuthError && error.status === 403);
    }
});

test("client mission creation fixes ownership and draft state regardless of browser input", async (t) => {
    t.mock.method(prisma.user, "findUnique", async () => clientUser);
    t.mock.method(prisma.mission, "create", async (args) => {
        assert.equal(args.data.clientId, "own-client");
        assert.equal(args.data.status, "DRAFT"); assert.equal(args.data.isActive, false);
        return { ...args.data, id: "draft", createdAt: new Date() };
    });
    const mission = await saveClientMission("user", { ...brief, clientId: "victim", status: "ACTIVE", isActive: true });
    assert.equal(mission.id, "draft"); assert.equal(mission.brief?.offer, brief.offer);
});

test("draft edits scope both read and conditional write to the owning client", async (t) => {
    t.mock.method(prisma.user, "findUnique", async () => clientUser);
    t.mock.method(prisma, "$transaction", async (fn) => fn(prisma));
    t.mock.method(prisma.mission, "findFirst", async (args) => {
        assert.deepEqual(args.where, { id: "draft", clientId: "own-client" });
        return { playbook: { internalNote: "preserve", clientBrief: {} } };
    });
    t.mock.method(prisma.mission, "updateMany", async (args) => {
        assert.deepEqual(args.where, { id: "draft", clientId: "own-client", status: "DRAFT", isActive: false });
        assert.equal(args.data.playbook.internalNote, "preserve");
        return { count: 0 }; // agency activated between read and write
    });
    await assert.rejects(saveClientMission("user", brief, "draft"), (error) => error instanceof AuthError && error.status === 409);
});

test("another client's mission is unavailable and no write is attempted", async (t) => {
    t.mock.method(prisma.user, "findUnique", async () => clientUser);
    t.mock.method(prisma, "$transaction", async (fn) => fn(prisma));
    t.mock.method(prisma.mission, "findFirst", async () => null);
    const write = t.mock.method(prisma.mission, "updateMany", async () => { throw new Error("must not write"); });
    await assert.rejects(saveClientMission("user", brief, "foreign"), (error) => error instanceof AuthError && error.status === 404);
    assert.equal(write.mock.callCount(), 0);
});

test("client mission response excludes internal playbook content", () => {
    const mission = clientMissionView({ ...missionBriefData(missionBriefSchema.parse(brief)), id: "m", status: "DRAFT", isActive: false, createdAt: new Date(), playbook: { internalNote: "private", clientBrief: brief } });
    assert.equal("playbook" in mission, false);
    assert.equal(JSON.stringify(mission).includes("private"), false);
    assert.equal(mission.brief?.targetAudience, brief.targetAudience);
});
