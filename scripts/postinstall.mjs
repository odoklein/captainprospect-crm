/**
 * Postinstall: Create chromium-pack.tar from @sparticuz/chromium for Vercel.
 * Used by @sparticuz/chromium-min at runtime to fetch the Chromium binary.
 * Runs on Vercel build (Linux); may skip on Windows if tar unavailable.
 */
import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const projectRoot = dirname(__dirname);

async function main() {
    try {
        const shouldBuildChromiumPack =
            process.env.VERCEL || process.env.BUILD_CHROMIUM_PACK === "true";
        if (!shouldBuildChromiumPack) {
            console.log("Chromium postinstall: skipping chromium-pack.tar outside Vercel.");
            return;
        }

        console.log("📦 Chromium postinstall: creating chromium-pack.tar...");
        const chromiumEntry = require.resolve("@sparticuz/chromium");
        const chromiumDir = dirname(dirname(dirname(chromiumEntry)));
        const binDir = join(chromiumDir, "bin");
        if (!existsSync(binDir)) {
            console.log("⚠️ Chromium bin directory not found, skipping (OK for local dev)");
            return;
        }
        const publicDir = join(projectRoot, "public");
        const outputPath = join(publicDir, "chromium-pack.tar");
        if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
        execSync(`tar -cf "${outputPath}" -C "${binDir}" .`, {
            stdio: "inherit",
            cwd: projectRoot,
        });
        console.log("✅ chromium-pack.tar created");
    } catch (err) {
        console.warn("⚠️ Chromium archive creation skipped:", err.message);
        process.exit(0);
    }
}
main();
