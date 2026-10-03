/**
 * Brand & design-system guard.
 *
 *   npm run brand:check                       report only
 *   npm run brand:check -- --legacy "Old Agency,OldProduct"
 *   npm run brand:check -- --strict           exit 1 on any finding (CI)
 *
 * 1. Hard-coded agency names: the current brand (brand/brand.config.ts) and any
 *    --legacy names. Every visible name should come from `brand.*`, so after a
 *    clone this list must be empty.
 * 2. Hard-coded colours in Tailwind classes (`bg-[#7C5CFC]`): use the role
 *    utilities instead (bg-primary, text-ink-2, border-line…). Status colours
 *    and `dark:` classes are not reported.
 *
 * Exceptions are explicit: a line containing `brand-check-ignore` is skipped, and a
 * file with `brand-check-ignore-file` in its first 5 lines is skipped entirely.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { brandConfig } from "../brand/brand.config";

const ROOT = join(__dirname, "..");
const SCAN = ["app", "components", "lib", "hooks"];
const SKIP_DIRS = new Set(["node_modules", ".next", "lead-hub"]);
const SKIP_FILES = [`lib${sep}brand${sep}`, `brand${sep}`, `scripts${sep}brand-check.ts`];
const IGNORE_LINE = "brand-check-ignore";
const IGNORE_FILE = "brand-check-ignore-file";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const legacyArg = args[args.indexOf("--legacy") + 1];
const legacy = args.includes("--legacy") && legacyArg ? legacyArg.split(",").map((s) => s.trim()).filter(Boolean) : [];

const names = Array.from(
    new Set([brandConfig.identity.name, brandConfig.identity.name.replace(/\s+/g, ""), brandConfig.identity.productName, ...legacy]),
);
const hosts = [new URL(brandConfig.web.appUrl).host];

// Status / provider colours are meaning, not brand: not reported.
const STATUS = new Set(
    "10b981 059669 047857 34d399 a7f3d0 d1fae5 ecfdf5 f59e0b d97706 b45309 fcd34d fde68a fef3c7 fffbeb ef4444 dc2626 b91c1c f87171 fecaca fee2e2 fef2f2 22c55e 16a34a 15803d e11d48 f43f5e 3b82f6 2563eb 1d4ed8 60a5fa bfdbfe dbeafe eff6ff ffffff 000000 ea4335 0078d4 34a853 fbbc05 4285f4 0a66c2 004182".split(" "),
);

function walk(dir: string, out: string[]) {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
    }
}

const files: string[] = [];
for (const d of SCAN) walk(join(ROOT, d), files);

const nameHits: string[] = [];
const hexHits = new Map<string, number>();

const nameRe = new RegExp(`(${[...names, ...hosts].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i");
const hexClassRe = /(?<![\w-])((?:[a-z0-9-]+:)*)(?:bg|text|border(?:-[trblxy])?|ring|divide|fill|stroke|outline|from|via|to)-\[#([0-9a-fA-F]{6})\]/g;

for (const file of files) {
    const rel = relative(ROOT, file);
    if (SKIP_FILES.some((s) => rel.startsWith(s) || rel.includes(`${sep}${s}`))) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    // `brand-check-ignore-file` in the first 5 lines exempts a whole file (deliberate off-brand UI).
    if (lines.slice(0, 5).some((l) => l.includes(IGNORE_FILE))) continue;
    lines.forEach((line, i) => {
        // `brand-check-ignore` exempts one line (e.g. a persisted value that must not change).
        if (line.includes(IGNORE_LINE)) return;
        const trimmed = line.trim();
        const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
        if (!isComment && nameRe.test(line)) nameHits.push(`${rel}:${i + 1}  ${trimmed.slice(0, 120)}`);
        for (const m of line.matchAll(hexClassRe)) {
            if (m[1].includes("dark:")) continue;
            if (STATUS.has(m[2].toLowerCase())) continue;
            hexHits.set(rel, (hexHits.get(rel) ?? 0) + 1);
        }
    });
}

console.log(`\nBrand check — "${brandConfig.identity.name}" (${files.length} files)\n`);
console.log(`1. Hard-coded agency names / app host: ${nameHits.length}`);
for (const h of nameHits.slice(0, 80)) console.log(`   ${h}`);
if (nameHits.length > 80) console.log(`   … ${nameHits.length - 80} more`);

const hexTotal = [...hexHits.values()].reduce((a, b) => a + b, 0);
console.log(`\n2. Hex colours in Tailwind classes (use role utilities): ${hexTotal} in ${hexHits.size} files`);
for (const [f, n] of [...hexHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`   ${String(n).padStart(4)}  ${f}`);
console.log("");

if (strict && (nameHits.length > 0 || hexTotal > 0)) process.exit(1);
