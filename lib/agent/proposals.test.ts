/**
 * Proposal decisions — claim once, expiry, approver context, audit, batch.
 * In-memory store with the same compare-and-set semantics as the Prisma one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { fixtureContext } from "@/lib/ai/agent/evals/fixtures";
import type { ActionStore, ActionState } from "@/lib/ai/agent/actions";
import { defineConfirmTool, params } from "@/lib/ai/tools/helpers";
import type { AnyToolDefinition } from "@/lib/ai/tools/types";
import { decideBatch, decideProposal, type DecideDeps, type ProposalRow } from "./proposals";

const NOW = new Date("2026-10-29T10:00:00.000Z");
const STATE: Record<ActionState, ProposalRow["state"]> = { pending: "PENDING", executing: "EXECUTING", cancelled: "REJECTED", expired: "EXPIRED", confirmed: "EXECUTED", failed: "FAILED" };

interface Row extends ProposalRow {
    decidedById: string | null;
    outcome: string | null;
    actionLogId: string | null;
}

function makeTool(name: string, behaviour: { fail?: boolean; secret?: boolean; executions: string[] }): AnyToolDefinition {
    return defineConfirmTool({
        name,
        label: name,
        description: "test",
        parameters: params({ id: { type: "string" } }, ["id"]),
        schema: z.object({ id: z.string().min(1) }),
        requiresProject: false,
        describe: async () => ({ title: name, details: [], warning: null, confirmLabel: "OK", danger: false }),
        execute: async (args, ctx) => {
            behaviour.executions.push(`${name}:${args.id}:${ctx.userId}:${ctx.mode}`);
            if (behaviour.fail) throw new Error("SMTP refusé");
            return { message: `Fait pour ${args.id}.`, secret: behaviour.secret ? { label: "Portail", login: "acme", password: "s3cret" } : null };
        },
    });
}

function world(rows: Row[], tools: AnyToolDefinition[]) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    const log: Array<{ tool: string; ok: boolean; outcome: string }> = [];
    const notified: Array<{ userId: string; title: string }> = [];
    const settled: string[] = [];
    const deps: DecideDeps = {
        load: async (id) => {
            const r = byId.get(id);
            return r ? { ...r, run: { ...r.run } } : null;
        },
        store: ({ approverId, actionLogId }): ActionStore => ({
            async claim(id, next) {
                const r = byId.get(id);
                if (!r || r.state !== "PENDING") return false;
                r.state = STATE[next.state];
                r.decidedById = approverId;
                return true;
            },
            async save(id, next) {
                const r = byId.get(id)!;
                r.state = STATE[next.state];
                r.outcome = next.outcome ?? null;
                r.actionLogId = actionLogId();
            },
        }),
        // Even if a context came back in background mode, the decision must run in chat mode.
        buildContext: async (p) => fixtureContext({ userId: p.userId, mode: "background", conversationId: p.conversationId }),
        resolveTool: (name) => toolMap.get(name),
        logAction: async ({ tool, ok, outcome }) => {
            log.push({ tool, ok, outcome });
            return `log_${log.length}`;
        },
        notify: async (p) => void notified.push({ userId: p.userId, title: p.title }),
        settleRun: async (runId) => void settled.push(runId),
        userName: async () => "Valentin",
        now: () => NOW,
    };
    return { deps, byId, log, notified, settled };
}

function row(id: string, overrides: Partial<Row> = {}): Row {
    return {
        id,
        runId: "run_1",
        tool: "send_thing",
        args: { id: "x1" },
        card: { title: "Envoyer", danger: false },
        risk: "confirm",
        state: "PENDING",
        proposedAt: new Date(NOW.getTime() - 3_600_000),
        expiresAt: new Date(NOW.getTime() + 3_600_000),
        run: { id: "run_1", actorId: "usr_actor", status: "WAITING_APPROVAL", clientId: null, missionId: null, folderId: null, conversationId: "conv_1" },
        decidedById: null,
        outcome: null,
        actionLogId: null,
        ...overrides,
    };
}

test("double click: two concurrent approvals execute once, the second reads not_pending", async () => {
    const executions: string[] = [];
    const w = world([row("p1")], [makeTool("send_thing", { executions })]);
    const [a, b] = await Promise.all([
        decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_mgr" }, w.deps),
        decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_mgr" }, w.deps),
    ]);
    assert.deepEqual([a.kind, b.kind].sort(), ["executed", "not_pending"]);
    assert.equal(executions.length, 1);
    const again = await decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_other" }, w.deps);
    assert.equal(again.kind, "not_pending");
    assert.equal(executions.length, 1);
});

test("approval runs under the approver, in chat mode, audited, actor notified, run settled", async () => {
    const executions: string[] = [];
    const w = world([row("p1")], [makeTool("send_thing", { executions })]);
    const res = await decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_mgr" }, w.deps);
    assert.equal(res.kind, "executed");
    assert.deepEqual(executions, ["send_thing:x1:usr_mgr:chat"]);
    const stored = w.byId.get("p1")!;
    assert.equal(stored.state, "EXECUTED");
    assert.equal(stored.decidedById, "usr_mgr");
    assert.equal(stored.actionLogId, "log_1");
    assert.equal(stored.outcome, "Fait pour x1.");
    assert.deepEqual(w.log, [{ tool: "send_thing", ok: true, outcome: "Fait pour x1." }]);
    assert.equal(w.notified.length, 1);
    assert.equal(w.notified[0].userId, "usr_actor");
    assert.match(w.notified[0].title, /approuvée par Valentin/);
    assert.deepEqual(w.settled, ["run_1"]);
});

test("the run's own actor deciding is not notified", async () => {
    const w = world([row("p1")], [makeTool("send_thing", { executions: [] })]);
    await decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_actor" }, w.deps);
    assert.equal(w.notified.length, 0);
});

test("expired: an approval past expiresAt is refused and nothing runs", async () => {
    const executions: string[] = [];
    const w = world([row("p1", { expiresAt: new Date(NOW.getTime() - 1_000) })], [makeTool("send_thing", { executions })]);
    const res = await decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_mgr" }, w.deps);
    assert.equal(res.kind, "expired");
    assert.equal(w.byId.get("p1")!.state, "EXPIRED");
    assert.equal(executions.length, 0);
});

test("reject records the refusal without running anything", async () => {
    const executions: string[] = [];
    const w = world([row("p1")], [makeTool("send_thing", { executions })]);
    const res = await decideProposal({ proposalId: "p1", decision: "reject", approver: "usr_mgr" }, w.deps);
    assert.equal(res.kind, "rejected");
    assert.equal(w.byId.get("p1")!.state, "REJECTED");
    assert.equal(executions.length, 0);
    assert.match(w.notified[0].title, /refusée/);
});

test("a failing tool → FAILED with the error as outcome, audited as not ok", async () => {
    const w = world([row("p1")], [makeTool("send_thing", { fail: true, executions: [] })]);
    const res = await decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_mgr" }, w.deps);
    assert.equal(res.kind, "failed");
    assert.equal(res.error, "SMTP refusé");
    assert.equal(w.byId.get("p1")!.state, "FAILED");
    assert.equal(w.byId.get("p1")!.outcome, "SMTP refusé");
    assert.deepEqual(w.log.map((l) => l.ok), [false]);
});

test("a secret is returned once and never stored", async () => {
    const w = world([row("p1")], [makeTool("send_thing", { secret: true, executions: [] })]);
    const res = await decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_mgr" }, w.deps);
    assert.equal(res.secret?.password, "s3cret");
    assert.doesNotMatch(JSON.stringify(w.byId.get("p1")), /s3cret/);
    assert.doesNotMatch(JSON.stringify(w.log), /s3cret/);
});

test("unknown tool or a risk that does not match the proposal: failed, never executed", async () => {
    const executions: string[] = [];
    const w = world([row("p1", { tool: "ghost" }), row("p2", { risk: "safe_write" })], [makeTool("send_thing", { executions })]);
    assert.equal((await decideProposal({ proposalId: "p1", decision: "approve", approver: "usr_mgr" }, w.deps)).kind, "failed");
    assert.equal((await decideProposal({ proposalId: "p2", decision: "approve", approver: "usr_mgr" }, w.deps)).kind, "failed");
    assert.equal(executions.length, 0);
    assert.equal((await decideProposal({ proposalId: "nope", decision: "approve", approver: "usr_mgr" }, w.deps)).kind, "not_found");
});

test("batch: sequential, stops after a failing danger card", async () => {
    const executions: string[] = [];
    const w = world(
        [
            row("p1", { tool: "ok_tool" }),
            row("p2", { tool: "bad_tool", card: { title: "Envoyer au client", danger: true } }),
            row("p3", { tool: "ok_tool", args: { id: "x3" } }),
        ],
        [makeTool("ok_tool", { executions }), makeTool("bad_tool", { fail: true, executions })],
    );
    const results = await decideBatch({ ids: ["p1", "p2", "p3"], decision: "approve", approver: "usr_mgr" }, w.deps);
    assert.deepEqual(results.map((r) => r.result?.kind ?? "skipped"), ["executed", "failed", "skipped"]);
    assert.match(results[2].skipped ?? "", /interrompu/);
    assert.equal(w.byId.get("p3")!.state, "PENDING");
    assert.deepEqual(executions, ["ok_tool:x1:usr_mgr:chat", "bad_tool:x1:usr_mgr:chat"]);
});

test("batch: a failing non-danger card does not stop the rest", async () => {
    const executions: string[] = [];
    const w = world(
        [row("p1", { tool: "bad_tool" }), row("p2", { tool: "ok_tool", args: { id: "x2" } })],
        [makeTool("ok_tool", { executions }), makeTool("bad_tool", { fail: true, executions })],
    );
    const results = await decideBatch({ ids: ["p1", "p2"], decision: "approve", approver: "usr_mgr" }, w.deps);
    assert.deepEqual(results.map((r) => r.result?.kind), ["failed", "executed"]);
});
