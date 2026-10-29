/**
 * Runtime shims for the PDF engine (unpdf 2 = pdf.js 6), installed right
 * before it is imported.
 *
 * Why: the production image runs node:20-slim (Dockerfile) while unpdf 2
 * targets Node ≥ 24. pdf.js polyfills a few recent built-ins itself
 * (Promise.withResolvers, Map#getOrInsertComputed…), but evaluates
 * `typeof Iterator.prototype.join` at module load: on Node 20 there is no
 * global `Iterator`, the import throws « PDF.js could not be resolved:
 * ReferenceError: Iterator is not defined », and every PDF ended FAILED as
 * « fichier corrompu ». It also calls iterator helpers (`map.keys().filter()`),
 * `Set#intersection` and `ArrayBuffer#transferToFixedLength` (Node 22+).
 *
 * Each shim is installed only when the built-in is missing, so Node 22/24 run
 * untouched. Moving the image to node:22+ removes the need for this file.
 */

type AnyIterator = Iterator<unknown> & { [Symbol.iterator](): AnyIterator };

let installed = false;

function define(target: object, name: string, value: unknown): void {
    if (name in target) return;
    Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

function installIteratorHelpers(): void {
    const g = globalThis as Record<string, unknown>;
    // %IteratorPrototype%: the prototype of every built-in iterator's prototype.
    const iteratorProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())) as object;
    if (typeof g.Iterator === "undefined") {
        // A constructor-shaped global whose prototype is %IteratorPrototype%:
        // enough for `Iterator.prototype.x` checks and helper installation.
        function Iterator(this: unknown): void {
            if (new.target === undefined || new.target === Iterator) {
                throw new TypeError("Iterator is an abstract class");
            }
        }
        Object.defineProperty(Iterator, "prototype", { value: iteratorProto, writable: false });
        // A library that feature-detects the global may call Iterator.from: keep it whole.
        define(Iterator, "from", (source: Iterable<unknown> | Iterator<unknown>) => {
            const inner =
                typeof (source as Iterable<unknown>)[Symbol.iterator] === "function"
                    ? (source as Iterable<unknown>)[Symbol.iterator]()
                    : (source as Iterator<unknown>);
            return (function* () {
                yield* { [Symbol.iterator]: () => inner };
            })();
        });
        Object.defineProperty(g, "Iterator", { value: Iterator, writable: true, configurable: true, enumerable: false });
    }

    // Helpers return generators (whose prototype chain reaches %IteratorPrototype%,
    // so helpers chain: `it.filter(…).toArray()`).
    define(iteratorProto, "map", function* (this: AnyIterator, fn: (v: unknown, i: number) => unknown) {
        let i = 0;
        for (const v of { [Symbol.iterator]: () => this }) yield fn(v, i++);
    });
    define(iteratorProto, "filter", function* (this: AnyIterator, fn: (v: unknown, i: number) => unknown) {
        let i = 0;
        for (const v of { [Symbol.iterator]: () => this }) if (fn(v, i++)) yield v;
    });
    define(iteratorProto, "take", function* (this: AnyIterator, limit: number) {
        let left = Math.max(0, Math.floor(Number(limit) || 0));
        if (left === 0) return;
        for (const v of { [Symbol.iterator]: () => this }) {
            yield v;
            if (--left <= 0) return;
        }
    });
    define(iteratorProto, "drop", function* (this: AnyIterator, count: number) {
        let skip = Math.max(0, Math.floor(Number(count) || 0));
        for (const v of { [Symbol.iterator]: () => this }) {
            if (skip > 0) {
                skip--;
                continue;
            }
            yield v;
        }
    });
    define(iteratorProto, "flatMap", function* (this: AnyIterator, fn: (v: unknown, i: number) => Iterable<unknown>) {
        let i = 0;
        for (const v of { [Symbol.iterator]: () => this }) yield* fn(v, i++);
    });
    define(iteratorProto, "toArray", function (this: AnyIterator) {
        return Array.from({ [Symbol.iterator]: () => this });
    });
    define(iteratorProto, "forEach", function (this: AnyIterator, fn: (v: unknown, i: number) => void) {
        let i = 0;
        for (const v of { [Symbol.iterator]: () => this }) fn(v, i++);
    });
    define(iteratorProto, "some", function (this: AnyIterator, fn: (v: unknown, i: number) => unknown) {
        let i = 0;
        for (const v of { [Symbol.iterator]: () => this }) if (fn(v, i++)) return true;
        return false;
    });
    define(iteratorProto, "every", function (this: AnyIterator, fn: (v: unknown, i: number) => unknown) {
        let i = 0;
        for (const v of { [Symbol.iterator]: () => this }) if (!fn(v, i++)) return false;
        return true;
    });
    define(iteratorProto, "find", function (this: AnyIterator, fn: (v: unknown, i: number) => unknown) {
        let i = 0;
        for (const v of { [Symbol.iterator]: () => this }) if (fn(v, i++)) return v;
        return undefined;
    });
    define(iteratorProto, "reduce", function (this: AnyIterator, fn: (acc: unknown, v: unknown, i: number) => unknown, ...init: unknown[]) {
        let i = 0;
        let started = init.length > 0;
        let acc = init[0];
        for (const v of { [Symbol.iterator]: () => this }) {
            if (!started) {
                acc = v;
                started = true;
                i++;
                continue;
            }
            acc = fn(acc, v, i++);
        }
        if (!started) throw new TypeError("Reduce of empty iterator with no initial value");
        return acc;
    });
}

function installSetMethods(): void {
    const proto = Set.prototype as unknown as Record<string, unknown>;
    const has = (other: unknown) => (v: unknown) => (other as { has(v: unknown): boolean }).has(v);
    const keys = (other: unknown): Iterable<unknown> => (other as { keys(): Iterable<unknown> }).keys();
    define(proto, "intersection", function (this: Set<unknown>, other: unknown) {
        return new Set([...this].filter(has(other)));
    });
    define(proto, "union", function (this: Set<unknown>, other: unknown) {
        return new Set([...this, ...keys(other)]);
    });
    define(proto, "difference", function (this: Set<unknown>, other: unknown) {
        const inOther = has(other);
        return new Set([...this].filter((v) => !inOther(v)));
    });
    define(proto, "isSubsetOf", function (this: Set<unknown>, other: unknown) {
        return [...this].every(has(other));
    });
}

function installBufferMethods(): void {
    const ab = ArrayBuffer.prototype as unknown as Record<string, unknown>;
    const copy = function (this: ArrayBuffer, length?: number): ArrayBuffer {
        const size = length === undefined ? this.byteLength : Math.max(0, Math.floor(length));
        const out = new ArrayBuffer(size);
        new Uint8Array(out).set(new Uint8Array(this, 0, Math.min(size, this.byteLength)));
        return out;
    };
    // The real methods detach the source; a copy is observably equivalent for pdf.js.
    define(ab, "transferToFixedLength", copy);
    define(ab, "transfer", copy);

    const u8 = Uint8Array as unknown as Record<string, unknown>;
    define(u8, "fromBase64", (text: string) => new Uint8Array(Buffer.from(String(text), "base64")));
    define(u8, "fromHex", (text: string) => new Uint8Array(Buffer.from(String(text), "hex")));
    define(Uint8Array.prototype, "toBase64", function (this: Uint8Array) {
        return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("base64");
    });
}

/** Installs the shims once per process. Safe to call before every PDF import. */
export function ensurePdfRuntime(): void {
    if (installed) return;
    installed = true;
    installIteratorHelpers();
    installSetMethods();
    installBufferMethods();
}
