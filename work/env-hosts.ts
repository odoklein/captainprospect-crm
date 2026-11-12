/**
 * Prints the key names in .env / .env.txt, plus the host of any URL value.
 * Values are never printed in full.
 *
 *     npx tsx work/env-hosts.ts
 */
import fs from "node:fs";
import path from "node:path";

for (const file of [".env", ".env.txt"]) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
    console.log(`\n== ${file} ==`);
    for (const line of lines) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (!m) continue;
        const key = m[1];
        const raw = m[2].trim().replace(/^["']|["']$/g, "");
        let hint = "";
        if (/^postgres(ql)?:\/\//i.test(raw)) {
            try {
                const url = new URL(raw);
                hint = `postgres host=${url.hostname} db=${url.pathname.slice(1)} user=${url.username}`;
            } catch {
                hint = "postgres url (unparseable)";
            }
        } else if (/^https?:\/\//i.test(raw)) {
            try {
                hint = `http host=${new URL(raw).hostname}`;
            } catch {
                hint = "http url";
            }
        } else {
            hint = `${raw.length} chars`;
        }
        console.log(`${key} -> ${hint}`);
    }
}
