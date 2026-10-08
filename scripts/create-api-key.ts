/**
 * Create a read-only API key for the public API (/api/v1) and the MCP server.
 *
 *   npx tsx scripts/create-api-key.ts --client <clientId> --name "ChatGPT" \
 *       --by manager@example.com [--scopes contacts:read,calls:read | all] \
 *       [--mission <missionId>] [--expires-days 90]
 *
 * The key is printed ONCE; only its SHA-256 hash is stored. Writes one ApiKey
 * row to whatever DATABASE_URL points at — check it first.
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { generateApiKey } from "../lib/api-keys";
import { READ_SCOPES, allowedEndpointsForScopes, isReadScope, type Scope } from "../lib/api-v1/scopes";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const clientId = arg("client");
  const name = arg("name");
  const byEmail = arg("by");
  const scopeArg = arg("scopes") ?? "all";
  const missionId = arg("mission") ?? null;
  const expiresDays = Number(arg("expires-days") ?? 0);

  if (!clientId || !name || !byEmail) {
    console.error('Usage: --client <clientId> --name "<label>" --by <manager email> [--scopes a,b|all] [--mission id] [--expires-days n]');
    process.exit(1);
  }

  const scopes: Scope[] = scopeArg === "all" ? [...READ_SCOPES] : [];
  if (scopeArg !== "all") {
    for (const s of scopeArg.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (!isReadScope(s)) {
        console.error(`Unknown or not-yet-supported scope: ${s}\nAvailable: ${READ_SCOPES.join(", ")}`);
        process.exit(1);
      }
      scopes.push(s);
    }
  }
  if (scopes.length === 0) {
    console.error("At least one scope is required.");
    process.exit(1);
  }

  const [client, issuer, mission] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { email: byEmail }, select: { id: true, role: true } }),
    missionId ? prisma.mission.findFirst({ where: { id: missionId, clientId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!client) throw new Error(`Client ${clientId} not found`);
  if (!issuer || issuer.role !== "MANAGER") throw new Error(`${byEmail} is not a MANAGER user`);
  if (missionId && !mission) throw new Error(`Mission ${missionId} does not belong to client ${clientId}`);

  const { fullKey, keyHash, keyPrefix } = generateApiKey();
  const record = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      keyPrefix,
      role: "CLIENT",
      clientId,
      missionId,
      allowedEndpoints: allowedEndpointsForScopes(scopes),
      expiresAt: expiresDays > 0 ? new Date(Date.now() + expiresDays * 86_400_000) : null,
      createdById: issuer.id,
    },
    select: { id: true },
  });

  console.log(`Key created for client "${client.name}" (id ${record.id})`);
  console.log(`Scopes: ${scopes.join(", ")}`);
  console.log("\nCopy it now — it will not be shown again:\n");
  console.log(fullKey);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
