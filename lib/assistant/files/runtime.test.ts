/**
 * The pdf.js runtime shims (meaningful on Node 20, the production image;
 * no-ops on Node 22+):
 *     npx tsx --test lib/assistant/files/runtime.test.ts
 *     npx -y node@20 node_modules/tsx/dist/cli.mjs --test lib/assistant/files/runtime.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ensurePdfRuntime } from "./runtime";

test("after ensurePdfRuntime, the built-ins pdf.js 6 uses exist and behave", () => {
    ensurePdfRuntime();
    ensurePdfRuntime(); // idempotent
    const g = globalThis as unknown as { Iterator: { prototype: object } };
    assert.equal(typeof g.Iterator, "function");
    // pdf.js evaluates this at import time; it threw « Iterator is not defined » on Node 20.
    assert.doesNotThrow(() => typeof (g.Iterator.prototype as { join?: unknown }).join);
    const from = (g.Iterator as unknown as { from(x: Iterable<number>): Iterator<number> & { toArray(): number[] } }).from([1, 2]);
    assert.deepEqual(from.toArray(), [1, 2]);

    type Helpers = Iterator<number> & {
        filter(fn: (v: number) => boolean): Helpers;
        map<T>(fn: (v: number) => T): Helpers;
        toArray(): number[];
        some(fn: (v: number) => boolean): boolean;
        find(fn: (v: number) => boolean): number | undefined;
    };
    const keys = () => new Map([[1, "a"], [2, "b"], [3, "c"]]).keys() as unknown as Helpers;
    assert.deepEqual(keys().filter((k) => k > 1).toArray(), [2, 3]);
    assert.deepEqual(keys().map((k) => k * 10).toArray(), [10, 20, 30]);
    assert.equal(keys().some((k) => k === 3), true);
    assert.equal(keys().find((k) => k === 2), 2);
    assert.equal(new Set([1, 2, 3]).values().toArray === undefined, false);

    const inter = (new Set([1, 2, 3]) as unknown as { intersection(o: Set<number>): Set<number> }).intersection(new Set([2, 3, 4]));
    assert.deepEqual([...inter], [2, 3]);

    const buf = new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer & { transferToFixedLength(n?: number): ArrayBuffer };
    assert.deepEqual([...new Uint8Array(buf.transferToFixedLength(2))], [1, 2]);
});
