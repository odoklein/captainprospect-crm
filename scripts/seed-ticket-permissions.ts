// Grants the Support Technique permissions. Idempotent: safe to re-run.
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const PERMISSIONS = [
    { code: "pages.tickets", name: "Support technique", description: "Accès aux tickets de développement", category: "pages" },
    { code: "pages.client_roadmap", name: "Roadmap client", description: "Accès à la roadmap et aux nouveautés côté client", category: "pages" },
    { code: "features.create_ticket", name: "Créer ticket", description: "Peut créer des tickets de développement", category: "features" },
    { code: "features.assign_ticket", name: "Assigner ticket", description: "Peut assigner un ticket à un développeur", category: "features" },
    { code: "features.publish_ticket_roadmap", name: "Publier sur la roadmap", description: "Peut publier un ticket sur la roadmap client", category: "features" },
    { code: "features.delete_ticket", name: "Supprimer ticket", description: "Peut supprimer un ticket", category: "features" },
];

const GRANTS: Record<string, UserRole[]> = {
    "pages.tickets": ["MANAGER", "DEVELOPER"],
    "pages.client_roadmap": ["CLIENT"],
    "features.create_ticket": ["MANAGER"],
    "features.assign_ticket": ["MANAGER"],
    "features.publish_ticket_roadmap": ["MANAGER"],
    "features.delete_ticket": ["MANAGER"],
};

async function main() {
    for (const perm of PERMISSIONS) {
        const permission = await prisma.permission.upsert({
            where: { code: perm.code },
            update: { name: perm.name, description: perm.description, category: perm.category },
            create: perm,
        });

        for (const role of GRANTS[perm.code] ?? []) {
            await prisma.rolePermission.upsert({
                where: { role_permissionId: { role, permissionId: permission.id } },
                update: { granted: true },
                create: { role, permissionId: permission.id, granted: true },
            });
        }

        console.log(`✅ ${perm.code} → ${(GRANTS[perm.code] ?? []).join(", ") || "aucun rôle"}`);
    }

    console.log("\n🎉 Permissions Support Technique en place. Rafraîchissez le navigateur.");
}

main()
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
