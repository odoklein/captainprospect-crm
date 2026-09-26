const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const HR_PERMISSIONS = [
  { code: "pages.hr", name: "Page RH", description: "Accès à la gestion RH et tableau de bord de l'équipe", category: "pages" },
  { code: "features.hr_view", name: "Consulter les données RH", description: "Consulter le tableau mensuel et les métriques de l'équipe", category: "features" },
  { code: "features.hr_configure", name: "Configurer les profils RH", description: "Modifier le salaire fixe, le quota et la prime variable", category: "features" },
  { code: "features.hr_calculate", name: "Calculer les mois RH", description: "Calculer ou recalculer les montants dus pour un mois", category: "features" },
  { code: "features.hr_validate", name: "Valider les mois RH", description: "Valider et verrouiller un mois RH", category: "features" },
  { code: "features.hr_day_decision", name: "Décider sur journées sous quota", description: "Marquer payé ou non payé avec motif", category: "features" },
  { code: "features.hr_reopen", name: "Réouvrir un mois RH", description: "Déverrouiller un mois précédemment validé", category: "features" },
];

async function main() {
  console.log("Seeding HR permissions...");

  for (const perm of HR_PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description, category: perm.category },
      create: perm,
    });

    // Grant to MANAGER
    await prisma.rolePermission.upsert({
      where: {
        role_permissionId: {
          role: "MANAGER",
          permissionId: created.id,
        },
      },
      update: { granted: true },
      create: {
        role: "MANAGER",
        permissionId: created.id,
        granted: true,
      },
    });

    console.log(`✓ Permission ${perm.code} created & granted to MANAGER`);
  }

  console.log("HR permissions seeded successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
