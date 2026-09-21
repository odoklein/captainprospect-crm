/**
 * Permission-matrix and lifecycle tests for the Support Technique module.
 *
 * Everything under test is pure, so this runs without a database:
 *     npm run test:tickets
 *
 * The cases that matter most are the negative ones: a client must never reach
 * the internal surface, a developer must never gain manager-only powers, and a
 * ticket must never reach COMPLETED with an affected role left untested.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { UserRole } from "@prisma/client";

import {
    canAccessTickets,
    canChangeStatus,
    canComment,
    canCreateTicket,
    canDeleteTicket,
    canEditTicketFields,
    canPublishToRoadmap,
    canReadOwnRequest,
    canSubmitTicketRequest,
    canToggleReleaseCheck,
    canValidateTicket,
    canViewTicket,
} from "./permissions";
import { assertStatusTransition } from "./service";
import { ROADMAP_BUCKET_BY_STATUS, TICKET_STATUS_TRANSITIONS, formatTicketRef } from "./constants";
import { clientChangelogWhere, clientRoadmapWhere, CLIENT_TICKET_SELECT, toRoadmapItem } from "./public";
import {
    createTicketSchema,
    publishTicketSchema,
    submitTicketRequestSchema,
    updateStatusSchema,
    validateTicketSchema,
} from "./schemas";

const MANAGER = { id: "m1", role: "MANAGER" as UserRole };
const DEV = { id: "d1", role: "DEVELOPER" as UserRole };
const OTHER_DEV = { id: "d2", role: "DEVELOPER" as UserRole };
const CLIENT = { id: "c1", role: "CLIENT" as UserRole };
const SDR = { id: "s1", role: "SDR" as UserRole };

const assignedToDev = { assigneeId: "d1" };
const unassigned = { assigneeId: null };

// ============================================
// ROLE ACCESS
// ============================================

test("only manager and developer reach the internal ticket surface", () => {
    assert.equal(canAccessTickets(MANAGER), true);
    assert.equal(canAccessTickets(DEV), true);
    assert.equal(canAccessTickets(CLIENT), false);
    assert.equal(canAccessTickets(SDR), false);
    assert.equal(canViewTicket(CLIENT), false);
});

test("only a manager creates, edits, publishes and deletes", () => {
    for (const actor of [DEV, CLIENT, SDR]) {
        assert.equal(canCreateTicket(actor), false, `${actor.role} must not create`);
        assert.equal(canEditTicketFields(actor), false, `${actor.role} must not edit fields`);
        assert.equal(canPublishToRoadmap(actor), false, `${actor.role} must not publish`);
        assert.equal(canDeleteTicket(actor), false, `${actor.role} must not delete`);
    }

    assert.equal(canCreateTicket(MANAGER), true);
    assert.equal(canEditTicketFields(MANAGER), true);
    assert.equal(canPublishToRoadmap(MANAGER), true);
    assert.equal(canDeleteTicket(MANAGER), true);
});

test("a developer moves the status only on their own tickets", () => {
    assert.equal(canChangeStatus(DEV, assignedToDev), true);
    assert.equal(canChangeStatus(OTHER_DEV, assignedToDev), false);
    assert.equal(canChangeStatus(DEV, unassigned), false);
    assert.equal(canChangeStatus(MANAGER, unassigned), true);
    assert.equal(canChangeStatus(CLIENT, assignedToDev), false);
});

test("commenting stays internal", () => {
    assert.equal(canComment(MANAGER), true);
    assert.equal(canComment(DEV), true);
    assert.equal(canComment(CLIENT), false);
    assert.equal(canComment(SDR), false);
});

// ============================================
// RELEASE CHECKLIST
// ============================================

test("a developer signs off only the DEVELOPER line of their own ticket", () => {
    assert.equal(canToggleReleaseCheck(DEV, assignedToDev, "DEVELOPER"), true);
    assert.equal(canToggleReleaseCheck(DEV, assignedToDev, "CLIENT"), false);
    assert.equal(canToggleReleaseCheck(DEV, assignedToDev, "MANAGER"), false);
    assert.equal(canToggleReleaseCheck(OTHER_DEV, assignedToDev, "DEVELOPER"), false);
});

test("a manager signs off any line", () => {
    for (const role of ["MANAGER", "CLIENT", "SDR", "DEVELOPER"] as UserRole[]) {
        assert.equal(canToggleReleaseCheck(MANAGER, unassigned, role), true);
    }
});

// ============================================
// LIFECYCLE
// ============================================

test("COMPLETED is only reachable from TESTING", () => {
    for (const [from, allowed] of Object.entries(TICKET_STATUS_TRANSITIONS)) {
        if (from === "TESTING") continue;
        assert.equal(allowed.includes("COMPLETED"), false, `${from} must not jump to COMPLETED`);
    }
    assert.equal(TICKET_STATUS_TRANSITIONS.TESTING.includes("COMPLETED"), true);
});

test("assertStatusTransition rejects illegal jumps and allows legal ones", () => {
    assert.throws(() => assertStatusTransition("NEW", "COMPLETED"));
    assert.throws(() => assertStatusTransition("NEW", "TESTING"));
    assert.throws(() => assertStatusTransition("TODO", "COMPLETED"));

    assert.doesNotThrow(() => assertStatusTransition("NEW", "TODO"));
    assert.doesNotThrow(() => assertStatusTransition("IN_PROGRESS", "BLOCKED"));
    assert.doesNotThrow(() => assertStatusTransition("TESTING", "COMPLETED"));
    // A no-op save must not be treated as a transition.
    assert.doesNotThrow(() => assertStatusTransition("BLOCKED", "BLOCKED"));
});

test("blocking a ticket requires a reason", () => {
    assert.equal(updateStatusSchema.safeParse({ status: "BLOCKED" }).success, false);
    assert.equal(updateStatusSchema.safeParse({ status: "BLOCKED", comment: "   " }).success, false);
    assert.equal(
        updateStatusSchema.safeParse({ status: "BLOCKED", comment: "API tierce indisponible" }).success,
        true,
    );
    assert.equal(updateStatusSchema.safeParse({ status: "IN_PROGRESS" }).success, true);
});

// ============================================
// VALIDATION
// ============================================

test("a client-facing ticket must name a client", () => {
    const base = {
        title: "Corriger le filtre",
        category: "BUG" as const,
        affectedRoles: ["DEVELOPER" as const, "CLIENT" as const],
    };

    assert.equal(createTicketSchema.safeParse({ ...base, scope: "CLIENT_FACING" }).success, false);
    assert.equal(
        createTicketSchema.safeParse({ ...base, scope: "CLIENT_FACING", clientId: "clh1234567890abcdefghijk" })
            .success,
        true,
    );
    assert.equal(createTicketSchema.safeParse({ ...base, scope: "INTERNAL" }).success, true);
});

test("a client-facing ticket must list CLIENT among the affected roles", () => {
    const base = {
        title: "Corriger le filtre",
        category: "BUG" as const,
        scope: "CLIENT_FACING" as const,
        clientId: "clh1234567890abcdefghijk",
    };

    // Without CLIENT the release checklist would be signed off by the developer
    // alone and the client side would never be verified.
    assert.equal(createTicketSchema.safeParse({ ...base, affectedRoles: ["DEVELOPER"] }).success, false);
    assert.equal(createTicketSchema.safeParse({ ...base, affectedRoles: ["DEVELOPER", "CLIENT"] }).success, true);
});

test("at least one affected role is required", () => {
    const result = createTicketSchema.safeParse({
        title: "Corriger le filtre",
        category: "BUG",
        scope: "INTERNAL",
        affectedRoles: [],
    });
    assert.equal(result.success, false);
});

test("publishing requires a public title", () => {
    assert.equal(publishTicketSchema.safeParse({ publishToRoadmap: true }).success, false);
    assert.equal(publishTicketSchema.safeParse({ publishToRoadmap: true, publicTitle: "  " }).success, false);
    assert.equal(
        publishTicketSchema.safeParse({ publishToRoadmap: true, publicTitle: "Synchronisation plus fiable" }).success,
        true,
    );
    // Un-publishing needs no title.
    assert.equal(publishTicketSchema.safeParse({ publishToRoadmap: false }).success, true);
});

// ============================================
// CLIENT-FACING PROJECTION
// ============================================

test("the client select never exposes internal fields", () => {
    const exposed = Object.keys(CLIENT_TICKET_SELECT);
    for (const forbidden of ["title", "description", "priority", "assigneeId", "requesterId", "category", "scope"]) {
        assert.equal(exposed.includes(forbidden), false, `${forbidden} must not be selectable by a client`);
    }
    assert.deepEqual(exposed.sort(), ["completedAt", "id", "publicDescription", "publicTitle", "status", "updatedAt"]);
});

test("the roadmap filter pins scope and publication, not just the client id", () => {
    const where = clientRoadmapWhere("client-1");
    assert.equal(where.clientId, "client-1");
    assert.equal(where.scope, "CLIENT_FACING");
    assert.equal(where.publishToRoadmap, true);

    const changelog = clientChangelogWhere("client-1");
    assert.equal(changelog.scope, "CLIENT_FACING");
    assert.equal(changelog.publishToRoadmap, true);
    assert.equal(changelog.status, "COMPLETED");
});

test("roadmap items carry the public wording, never the internal one", () => {
    const item = toRoadmapItem({
        id: "t1",
        publicTitle: "Synchronisation plus fiable",
        publicDescription: "Les données se mettent à jour plus vite.",
        status: "IN_PROGRESS",
        completedAt: null,
        updatedAt: new Date("2026-09-01"),
    });

    assert.equal(item.title, "Synchronisation plus fiable");
    assert.equal(item.bucket, "IN_PROGRESS");
});

test("the six internal statuses collapse to the three client columns", () => {
    assert.equal(ROADMAP_BUCKET_BY_STATUS.NEW, "UPCOMING");
    assert.equal(ROADMAP_BUCKET_BY_STATUS.TODO, "UPCOMING");
    assert.equal(ROADMAP_BUCKET_BY_STATUS.IN_PROGRESS, "IN_PROGRESS");
    assert.equal(ROADMAP_BUCKET_BY_STATUS.BLOCKED, "IN_PROGRESS");
    assert.equal(ROADMAP_BUCKET_BY_STATUS.TESTING, "IN_PROGRESS");
    assert.equal(ROADMAP_BUCKET_BY_STATUS.COMPLETED, "DONE");
});

test("ticket references are zero-padded", () => {
    assert.equal(formatTicketRef(1), "#TC-0001");
    assert.equal(formatTicketRef(1234), "#TC-1234");
    assert.equal(formatTicketRef(12345), "#TC-12345");
});

// ============================================
// SALES-TEAM REQUEST INTAKE (TC-0032)
// ============================================

const BD = { id: "b1", role: "BUSINESS_DEVELOPER" as UserRole };
const BOOKER = { id: "bk1", role: "BOOKER" as UserRole };
const COMMERCIAL = { id: "co1", role: "COMMERCIAL" as UserRole };

test("the sales team may file a request but never reach the board", () => {
    for (const actor of [SDR, BD, BOOKER]) {
        assert.equal(canSubmitTicketRequest(actor), true, `${actor.role} must be able to file`);
        // Filing is not creating: the board and its manager powers stay closed.
        assert.equal(canAccessTickets(actor), false, `${actor.role} must not read the board`);
        assert.equal(canCreateTicket(actor), false, `${actor.role} must not create a ticket outright`);
        assert.equal(canValidateTicket(actor), false, `${actor.role} must not validate`);
    }

    // Clients and client-side commercials keep no access at all.
    assert.equal(canSubmitTicketRequest(CLIENT), false);
    assert.equal(canSubmitTicketRequest(COMMERCIAL), false);
    assert.equal(canSubmitTicketRequest(MANAGER), false);
});

test("only a manager rules on a pending request", () => {
    assert.equal(canValidateTicket(MANAGER), true);
    assert.equal(canValidateTicket(DEV), false);
    assert.equal(canValidateTicket(CLIENT), false);
});

test("a requester reads their own request and nobody else's", () => {
    assert.equal(canReadOwnRequest(SDR, { requesterId: SDR.id }), true);
    assert.equal(canReadOwnRequest(SDR, { requesterId: "someone-else" }), false);
    // Internal roles keep reading everything.
    assert.equal(canReadOwnRequest(DEV, { requesterId: "someone-else" }), true);
    assert.equal(canReadOwnRequest(MANAGER, { requesterId: "someone-else" }), true);
    // A client is not a requester, so ownership never grants them a read.
    assert.equal(canReadOwnRequest(CLIENT, { requesterId: CLIENT.id }), false);
});

test("a request carries only what the requester may decide", () => {
    const valid = { title: "Le filtre saute", description: "Il se réinitialise à chaque retour.", category: "BUG" };
    assert.equal(submitTicketRequestSchema.safeParse(valid).success, true);

    assert.equal(submitTicketRequestSchema.safeParse({ ...valid, description: "court" }).success, false);
    assert.equal(submitTicketRequestSchema.safeParse({ ...valid, title: "ab" }).success, false);

    // Priority and assignee are triage decisions — stripped, not accepted.
    const parsed = submitTicketRequestSchema.parse({ ...valid, priority: "URGENT", assigneeId: "x" } as never);
    assert.equal("priority" in parsed, false);
    assert.equal("assigneeId" in parsed, false);
});

test("a refusal needs a reason and an acceptance needs affected roles", () => {
    assert.equal(validateTicketSchema.safeParse({ decision: "REJECTED" }).success, false);
    assert.equal(validateTicketSchema.safeParse({ decision: "REJECTED", rejectionReason: "  " }).success, false);
    assert.equal(
        validateTicketSchema.safeParse({ decision: "REJECTED", rejectionReason: "Doublon de TC-0012" }).success,
        true,
    );

    assert.equal(validateTicketSchema.safeParse({ decision: "ACCEPTED" }).success, false);
    assert.equal(
        validateTicketSchema.safeParse({ decision: "ACCEPTED", affectedRoles: ["SDR"], priority: "HIGH" }).success,
        true,
    );
});
