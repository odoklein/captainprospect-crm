// ============================================
// STREAMING ZIP WRITER — deflate per entry, data descriptors, no dependency.
//
//   const zip = new ZipWriter(fs.createWriteStream(path));
//   await zip.addEntry("contacts.csv", rows());   // async iterable of string | Buffer
//   await zip.finish();
//
// Memory stays flat: each entry is compressed as it is produced. Plain ZIP (not
// ZIP64): an entry or archive over ~4 GB is refused instead of silently corrupted.
// ============================================

import { createDeflateRaw, crc32 } from "node:zlib";
import type { Writable } from "node:stream";

const MAX_SIZE = 0xfffffffe;

type CentralRecord = { name: Buffer; crc: number; csize: number; usize: number; offset: number; dosTime: number; dosDate: number };

function dosDateTime(d: Date): { dosTime: number; dosDate: number } {
    const year = Math.max(1980, d.getFullYear());
    return {
        dosTime: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        dosDate: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

export class ZipWriter {
    private offset = 0;
    private central: CentralRecord[] = [];

    constructor(private out: Writable) {}

    private async write(buf: Buffer): Promise<void> {
        this.offset += buf.length;
        if (this.offset > MAX_SIZE) throw new Error("zip_too_large");
        if (!this.out.write(buf)) await new Promise<void>((resolve) => this.out.once("drain", () => resolve()));
    }

    async addEntry(name: string, chunks: AsyncIterable<string | Buffer> | Iterable<string | Buffer>, when = new Date()): Promise<void> {
        const nameBuf = Buffer.from(name, "utf8");
        const { dosTime, dosDate } = dosDateTime(when);
        const offset = this.offset;

        // Local header: bit 3 (sizes follow in a data descriptor) + bit 11 (UTF-8 names), deflate.
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x0808, 6);
        header.writeUInt16LE(8, 8);
        header.writeUInt16LE(dosTime, 10);
        header.writeUInt16LE(dosDate, 12);
        header.writeUInt16LE(nameBuf.length, 26);
        await this.write(Buffer.concat([header, nameBuf]));

        const deflate = createDeflateRaw();
        let crc = 0;
        let usize = 0;
        let csize = 0;
        const flushed = new Promise<void>((resolve, reject) => {
            deflate.on("error", reject);
            deflate.on("end", resolve);
        });
        // Backpressure on the compressed side: pause reading while the file stream is full.
        const drain = (async () => {
            for await (const part of deflate) {
                csize += (part as Buffer).length;
                await this.write(part as Buffer);
            }
        })();

        for await (const chunk of chunks) {
            const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
            if (buf.length === 0) continue;
            crc = crc32(buf, crc);
            usize += buf.length;
            if (usize > MAX_SIZE) throw new Error("zip_too_large");
            if (!deflate.write(buf)) await new Promise<void>((resolve) => deflate.once("drain", () => resolve()));
        }
        deflate.end();
        await Promise.all([flushed, drain]);

        const descriptor = Buffer.alloc(16);
        descriptor.writeUInt32LE(0x08074b50, 0);
        descriptor.writeUInt32LE(crc >>> 0, 4);
        descriptor.writeUInt32LE(csize, 8);
        descriptor.writeUInt32LE(usize, 12);
        await this.write(descriptor);

        this.central.push({ name: nameBuf, crc: crc >>> 0, csize, usize, offset, dosTime, dosDate });
    }

    async finish(): Promise<void> {
        const start = this.offset;
        for (const r of this.central) {
            const h = Buffer.alloc(46);
            h.writeUInt32LE(0x02014b50, 0);
            h.writeUInt16LE(20, 4);
            h.writeUInt16LE(20, 6);
            h.writeUInt16LE(0x0808, 8);
            h.writeUInt16LE(8, 10);
            h.writeUInt16LE(r.dosTime, 12);
            h.writeUInt16LE(r.dosDate, 14);
            h.writeUInt32LE(r.crc, 16);
            h.writeUInt32LE(r.csize, 20);
            h.writeUInt32LE(r.usize, 24);
            h.writeUInt16LE(r.name.length, 28);
            h.writeUInt32LE(r.offset, 42);
            await this.write(Buffer.concat([h, r.name]));
        }
        const size = this.offset - start;
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(this.central.length, 8);
        end.writeUInt16LE(this.central.length, 10);
        end.writeUInt32LE(size, 12);
        end.writeUInt32LE(start, 16);
        await this.write(end);
        await new Promise<void>((resolve, reject) => {
            this.out.once("error", reject);
            this.out.end(() => resolve());
        });
    }
}
