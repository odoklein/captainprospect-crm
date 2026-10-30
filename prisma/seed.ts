import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
// Permissions, role permissions, result categories and GLOBAL statuses live in
// ./reference-data, shared with prisma/seed-instance.ts.
import { seedActionStatusDefinitions, seedPermissions, seedResultCategories } from "./reference-data";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding database...");

    // Hash password for all test users
    const password = await bcrypt.hash("test123", 10);

    // Create test client (company)
    const client = await prisma.client.upsert({
        where: { id: "client-001" },
        update: {},
        create: {
            id: "client-001",
            name: "TechCorp Solutions",
            email: "contact@techcorp.com",
        },
    });
    console.log("✅ Created client:", client.name);

    // Create SDR user
    const sdr = await prisma.user.upsert({
        where: { email: "sdr@suzali.com" },
        update: {},
        create: {
            email: "sdr@suzali.com",
            password,
            name: "Marie Laurent",
            role: "SDR",
        },
    });
    console.log("✅ Created SDR user:", sdr.email);

    // Create Manager user
    const manager = await prisma.user.upsert({
        where: { email: "manager@suzali.com" },
        update: {},
        create: {
            email: "manager@suzali.com",
            password,
            name: "Thomas Durand",
            role: "MANAGER",
        },
    });
    console.log("✅ Created Manager user:", manager.email);

    // Create Client user
    const clientUser = await prisma.user.upsert({
        where: { email: "client@techcorp.com" },
        update: {},
        create: {
            email: "client@techcorp.com",
            password,
            name: "Jean Dupont",
            role: "CLIENT",
            clientId: client.id,
        },
    });
    console.log("✅ Created Client user:", clientUser.email);

    // Create a mission
    const mission = await prisma.mission.upsert({
        where: { id: "mission-001" },
        update: {},
        create: {
            id: "mission-001",
            clientId: client.id,
            name: "Prospection SaaS Q1 2026",
            objective: "Générer 50 meetings qualifiés",
            channel: "CALL",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-03-31"),
            isActive: true,
        },
    });
    console.log("✅ Created mission:", mission.name);

    // Assign SDR to mission
    await prisma.sDRAssignment.upsert({
        where: {
            missionId_sdrId: {
                missionId: mission.id,
                sdrId: sdr.id,
            },
        },
        update: {},
        create: {
            missionId: mission.id,
            sdrId: sdr.id,
        },
    });
    console.log("✅ Assigned SDR to mission");

    // Create a campaign
    const campaign = await prisma.campaign.upsert({
        where: { id: "campaign-001" },
        update: {},
        create: {
            id: "campaign-001",
            missionId: mission.id,
            name: "Outbound Calls - Tech Startups",
            icp: "Tech startups, 10-50 employees, Series A/B",
            pitch: "Bonjour, je vous appelle de la part de TechCorp. Je souhaitais échanger quelques minutes concernant vos besoins en solutions digitales.",
            script: "1. Introduction\n2. Qualification du besoin\n3. Proposition de RDV\n4. Confirmation",
            isActive: true,
        },
    });
    console.log("✅ Created campaign:", campaign.name);

    // Create a list
    const list = await prisma.list.upsert({
        where: { id: "list-001" },
        update: {},
        create: {
            id: "list-001",
            missionId: mission.id,
            name: "Tech Startups France",
            type: "SUZALI",
            source: "Apollo",
        },
    });
    console.log("✅ Created list:", list.name);

    // Create sample companies and contacts
    const companies = [
        { name: "Innovatech", country: "France", industry: "SaaS" },
        { name: "DataFlow", country: "France", industry: "Analytics" },
        { name: "CloudNine", country: "France", industry: "Cloud" },
    ];

    for (const companyData of companies) {
        const company = await prisma.company.create({
            data: {
                listId: list.id,
                name: companyData.name,
                country: companyData.country,
                industry: companyData.industry,
                status: "ACTIONABLE",
            },
        });

        // Create a contact for each company
        await prisma.contact.create({
            data: {
                companyId: company.id,
                firstName: "Contact",
                lastName: companyData.name,
                title: "CEO",
                email: `contact@${companyData.name.toLowerCase()}.com`,
                phone: "+33 6 12 34 56 78",
                status: "ACTIONABLE",
            },
        });
    }
    console.log("✅ Created 3 companies with contacts");

    // Seed GLOBAL action status definitions (config-driven workflow defaults)
    await seedResultCategories(prisma);
    await seedActionStatusDefinitions(prisma);

    // Seed permissions
    await seedPermissions(prisma);

    // Seed CompanyIssuer (Suzali Conseil)
    const companyIssuer = await prisma.companyIssuer.upsert({
        where: { siret: "12345678901234" }, // Replace with actual SIRET
        update: {},
        create: {
            legalName: "Suzali Conseil",
            address: "123 Rue de la République",
            city: "Paris",
            postalCode: "75001",
            country: "France",
            siret: "12345678901234", // Replace with actual SIRET
            vatNumber: "FR12345678901", // Replace with actual VAT number
            email: "contact@suzali.fr",
            phone: "+33 1 23 45 67 89",
        },
    });
    console.log("✅ Created CompanyIssuer:", companyIssuer.legalName);

    console.log("\n🎉 Seeding complete!\n");
    console.log("📋 Test Credentials:");
    console.log("─────────────────────────────────────");
    console.log("SDR:      sdr@suzali.com / test123");
    console.log("Manager:  manager@suzali.com / test123");
    console.log("Client:   client@techcorp.com / test123");
    console.log("─────────────────────────────────────\n");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
