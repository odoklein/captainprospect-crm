#!/usr/bin/env node
// Downloads brand logos from a public logo API into /public/logos/<domain>.png.
// Brands come from content/brands.ts (Node >= 22.18 reads the .ts file directly).
//
// API used:
//   - logo.dev when LOGO_DEV_TOKEN is set (free key at https://logo.dev): sharper, real logos;
//   - otherwise Google's public favicon service (no key needed).
//
// Usage: npm run logos [-- --force]

import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "logos");
const force = process.argv.includes("--force");

const { customers, tools } = await import(path.join(root, "content", "brands.ts"));
const brands = [...customers, ...Object.values(tools)].filter((b) => b.logo === undefined);

const token = process.env.LOGO_DEV_TOKEN;
const apiUrl = (domain) =>
  token
    ? `https://img.logo.dev/${domain}?token=${token}&size=128&format=png`
    : `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;

await mkdir(outDir, { recursive: true });

let failed = 0;
for (const brand of brands) {
  const file = path.join(outDir, `${brand.domain}.png`);
  if (!force) {
    try {
      await access(file);
      console.log(`= ${brand.name} (déjà présent)`);
      continue;
    } catch {}
  }
  try {
    const res = await fetch(apiUrl(brand.domain));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.log(`✓ ${brand.name} → public/logos/${brand.domain}.png`);
  } catch (err) {
    failed++;
    console.warn(`✗ ${brand.name} (${brand.domain}) : ${err.message}. Déposez un fichier et renseignez \`logo\` dans content/brands.ts.`);
  }
}

console.log(`\n${brands.length - failed}/${brands.length} logos prêts (${token ? "logo.dev" : "Google favicons"}).`);
if (failed) process.exitCode = 1;
